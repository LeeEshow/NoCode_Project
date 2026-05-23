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
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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
    try:
        import asyncio
        from services.firestore import get_db
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: get_db().collection("holdings").limit(1).get())
        logger.info("Firestore warm-up OK")
    except Exception as e:
        logger.warning("Firestore warm-up failed: %s", e)
    yield


# ── App ────────────────────────────────────────────────────────────────────────
app = FastAPI(title="finance-backend-py", version="1.0.0", lifespan=lifespan)


# ── EasyAuth Middleware ────────────────────────────────────────────────────────
_SKIP_AUTH = os.getenv("SKIP_AUTH", "false").lower() == "true"
_CRON_SECRET = os.getenv("CRON_SECRET", "")
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
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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


# ── Routers ────────────────────────────────────────────────────────────────────
from routers import holdings, watchlist, transactions, assets, plans
from routers import tags, market_state, correlation, market, stocks
from routers import snapshots, settings, preferences, asset_tags, system
from routers.rebalance import rules_router, snapshots_router
from routers import mcp

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
app.include_router(system.router,       prefix=f"{API}/system",                 tags=["System"])
app.include_router(mcp.router,          prefix=f"{API}/mcp",                    tags=["MCP"])


# ── Health probe ───────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "uptime": time.time()}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
