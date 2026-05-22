import base64
import json
import logging
import os
import sys
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv()  # 本機開發載入 .env；生產環境（Azure）env vars 已由 App Service 注入，為 no-op

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

# ── Structured logging ─────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":"%(message)s"}',
    datefmt="%Y-%m-%dT%H:%M:%S",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)


# ── Lifespan ───────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    from services.firestore import db  # noqa: F401 — 觸發 lazy Firebase init
    from services.shioaji_service import manager as sj_manager, is_shioaji_enabled
    logger.info("finance-backend-py starting up")
    if is_shioaji_enabled():
        try:
            await sj_manager.initialize()
        except Exception as e:
            logger.warning("Shioaji init failed, falling back to Yahoo Finance: %s", e)
    else:
        logger.info("Shioaji not configured, using Yahoo Finance only")
    yield
    if is_shioaji_enabled():
        await sj_manager.shutdown()
    logger.info("finance-backend-py shutting down")


# ── App ────────────────────────────────────────────────────────────────────────
app = FastAPI(title="finance-backend-py", version="1.0.0", lifespan=lifespan)


# ── Easy Auth Middleware ───────────────────────────────────────────────────────
_SKIP_AUTH = os.getenv("SKIP_AUTH", "false").lower() == "true"

_AUTH_SKIP_PATHS = {"/health", "/docs", "/openapi.json", "/redoc"}


class EasyAuthMiddleware(BaseHTTPMiddleware):
    """
    讀取 Azure Easy Auth 注入的 X-MS-CLIENT-PRINCIPAL header，
    解碼後將 userId 存至 request.state.user_id 供各 router 使用。
    本機開發時設 SKIP_AUTH=true 跳過驗證。
    """

    async def dispatch(self, request: Request, call_next):
        if _SKIP_AUTH or request.url.path in _AUTH_SKIP_PATHS:
            request.state.user_id = "dev"
            return await call_next(request)

        header = request.headers.get("X-MS-CLIENT-PRINCIPAL")
        if not header:
            return JSONResponse(
                status_code=401,
                content={"success": False, "error": "Unauthorized"},
            )
        try:
            principal = json.loads(base64.b64decode(header).decode("utf-8"))
            request.state.user_id = (
                principal.get("userId") or principal.get("sub") or ""
            )
        except Exception:
            return JSONResponse(
                status_code=401,
                content={"success": False, "error": "Invalid auth token"},
            )

        return await call_next(request)


# 注意：add_middleware 後加者為最外層。
# EasyAuth 先加（內層）→ CORS 後加（最外層），確保 401 response 也帶 CORS headers
app.add_middleware(EasyAuthMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request logging ────────────────────────────────────────────────────────────
@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info("%s %s", request.method, request.url.path)
    response = await call_next(request)
    logger.info("%s %s → %s", request.method, request.url.path, response.status_code)
    return response


# ── Unified error handlers ─────────────────────────────────────────────────────
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "error": exc.detail},
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(
        status_code=500,
        content={"success": False, "error": "Internal server error"},
    )


# ── Health probe（Azure warmup / readiness）────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok"}


# ── Routers ────────────────────────────────────────────────────────────────────
from routers import holdings, watchlist, transactions, assets, plans  # noqa: E402
from routers import tags, market_state, correlation, rebalance        # noqa: E402
from routers import market, stocks                                     # noqa: E402
from routers import snapshots, settings, preferences                   # noqa: E402
from routers import mcp                                                # noqa: E402

# M2
app.include_router(holdings.router,     prefix="/api/v1/holdings",                tags=["Holdings"])
app.include_router(watchlist.router,    prefix="/api/v1/watchlist",                tags=["Watchlist"])
app.include_router(transactions.router, prefix="/api/v1/transactions",             tags=["Transactions"])
app.include_router(assets.router,       prefix="/api/v1/foreign-assets",           tags=["ForeignAssets"])
app.include_router(plans.router,        prefix="/api/v1/plan",                     tags=["Plan"])
# M3
app.include_router(tags.router,         prefix="/api/v1/tags",                     tags=["Tags"])
app.include_router(market_state.router, prefix="/api/v1/market-state",             tags=["MarketState"])
app.include_router(correlation.router,  prefix="/api/v1/tag-correlation-matrix",   tags=["Correlation"])
app.include_router(rebalance.router,    prefix="/api/v1",                          tags=["Rebalance"])
# M4
app.include_router(market.router,       prefix="/api/v1/market",                   tags=["Market"])
app.include_router(stocks.router,       prefix="/api/v1/stocks",                   tags=["Stocks"])
# M5
app.include_router(snapshots.router,    prefix="/api/v1/snapshots",                tags=["Snapshots"])
app.include_router(settings.router,     prefix="/api/v1/settings",                 tags=["Settings"])
app.include_router(preferences.router,  prefix="/api/v1/preferences",              tags=["Preferences"])
# M6
app.include_router(mcp.router,          prefix="/api/v1/mcp",                      tags=["MCP"])
