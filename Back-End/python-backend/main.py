import base64
import json
import logging
import os
import sys
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


# ── Lifespan ───────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    import asyncio

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
                # 注意：warmup_stocks 內的 subscribe_stocks → asyncio.to_thread 在
                # Python 3.14 環境下 cancel 不可靠（shioaji quote.subscribe 阻塞 ack）。
                # 改為背景執行，讓 uvicorn 先 yield 開始接受連線，
                # cache 由 warmup 完成後或後續 tick push 自動填充。
                asyncio.ensure_future(_sj.warmup_stocks(stock_ids))
                logger.info("Shioaji warmup started in background (%d stocks)", len(stock_ids))
        except Exception as e:
            logger.warning("Shioaji warmup failed (non-critical): %s", e)

    yield

    # ── Shioaji shutdown ──────────────────────────────────────────────────────
    try:
        from services.shioaji_manager import shioaji_manager
        await shioaji_manager.shutdown()
    except Exception:
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
