"""每日快照自動記錄服務（對應 Node.js snapshotsController.record）"""
import asyncio
from datetime import datetime, timezone, timedelta
from google.cloud.firestore_v1.base_query import FieldFilter
from services.firestore import get_db
from services.rate_helper import get_live_rate_map
from services.yahoo_finance import get_quote, _f, _yf_chart


def _taiwan_date_str() -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=8)).strftime("%Y-%m-%d")


def _get_vix() -> tuple:
    """取得 VIX 並換算 marketStateAuto，失敗回傳 (None, None)"""
    try:
        data = _yf_chart("^VIX", "1d", "5d")
        closes = data.get("indicators", {}).get("quote", [{}])[0].get("close", [])
        valid = [c for c in closes if c is not None]
        if not valid:
            return None, None
        last = float(valid[-1])
        if last < 20:
            state = "risk-on"
        elif last <= 30:
            state = "neutral"
        else:
            state = "risk-off"
        return last, state
    except Exception:
        return None, None


async def record_snapshot() -> dict:
    """計算並寫入當日快照（冪等 merge）

    修正：不再使用 executor 嵌套（Rule D 違規）。
    所有 Firestore 同步操作透過 asyncio.to_thread() offload，
    VIX + 各股報價以 asyncio.gather() 並行取得。
    """
    db = get_db()
    today = _taiwan_date_str()
    current_year = int(today[:4])

    # 讀取 holdings
    holdings_snap = await asyncio.to_thread(lambda: db.collection("holdings").get())
    holdings = []
    for doc in holdings_snap:
        d = doc.to_dict()
        holdings.append({
            "stockId":    d.get("stock_id", doc.id),
            "stockName":  d.get("stock_name", ""),
            "sharesHeld": float(d.get("shares_held", 0)),
            "avgCost":    float(d.get("avg_cost", 0)),
        })
    active = [h for h in holdings if h["sharesHeld"] > 0]

    # 並行讀取 foreign_assets / 匯率 / 前一年快照 / 最新快照 / planConfig
    (
        assets_snap,
        rate_map,
        prev_year_snap,
        latest_snap,
        plan_doc,
    ) = await asyncio.gather(
        asyncio.to_thread(lambda: db.collection("foreign_assets").get()),
        asyncio.to_thread(get_live_rate_map),
        asyncio.to_thread(lambda: (
            db.collection("daily_snapshots")
            .where(filter=FieldFilter("date", ">=", f"{current_year - 1}-01-01"))
            .where(filter=FieldFilter("date", "<=", f"{current_year - 1}-12-31"))
            .order_by("date", direction="DESCENDING")
            .limit(1)
            .get()
        )),
        asyncio.to_thread(lambda: (
            db.collection("daily_snapshots")
            .order_by("date", direction="DESCENDING")
            .limit(1)
            .get()
        )),
        asyncio.to_thread(lambda: db.collection("plan_config").document("main").get()),
    )

    foreign_assets = [doc.to_dict() for doc in assets_snap]

    prev_data    = prev_year_snap[0].to_dict() if prev_year_snap else {}
    exec_capital = (
        (prev_data.get("stock_value", 0) or 0)
        + (prev_data.get("forex_value", 0) or 0)
        + (prev_data.get("cash_balance", 0) or 0)
    ) if prev_data else 0

    cash_balance = latest_snap[0].to_dict().get("cash_balance", 0) if latest_snap else 0
    reinvest     = float(plan_doc.to_dict().get("current_year_reinvest", 0)) if plan_doc.exists else 0

    # 並行取 VIX + 各股報價（asyncio.to_thread，不再嵌套 executor）
    needed_ids = [h["stockId"] for h in active]
    tasks = [asyncio.to_thread(_get_vix)] + [
        asyncio.to_thread(get_quote, sid) for sid in needed_ids
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    vix_result          = results[0]
    vix, market_state_auto = (
        vix_result if not isinstance(vix_result, Exception) else (None, None)
    )

    quotes: dict[str, dict] = {}
    for sid, result in zip(needed_ids, results[1:]):
        if not isinstance(result, Exception):
            quotes[sid] = result

    # 計算 stockValue / unrealizedProfit
    stock_value       = 0.0
    unrealized_profit = 0.0
    snapshot_holdings = []

    for h in active:
        sid           = h["stockId"]
        q             = quotes.get(sid, {})
        current_price = _f(q.get("price"), 0.0)
        current_value = round(h["sharesHeld"] * current_price)
        upl           = round((current_price - h["avgCost"]) * h["sharesHeld"])
        stock_name    = q.get("name") or h.get("stockName") or sid

        if current_price > 0:
            stock_value       += h["sharesHeld"] * current_price * 0.997
            unrealized_profit += (current_price - h["avgCost"]) * h["sharesHeld"]

        snapshot_holdings.append({
            "stockCode":        sid,
            "stockName":        stock_name,
            "shares":           h["sharesHeld"],
            "costAvg":          h["avgCost"],
            "currentPrice":     current_price,
            "currentValue":     current_value,
            "unrealizedProfit": upl,
        })

    # 計算 forexValue
    forex_value = 0.0
    for asset in foreign_assets:
        currency = asset.get("currency", "")
        amount   = float(asset.get("amount", 0) or 0)
        if asset.get("use_manual_rate"):
            rate = float(asset.get("manual_rate", 0) or 0)
        else:
            rate = rate_map.get(currency, 0) or 0
        forex_value += amount * rate

    # 寫入快照（merge 冪等）
    from firebase_admin import firestore as fs
    ref = db.collection("daily_snapshots").document(today)
    await asyncio.to_thread(lambda: ref.set({
        "date":              today,
        "exec_capital":      round(exec_capital),
        "reinvest":          round(reinvest),
        "stock_value":       round(stock_value),
        "cash_balance":      cash_balance,
        "forex_value":       round(forex_value),
        "unrealized_profit": round(unrealized_profit),
        "note":              "",
        "holdings":          snapshot_holdings,
        "vix":               vix,
        "market_state_auto": market_state_auto,
        "recorded_at":       fs.SERVER_TIMESTAMP,
    }, merge=True))

    updated = await asyncio.to_thread(lambda: ref.get().to_dict())
    return _deserialize_snapshot_dict(today, updated)


def _deserialize_snapshot_dict(date_id: str, d: dict) -> dict:
    ra = d.get("recorded_at")
    if hasattr(ra, "isoformat"):
        recorded_at = ra.isoformat()
    else:
        recorded_at = datetime.now(timezone.utc).isoformat()

    raw_holdings = d.get("holdings", [])
    normalized_holdings = []
    for h in raw_holdings:
        normalized_holdings.append({
            "stockCode":        h.get("stockCode", ""),
            "stockName":        h.get("stockName", ""),
            # 相容舊後端的 sharesHeld 欄位
            "shares":           h.get("shares") if h.get("shares") is not None else h.get("sharesHeld", 0),
            "costAvg":          h.get("costAvg", 0),
            "currentPrice":     h.get("currentPrice", 0),
            # 相容舊後端的 stockValue 欄位
            "currentValue":     h.get("currentValue") if h.get("currentValue") is not None else h.get("stockValue", 0),
            "unrealizedProfit": h.get("unrealizedProfit", 0),
        })

    return {
        "date":             d.get("date", date_id),
        "execCapital":      d.get("exec_capital", 0),
        "reinvest":         d.get("reinvest", 0),
        "stockValue":       d.get("stock_value", 0),
        "cashBalance":      d.get("cash_balance", 0),
        "forexValue":       d.get("forex_value", 0),
        "unrealizedProfit": d.get("unrealized_profit", 0),
        "note":             d.get("note", ""),
        "holdings":         normalized_holdings,
        "vix":              d.get("vix"),
        "marketStateAuto":  d.get("market_state_auto"),
        "recordedAt":       recorded_at,
    }
