import asyncio
import base64
import json
import logging
import os
import signal
import socket
import sys
import threading
import time
from contextlib import asynccontextmanager
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from core.settings import get_settings as _get_settings
from starlette.middleware.base import BaseHTTPMiddleware

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='{"time":"%(asctime)s","level":"%(levelname)s","msg":"%(message)s"}',
    datefmt="%Y-%m-%dT%H:%M:%S",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)

# ── Event Loop Watchdog ────────────────────────────────────────────────────────
_heartbeat_ts: float = 0.0  # asyncio 協程每 5s 更新；OS thread 監控是否停止
_NOTIFY_SOCKET = os.environ.get("NOTIFY_SOCKET")  # systemd Type=notify 時由 systemd 注入

async def _heartbeat_loop() -> None:
    global _heartbeat_ts
    while True:
        _heartbeat_ts = time.monotonic()
        await asyncio.sleep(5)

def _http_healthy() -> bool:
    """用原始 socket 向 /health 發送一次 HTTP 請求，5s 內有 200 回應才算健康。"""
    import socket as _socket
    try:
        with _socket.create_connection(("127.0.0.1", 8000), timeout=5) as s:
            s.sendall(b"GET /health HTTP/1.0\r\nHost: localhost\r\n\r\n")
            return b"200" in s.recv(64)
    except Exception:
        return False


def _sd_notify(status: str) -> None:
    """透過 Unix Domain Socket 向 systemd 發送通知，純標準庫實作（免裝 python-systemd）。
    NOTIFY_SOCKET 未設定（非 systemd Type=notify 環境）時直接跳過。"""
    if not _NOTIFY_SOCKET:
        return
    addr = _NOTIFY_SOCKET
    if addr.startswith("@"):
        addr = "\x00" + addr[1:]  # abstract namespace socket
    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM) as s:
            s.connect(addr)
            s.sendall(status.encode("utf-8"))
    except Exception as e:
        logger.debug("sd_notify failed: %s", e)


async def _http_healthy_async(timeout: float = 5.0) -> bool:
    """非同步版 /health 檢查，維持與 _http_healthy 相同的嚴謹度（完整 HTTP GET
    並驗證 200 回應，不只是 TCP handshake——event loop 卡死時 kernel accept
    queue 仍可能自行完成三次握手，只測連線會有偽陽性）。不佔用共用
    _io_executor，避免跟業務邏輯搶 thread。"""
    writer = None
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection("127.0.0.1", 8000), timeout=timeout
        )
        writer.write(b"GET /health HTTP/1.0\r\nHost: localhost\r\n\r\n")
        await writer.drain()
        data = await asyncio.wait_for(reader.read(64), timeout=timeout)
        return b"200" in data
    except Exception:
        return False
    finally:
        if writer is not None:
            writer.close()
            try:
                await asyncio.wait_for(writer.wait_closed(), timeout=2)
            except Exception:
                pass


async def _sd_notify_loop() -> None:
    """systemd Type=notify 環境專用的外部監控回報迴圈。
    注意：GIL 死鎖時本協程會直接停止被排程執行，並非「偵測到卡住後主動停止」
    ——process 內部沒有任何程式碼能在 GIL 死鎖當下判斷自己被卡住。真正動手
    重啟的是 systemd 在進程外部依 WatchdogSec 逾時，這個因果順序不要寫反。"""
    _sd_notify("READY=1\nSTATUS=Application initialized")
    logger.info("Systemd NOTIFY_SOCKET detected, external watchdog enabled")
    await asyncio.sleep(15)  # 等 uvicorn listen socket 完全穩定，避免啟動瞬間偽陽性失敗
    http_fail = 0
    while True:
        if await _http_healthy_async():
            http_fail = 0
            _sd_notify("WATCHDOG=1\nSTATUS=Healthy")
        else:
            http_fail += 1
            logger.warning("sd_notify: HTTP health check failed (%d/3)", http_fail)
            if http_fail < 3:
                _sd_notify("WATCHDOG=1\nSTATUS=Warning: HTTP health check failed")
            else:
                logger.critical(
                    "HTTP health check failed 3 consecutive times! Stopping WATCHDOG=1, "
                    "systemd will force-restart within WatchdogSec."
                )
        await asyncio.sleep(15)


