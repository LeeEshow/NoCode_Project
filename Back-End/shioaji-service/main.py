from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone, time as dt_time
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
import shioaji as sj
import os

load_dotenv()

from lib.shioaji_state import set_api
import lib.api_response as R

_TZ_TW     = timezone(timedelta(hours=8))
_SIMULATION = os.environ.get("SJ_SIMULATION", "false").lower() == "true"


def _startup_login() -> sj.Shioaji:
    api = sj.Shioaji(simulation=_SIMULATION)
    accounts = api.login(
        api_key=os.environ["SJ_API_KEY"],
        secret_key=os.environ["SJ_SECRET_KEY"],
        fetch_contract=False,
    )
    mode_label = "模擬環境" if _SIMULATION else "正式環境"
    print(f"[shioaji] {mode_label} 登入成功，帳號數：{len(accounts)}")

    if not _SIMULATION:
        unsigned = [
            getattr(acc, "account_id", str(acc))
            for acc in accounts
            if not getattr(acc, "signed", False)
        ]
        if unsigned:
            print(f"[shioaji] ⚠️  以下帳號 signed=False：{unsigned}")
        else:
            print("[shioaji] ✅ 所有帳號 signed=True")

        ca_path   = os.environ.get("SJ_CA_PATH")
        ca_passwd = os.environ.get("SJ_CA_PASSWD")
        person_id = os.environ.get("SJ_PERSON_ID")
        if ca_path and ca_passwd and person_id:
            try:
                result = api.activate_ca(ca_path=ca_path, ca_passwd=ca_passwd, person_id=person_id)
                print(f"[shioaji] ✅ CA 憑證啟用：{result}")
            except Exception as exc:
                print(f"[shioaji] ⚠️  CA 憑證啟用失敗：{exc}")

    return api


@asynccontextmanager
async def lifespan(app: FastAPI):
    api = _startup_login()
    api.fetch_contracts(contract_download=True)
    set_api(api)
    yield
    api.logout()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# 統一錯誤回應格式 → { success: false, error: "..." }
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content=R.error(exc.detail),
    )

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    print(f"[server] ❌ Unhandled error: {exc}")
    return JSONResponse(status_code=500, content=R.error("內部伺服器錯誤"))


# ── 路由掛載（/api/v1） ──────────────────────────────────────────────────────

from routers import (
    stocks, market, holdings, transactions, watchlist,
    foreign_assets, snapshots, plan, settings, preferences,
    bonds, foreign_currencies,
)

PREFIX = "/api/v1"

app.include_router(stocks.router,              prefix=f"{PREFIX}/stocks")
app.include_router(market.router,              prefix=f"{PREFIX}/market")
app.include_router(holdings.router,            prefix=f"{PREFIX}/holdings")
app.include_router(transactions.router,        prefix=f"{PREFIX}/transactions")
app.include_router(watchlist.router,           prefix=f"{PREFIX}/watchlist")
app.include_router(foreign_assets.router,      prefix=f"{PREFIX}/foreign-assets")
app.include_router(snapshots.router,           prefix=f"{PREFIX}/snapshots")
app.include_router(plan.router,                prefix=f"{PREFIX}/plan")
app.include_router(settings.router,            prefix=f"{PREFIX}/settings")
app.include_router(preferences.router,         prefix=f"{PREFIX}/preferences")
app.include_router(bonds.router,               prefix=f"{PREFIX}/bonds")
app.include_router(foreign_currencies.router,  prefix=f"{PREFIX}/foreign-currencies")


# ── 健康檢查 ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


# ── 內部 Shioaji 端點（供維運 debug 用） ─────────────────────────────────────

def _market_status() -> str:
    now = datetime.now(tz=_TZ_TW)
    if now.weekday() >= 5:
        return "CLOSED"
    t = now.time()
    return "OPEN" if dt_time(9, 0) <= t <= dt_time(13, 30) else "CLOSED"


@app.get("/internal/stocks")
def internal_get_stocks():
    from lib.shioaji_state import get_api
    api = get_api()
    return [{"stockId": c.code, "name": c.name, "market": c.exchange} for c in api.Contracts.Stocks]


@app.get("/internal/market/twii")
def internal_twii():
    from lib.shioaji_state import get_api
    api = get_api()
    try:
        snaps = api.snapshots([api.Contracts.Indexs.TSE["001"]])
        snap  = snaps[0]
        return {"id": "twii", "name": "台股大盤",
                "price": snap.close, "change": round(snap.change_price, 2),
                "changePercent": round(snap.change_rate, 2)}
    except Exception as exc:
        return {"id": "twii", "name": "台股大盤", "price": None, "change": None, "changePercent": None}


@app.get("/internal/market/futures")
def internal_futures():
    from lib.shioaji_state import get_api
    api = get_api()
    try:
        txf_contracts = list(api.Contracts.Futures.TXF)
        near_month    = min(txf_contracts, key=lambda c: c.symbol)
        snaps         = api.snapshots([near_month])
        snap          = snaps[0]
        return {"id": "futures", "name": "台指期",
                "price": snap.close, "change": round(snap.change_price, 2),
                "changePercent": round(snap.change_rate, 2)}
    except Exception:
        return {"id": "futures", "name": "台指期", "price": None, "change": None, "changePercent": None}


# ── 啟動入口（python main.py） ────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 3001))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
