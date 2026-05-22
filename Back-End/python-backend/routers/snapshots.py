from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Any

from services.firestore import db
from routers.schemas import success

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Payload ────────────────────────────────────────────────────────────────────

class CreateSnapshotPayload(BaseModel):
    date: Optional[str] = None
    totalValue: Optional[float] = None
    totalCost: Optional[float] = None
    totalGain: Optional[float] = None
    gainPercent: Optional[float] = None
    cashTwd: Optional[float] = None
    marketState: Optional[str] = None

    model_config = {"extra": "allow"}


# ── GET /snapshots ─────────────────────────────────────────────────────────────

@router.get("")
async def get_all():
    from services.snapshot_service import get_all_snapshots
    return success(await get_all_snapshots())


# ── GET /snapshots/{date} ──────────────────────────────────────────────────────

@router.get("/{date}")
async def get_by_date(date: str):
    from services.snapshot_service import get_snapshot_by_date
    doc = await get_snapshot_by_date(date)
    if doc is None:
        raise HTTPException(status_code=404, detail=f"快照 {date} 不存在")
    return success(doc)


# ── POST /snapshots ────────────────────────────────────────────────────────────

@router.post("")
async def create_snapshot(body: CreateSnapshotPayload):
    from services.snapshot_service import record_snapshot
    data = await record_snapshot(body.model_dump(exclude_none=True))
    return success(data)


# ── POST /snapshots/record（後端自算端點） ─────────────────────────────────────

@router.post("/record")
async def record():
    """
    後端自算快照：並行抓各持股報價 → 計算總值 → 寫入 daily_snapshots。
    同時抓 VIX 計算 marketStateAuto，完成後 fire-and-forget 觸發動態風險重算。
    """
    from services.snapshot_service import record_snapshot, _today_taipei
    from services import yahoo_finance as yf_svc

    # ── 讀取所有持股 ──────────────────────────────────────────────────────────
    def _read_holdings():
        return [
            {**doc.to_dict(), "_id": doc.id}
            for doc in db.collection("holdings").stream()
        ]

    holdings = await asyncio.to_thread(_read_holdings)
    active = [h for h in holdings if (h.get("shares_held") or 0) > 0]

    # ── 並行抓各持股即時報價 ──────────────────────────────────────────────────
    async def _quote(h: dict) -> tuple[str, float]:
        sid = h.get("stock_id") or h["_id"]
        try:
            q = await yf_svc.get_quote(sid)
            return sid, q.get("price", 0)
        except Exception:
            return sid, float(h.get("average_cost") or 0)

    price_results = await asyncio.gather(*[_quote(h) for h in active], return_exceptions=True)
    price_map: dict[str, float] = {}
    for r in price_results:
        if isinstance(r, tuple):
            price_map[r[0]] = r[1]

    # ── 計算總市值 / 成本 ─────────────────────────────────────────────────────
    total_value = 0.0
    total_cost  = 0.0
    for h in active:
        sid    = h.get("stock_id") or h["_id"]
        shares = float(h.get("shares_held") or 0)
        cost   = float(h.get("average_cost") or 0)
        price  = price_map.get(sid, cost)
        total_value += shares * price
        total_cost  += shares * cost

    total_gain   = round(total_value - total_cost, 2)
    gain_percent = round(total_gain / total_cost * 100, 2) if total_cost else 0.0

    # ── 讀取市場狀態 ──────────────────────────────────────────────────────────
    def _read_market_state():
        doc = db.collection("market_state").document("main").get()
        return doc.to_dict().get("current", "neutral") if doc.exists else "neutral"

    market_state = await asyncio.to_thread(_read_market_state)

    payload = {
        "date":         _today_taipei(),
        "totalValue":   round(total_value, 2),
        "totalCost":    round(total_cost, 2),
        "totalGain":    total_gain,
        "gainPercent":  gain_percent,
        "marketState":  market_state,
    }

    data = await record_snapshot(payload)
    return success(data)
