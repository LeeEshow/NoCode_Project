import os
import time
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

app = FastAPI()

# CORS — 最外層，確保 OPTIONS preflight 可通過
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# EasyAuth 驗證 middleware
# Azure App Service 會在請求到達前注入 X-MS-CLIENT-PRINCIPAL header
# EASY_AUTH_BYPASS=true 時（本機開發）跳過驗證
@app.middleware("http")
async def easy_auth_middleware(request: Request, call_next):
    bypass = os.getenv("EASY_AUTH_BYPASS", "").lower() in ("true", "1", "yes")
    skip = request.url.path == "/health" or request.method == "OPTIONS"

    if not bypass and not skip:
        if not request.headers.get("X-MS-CLIENT-PRINCIPAL"):
            return JSONResponse(
                status_code=401,
                content={"success": False, "error": "未授權：缺少 EasyAuth token"},
            )
    return await call_next(request)


# 統一錯誤格式
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "error": exc.detail},
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"success": False, "error": "伺服器內部錯誤"},
    )


from routers import holdings, watchlist, transactions, assets, plans
from routers import tags, market_state, correlation, market, stocks
from routers import snapshots, settings, preferences, asset_tags
from routers.rebalance import rules_router, snapshots_router

API = "/api/v1"
app.include_router(holdings.router,     prefix=f"{API}/holdings")
app.include_router(watchlist.router,    prefix=f"{API}/watchlist")
app.include_router(transactions.router, prefix=f"{API}/transactions")
app.include_router(assets.router,       prefix=f"{API}/foreign-assets")
app.include_router(plans.router,        prefix=f"{API}/plan")
app.include_router(tags.router,         prefix=f"{API}/tags")
app.include_router(market_state.router, prefix=f"{API}/market-state")
app.include_router(correlation.router,  prefix=f"{API}/tag-correlation-matrix")
app.include_router(rules_router,        prefix=f"{API}/rebalance-rules")
app.include_router(snapshots_router,    prefix=f"{API}/rebalance-snapshots")
app.include_router(market.router,       prefix=f"{API}/market")
app.include_router(stocks.router,       prefix=f"{API}/stocks")
app.include_router(snapshots.router,    prefix=f"{API}/snapshots")
app.include_router(settings.router,     prefix=f"{API}/settings")
app.include_router(preferences.router,  prefix=f"{API}/preferences")
app.include_router(asset_tags.router,   prefix=f"{API}/asset-tags")


# 健康探測端點（Azure warm-up probe，與 Node.js 一致）
@app.get("/health")
async def health():
    return {"status": "ok", "uptime": time.time()}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