def _watchdog_thread(threshold: float = 90.0) -> None:
    """雙重防護：
    1. asyncio heartbeat 超過 threshold 秒未更新 → event loop 卡死
    2. HTTP /health 連續 3 次不回應 → uvicorn 不接連線（executor 滿等）
    任一觸發即發 SIGTERM，讓 systemd Restart=always 自動重啟。"""
    time.sleep(60)  # 等候啟動初始化完成
    http_fail = 0
    while True:
        time.sleep(15)
        # 檢查一：asyncio event loop heartbeat
        if _heartbeat_ts > 0 and (time.monotonic() - _heartbeat_ts) > threshold:
            logger.critical(
                "Event loop heartbeat timeout (%.0fs)! Sending SIGTERM.",
                time.monotonic() - _heartbeat_ts,
            )
            os.kill(os.getpid(), signal.SIGTERM)
            return
        # 檢查二：HTTP /health 可達性
        if _http_healthy():
            http_fail = 0
        else:
            http_fail += 1
            logger.warning("Watchdog: HTTP health check failed (%d/3)", http_fail)
            if http_fail >= 3:
                logger.critical("HTTP health check failed 3 consecutive times! Sending SIGTERM.")
                os.kill(os.getpid(), signal.SIGTERM)
                return


# ── Lifespan ───────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── 統一 Thread Pool：將 asyncio default executor 換成共用 _io_executor ────
    # 預設 executor 在 Azure B1（1 vCPU）只有 5 workers；run_in_executor(None, …)
    # 遍佈 market.py / quote_service.py，不換會有兩個互不相知的 pool。
    from core.executors import get_executor
    loop = asyncio.get_running_loop()
    loop.set_default_executor(get_executor())

    # ── Firestore warm-up ─────────────────────────────────────────────────────
    try:
        from services.firestore import get_db
        await asyncio.wait_for(
            loop.run_in_executor(None, lambda: get_db().collection("holdings").limit(1).get()),
            timeout=10,
        )
        logger.info("Firestore warm-up OK")
    except Exception as e:
        logger.warning("Firestore warm-up failed: %s", e)

    # ── Shioaji initialization（SJ_API_KEY 有設定才執行）───────────────────────
    from services.api_switch import shioaji_enabled
    if shioaji_enabled():
        try:
            from services.shioaji_manager import shioaji_manager
            s = _get_settings()
            await asyncio.wait_for(
                shioaji_manager.initialize(s.sj_api_key, s.sj_secret_key),
                timeout=15,
            )
            logger.info("Shioaji initialized at startup")
        except Exception as e:
            logger.warning("Shioaji startup initialization failed: %s", e)

    # ── Shioaji 個股暖身（訂閱持股 + 關注清單 tick，並呼叫一次 snapshot 填充 cache）
    from services.api_switch import shioaji_enabled as _sj_enabled
    _warmup_task = None
    if _sj_enabled():
        try:
            from services.shioaji_manager import shioaji_manager as _sj
            if _sj.initialized:
                from services.firestore import get_db as _get_db

                def _read_stock_ids() -> list[str]:
                    db = _get_db()
                    holdings  = db.collection("holdings").get()
                    watchlist = db.collection("watchlist").get()
                    return list({doc.id for doc in list(holdings) + list(watchlist) if doc.exists})

                stock_ids = await asyncio.wait_for(
                    loop.run_in_executor(None, _read_stock_ids),
                    timeout=10,
                )
                _warmup_task = asyncio.ensure_future(_sj.warmup_stocks(stock_ids))
                logger.info("Shioaji warmup started in background (%d stocks)", len(stock_ids))
        except Exception as e:
            logger.warning("Shioaji warmup failed (non-critical): %s", e)

    # ── Event loop watchdog 啟動 ─────────────────────────────────────────────
    # 有 systemd NOTIFY_SOCKET（Type=notify）時改用外部 sd_notify watchdog：
    # 進程內 watchdog thread 一樣需要 GIL 才能執行 os.kill()，GIL 死鎖時會跟
    # 主程式一起被凍結，無法真正兜底；systemd 在進程外部偵測逾時不受影響。
    _heartbeat_task = asyncio.ensure_future(_heartbeat_loop())
    _sd_notify_task = None
    if _NOTIFY_SOCKET:
        _sd_notify_task = asyncio.ensure_future(_sd_notify_loop())
        logger.info("Running under systemd Type=notify; external watchdog active (WatchdogSec)")
    else:
        threading.Thread(target=_watchdog_thread, daemon=True, name="el-watchdog").start()
        logger.info("Event loop watchdog started (threshold=90s, local in-process mode)")

    yield

    # ── Shioaji shutdown ──────────────────────────────────────────────────────
    _heartbeat_task.cancel()
    if _sd_notify_task is not None:
        _sd_notify_task.cancel()
    if _warmup_task is not None and not _warmup_task.done():
        _warmup_task.cancel()
        try:
            await asyncio.wait_for(_warmup_task, timeout=5)
        except (asyncio.CancelledError, asyncio.TimeoutError, Exception):
            pass
    try:
        from services.shioaji_manager import shioaji_manager
        await asyncio.wait_for(shioaji_manager.shutdown(), timeout=10)
    except (asyncio.TimeoutError, Exception):
        pass


