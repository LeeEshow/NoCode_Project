from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone, time as dt_time
from collections import defaultdict
from fastapi import FastAPI, HTTPException
from dotenv import load_dotenv
import shioaji as sj
import os

load_dotenv()

_api: sj.Shioaji | None = None
_TZ_TW = timezone(timedelta(hours=8))

# SJ_SIMULATION=true → 模擬環境；預設正式環境
_SIMULATION: bool = os.environ.get("SJ_SIMULATION", "false").lower() == "true"


def _startup_login() -> sj.Shioaji:
    """登入並執行正式環境啟動驗證，回傳已登入的 api 實例。"""
    api = sj.Shioaji(simulation=_SIMULATION)
    accounts = api.login(
        api_key=os.environ["SJ_API_KEY"],
        secret_key=os.environ["SJ_SECRET_KEY"],
        fetch_contract=False,
    )

    mode_label = "模擬環境" if _SIMULATION else "正式環境"
    print(f"[shioaji] {mode_label} 登入成功，帳號數：{len(accounts)}")

    if not _SIMULATION:
        # 正式環境：確認所有帳號 signed=True
        unsigned = [
            getattr(acc, "account_id", str(acc))
            for acc in accounts
            if not getattr(acc, "signed", False)
        ]
        if unsigned:
            print(
                f"[shioaji] ⚠️  以下帳號 signed=False，尚未完成 API 測試簽署："
                f" {unsigned}"
            )
            print(
                "[shioaji]    → 請執行 python verify_env.py 完成驗證後再啟動正式服務"
            )
        else:
            print("[shioaji] ✅ 所有帳號 signed=True")

        # 正式環境：若有提供 CA 憑證設定則自動啟用
        ca_path   = os.environ.get("SJ_CA_PATH")
        ca_passwd = os.environ.get("SJ_CA_PASSWD")
        person_id = os.environ.get("SJ_PERSON_ID")
        if ca_path and ca_passwd and person_id:
            try:
                result = api.activate_ca(
                    ca_path=ca_path,
                    ca_passwd=ca_passwd,
                    person_id=person_id,
                )
                print(f"[shioaji] ✅ CA 憑證啟用：{result}")
            except Exception as exc:
                print(f"[shioaji] ⚠️  CA 憑證啟用失敗：{exc}")

    return api


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _api
    _api = _startup_login()
    _api.fetch_contracts(contract_download=True)
    yield
    _api.logout()


app = FastAPI(lifespan=lifespan)


def _market_status() -> str:
    now = datetime.now(tz=_TZ_TW)
    if now.weekday() >= 5:
        return "CLOSED"
    t = now.time()
    return "OPEN" if dt_time(9, 0) <= t <= dt_time(13, 30) else "CLOSED"


# ── Health ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


# ── 股票清單 ────────────────────────────────────────────────────────────────

@app.get("/stocks")
def get_all_stocks():
    return [
        {"stockId": c.code, "name": c.name, "market": c.exchange}
        for c in _api.Contracts.Stocks
    ]


# ── 即時快照 ────────────────────────────────────────────────────────────────

@app.get("/stocks/{code}/snapshot")
def get_snapshot(code: str):
    try:
        contract = _api.Contracts.Stocks[code]
    except (KeyError, TypeError):
        raise HTTPException(404, f"Stock {code} not found")

    snaps = _api.snapshots([contract])
    if not snaps:
        raise HTTPException(503, "No snapshot data")

    snap = snaps[0]
    return {
        "stockId": code,
        "name": contract.name,
        "price": snap.close,
        "change": round(snap.change_price, 2),
        "changePercent": round(snap.change_rate, 2),
        "open": snap.open,
        "high": snap.high,
        "low": snap.low,
        "volume": snap.total_volume,
        "marketStatus": _market_status(),
        "updatedAt": snap.ts // 1_000_000_000,  # ns → s
    }


# ── 歷史日K（從 1 分鐘 K 棒聚合） ─────────────────────────────────────────

@app.get("/stocks/{code}/kbars")
def get_kbars(code: str, days: int = 90):
    try:
        contract = _api.Contracts.Stocks[code]
    except (KeyError, TypeError):
        raise HTTPException(404, f"Stock {code} not found")

    end_dt = datetime.now(tz=_TZ_TW)
    # 多抓 50% buffer 以確保交易日足夠（台股一年約 250 個交易日）
    start_dt = end_dt - timedelta(days=int(days * 1.5) + 10)

    kbars = _api.kbars(
        contract=contract,
        start=start_dt.strftime("%Y-%m-%d"),
        end=end_dt.strftime("%Y-%m-%d"),
    )

    # 以台灣日期為 key，聚合成日K
    daily: dict[str, dict] = {}
    for i in range(len(kbars.ts)):
        dt = datetime.fromtimestamp(kbars.ts[i] / 1e9, tz=_TZ_TW)
        key = dt.strftime("%Y-%m-%d")

        if key not in daily:
            day_start = dt.replace(hour=0, minute=0, second=0, microsecond=0)
            daily[key] = {
                "timestamp": int(day_start.timestamp()),
                "open": kbars.Open[i],
                "high": kbars.High[i],
                "low": kbars.Low[i],
                "close": kbars.Close[i],
                "volume": kbars.Volume[i],
            }
        else:
            d = daily[key]
            d["high"] = max(d["high"], kbars.High[i])
            d["low"] = min(d["low"], kbars.Low[i])
            d["close"] = kbars.Close[i]  # 最後一根收盤價
            d["volume"] += kbars.Volume[i]

    sorted_bars = [daily[k] for k in sorted(daily.keys())]
    return sorted_bars[-days:] if len(sorted_bars) > days else sorted_bars


# ── Debug（暫時，確認合約載入狀態） ────────────────────────────────────────

# ── 大盤指數 ────────────────────────────────────────────────────────────────

@app.get("/market/twii")
def get_twii():
    try:
        snaps = _api.snapshots([_api.Contracts.Indexs.TSE["001"]])
        if not snaps:
            raise ValueError("empty")
        snap = snaps[0]
        return {
            "id": "twii",
            "name": "台股大盤",
            "price": snap.close,
            "change": round(snap.change_price, 2),
            "changePercent": round(snap.change_rate, 2),
        }
    except Exception as exc:
        print(f"[shioaji] ❌ get_twii error: {exc}")
        return {"id": "twii", "name": "台股大盤", "price": None, "change": None, "changePercent": None}


# ── 台指期（近月） ──────────────────────────────────────────────────────────

@app.get("/market/futures")
def get_futures():
    try:
        # 動態取得最近到期的台指期合約（symbol 格式 TXFyyyymm，排序後取最小）
        txf_contracts = list(_api.Contracts.Futures.TXF)
        if not txf_contracts:
            raise ValueError("no TXF contracts")
        near_month = min(txf_contracts, key=lambda c: c.symbol)
        snaps = _api.snapshots([near_month])
        if not snaps:
            raise ValueError("empty snapshot")
        snap = snaps[0]
        return {
            "id": "futures",
            "name": "台指期",
            "price": snap.close,
            "change": round(snap.change_price, 2),
            "changePercent": round(snap.change_rate, 2),
        }
    except Exception as exc:
        print(f"[shioaji] ❌ get_futures error: {exc}")
        return {"id": "futures", "name": "台指期", "price": None, "change": None, "changePercent": None}
