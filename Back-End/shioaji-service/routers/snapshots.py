import asyncio
import re
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from models import daily_snapshot, holding, foreign_asset
from routers.stocks import _fetch_snapshot
from lib.rate_helper import get_live_rate_map
import lib.api_response as R

router = APIRouter()

_TZ_TW = timezone(timedelta(hours=8))


def _taiwan_today() -> str:
    return datetime.now(tz=_TZ_TW).strftime("%Y-%m-%d")


# ── GET /api/v1/snapshots ───────────────────────────────────────────────────

@router.get("")
async def get_all(year: Optional[int] = Query(default=None)):
    if year is not None and not (2000 <= year <= 2100):
        raise HTTPException(400, "year 參數格式錯誤（例：?year=2025）")
    data = await daily_snapshot.find_all(year)
    return R.success(data)


# ── POST /api/v1/snapshots ──────────────────────────────────────────────────

@router.post("", status_code=201)
async def create(body: dict):
    date = body.get("date", "")
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", date):
        raise HTTPException(400, "date 為必填欄位，格式 YYYY-MM-DD")
    required = ["totalInvested", "stockValue", "cashBalance", "forexValue",
                "unrealizedProfit", "realizedProfit", "returnRate"]
    for k in required:
        if body.get(k) is None:
            raise HTTPException(400, f"缺少必填欄位：{k}")
    data = await daily_snapshot.record({
        "date":             date,
        "totalInvested":    float(body["totalInvested"]),
        "stockValue":       float(body["stockValue"]),
        "cashBalance":      float(body["cashBalance"]),
        "forexValue":       float(body["forexValue"]),
        "unrealizedProfit": float(body["unrealizedProfit"]),
        "realizedProfit":   float(body["realizedProfit"]),
        "totalReturn":      float(body.get("totalReturn", 0)),
        "returnRate":       float(body["returnRate"]),
        "note":             str(body.get("note", "")),
    })
    return R.success(data)


# ── POST /api/v1/snapshots/record ───────────────────────────────────────────
# 後端自動計算並寫入當日快照（冪等）

@router.post("/record")
async def record():
    today = _taiwan_today()

    holdings, foreign_assets, prev, rate_map = await asyncio.gather(
        holding.find_all(),
        foreign_asset.find_all(),
        daily_snapshot.find_latest(),
        get_live_rate_map(),
    )

    price_results = await asyncio.gather(
        *[_fetch_snapshot(h["stockId"]) for h in holdings],
        return_exceptions=True,
    )

    stock_value     = 0.0
    total_invested  = 0.0
    realized_profit = 0.0

    for h, result in zip(holdings, price_results):
        total_invested  += h["totalCost"]
        realized_profit += h["realizedProfit"]
        if not isinstance(result, Exception):
            stock_value += h["sharesHeld"] * 1000 * result["price"]

    forex_value = 0.0
    for asset in foreign_assets:
        rate = asset["manualRate"] if asset["useManualRate"] else rate_map.get(asset["currency"])
        if rate is not None:
            forex_value += asset["amount"] * rate

    unrealized_profit = stock_value - total_invested
    total_return      = unrealized_profit + realized_profit
    return_rate       = (
        round(total_return / total_invested * 1_000_000) / 1_000_000
        if total_invested > 0 else 0.0
    )
    cash_balance = prev["cashBalance"] if prev else 0.0

    data = await daily_snapshot.record({
        "date":             today,
        "totalInvested":    round(total_invested),
        "stockValue":       round(stock_value),
        "cashBalance":      cash_balance,
        "forexValue":       round(forex_value),
        "unrealizedProfit": round(unrealized_profit),
        "realizedProfit":   round(realized_profit),
        "totalReturn":      round(total_return),
        "returnRate":       return_rate,
        "note":             "",
    })
    return R.success(data)


# ── GET /api/v1/snapshots/:date ─────────────────────────────────────────────

@router.get("/{date}")
async def get_by_date(date: str):
    data = await daily_snapshot.find_by_date(date)
    if not data:
        raise HTTPException(404, f"快照不存在：{date}")
    return R.success(data)


# ── PUT /api/v1/snapshots/:date ─────────────────────────────────────────────

@router.put("/{date}")
async def update(date: str, body: dict):
    if "cashBalance" not in body and "note" not in body:
        raise HTTPException(400, "至少需提供 cashBalance 或 note 其中一個欄位")
    patch = {}
    if "cashBalance" in body: patch["cashBalance"] = float(body["cashBalance"])
    if "note"        in body: patch["note"]        = str(body["note"])
    data = await daily_snapshot.update(date, patch)
    if not data:
        raise HTTPException(404, f"快照不存在：{date}")
    return R.success(data)