# ── App ────────────────────────────────────────────────────────────────────────
app = FastAPI(title="finance-backend-py", version="1.0.0", lifespan=lifespan)


# ── EasyAuth Middleware ────────────────────────────────────────────────────────
_s = _get_settings()
_SKIP_AUTH   = _s.skip_auth
_CRON_SECRET = _s.cron_secret
_AUTH_SKIP_PATHS = {"/health", "/docs", "/openapi.json", "/redoc"}


class EasyAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if _SKIP_AUTH or request.url.path in _AUTH_SKIP_PATHS or request.method == "OPTIONS":
            request.state.user_id = "dev"
            return await call_next(request)

        if request.url.path.startswith("/api/v1/mcp/"):
            return await call_next(request)

        # 排程工作（每日快照、AI 報告）以 X-Cron-Token 繞過 EasyAuth
        if _CRON_SECRET and request.headers.get("X-Cron-Token") == _CRON_SECRET:
            request.state.user_id = "cron"
            return await call_next(request)

        header = request.headers.get("X-MS-CLIENT-PRINCIPAL")
        if not header:
            return JSONResponse(
                status_code=401,
                content={"success": False, "error": "Unauthorized"},
            )
        try:
            principal = json.loads(base64.b64decode(header).decode("utf-8"))
            request.state.user_id = principal.get("userId") or principal.get("sub") or ""
        except Exception:
            return JSONResponse(
                status_code=401,
                content={"success": False, "error": "Invalid auth token"},
            )
        return await call_next(request)


# 注意：add_middleware 後加者為最外層
# EasyAuth 先加（內層）→ CORS 後加（最外層），確保 401 response 也帶 CORS headers
app.add_middleware(EasyAuthMiddleware)

_allowed_origins = [o.strip() for o in _s.allowed_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Error handlers ─────────────────────────────────────────────────────────────
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "error": exc.detail},
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error: %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"success": False, "error": "Internal server error"},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"success": False, "error": str(exc.errors())},
    )


# ── Routers ────────────────────────────────────────────────────────────────────
from routers import holdings, watchlist, transactions, assets, plans
from routers import tags, market_state, correlation, market, stocks
from routers import snapshots, settings, preferences, asset_tags, system
from routers.rebalance import rules_router, snapshots_router
from routers import mcp, finmind_sync, trading_strategies

API = "/api/v1"
app.include_router(holdings.router,     prefix=f"{API}/holdings",              tags=["Holdings"])
app.include_router(watchlist.router,    prefix=f"{API}/watchlist",              tags=["Watchlist"])
app.include_router(transactions.router, prefix=f"{API}/transactions",           tags=["Transactions"])
app.include_router(assets.router,       prefix=f"{API}/foreign-assets",         tags=["ForeignAssets"])
app.include_router(plans.router,        prefix=f"{API}/plan",                   tags=["Plan"])
app.include_router(tags.router,         prefix=f"{API}/tags",                   tags=["Tags"])
app.include_router(market_state.router, prefix=f"{API}/market-state",           tags=["MarketState"])
app.include_router(correlation.router,  prefix=f"{API}/tag-correlation-matrix", tags=["Correlation"])
app.include_router(rules_router,        prefix=f"{API}/rebalance-rules",        tags=["Rebalance"])
app.include_router(snapshots_router,    prefix=f"{API}/rebalance-snapshots",    tags=["Rebalance"])
app.include_router(market.router,       prefix=f"{API}/market",                 tags=["Market"])
app.include_router(stocks.router,       prefix=f"{API}/stocks",                 tags=["Stocks"])
app.include_router(snapshots.router,    prefix=f"{API}/snapshots",              tags=["Snapshots"])
app.include_router(settings.router,     prefix=f"{API}/settings",               tags=["Settings"])
app.include_router(preferences.router,  prefix=f"{API}/preferences",            tags=["Preferences"])
app.include_router(asset_tags.router,   prefix=f"{API}/asset-tags",             tags=["AssetTags"])
app.include_router(system.router,        prefix=f"{API}/system",                tags=["System"])
app.include_router(mcp.router,                 prefix=f"{API}/mcp",                   tags=["MCP"])
app.include_router(finmind_sync.router,        prefix=f"{API}/finmind",               tags=["FinMind"])
app.include_router(trading_strategies.router,  prefix=f"{API}/trading-strategies",    tags=["TradingStrategies"])


# ── Health probe ───────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "uptime": time.time()}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=_s.port, reload=True)
