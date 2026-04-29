import asyncio
from fastapi import APIRouter, HTTPException, Request
from models import holding
from routers.stocks import _fetch_snapshot
import lib.api_response as R

router = APIRouter()


# ── GET /api/v1/holdings ────────────────────────────────────────────────────

@router.get("")
async def get_all():
    holdings = await holding.find_all()

    async def enrich(h: dict) -> dict:
        if h["sharesHeld"] <= 0:
            return h
        try:
            quote = await _fetch_snapshot(h["stockId"])
            h = {**h,
                 "stockName":     quote["name"],
                 "currentPrice":  quote["price"],
                 "change":        quote["change"],
                 "changePercent": quote["changePercent"]}
        except Exception:
            pass
        return h

    enriched = await asyncio.gather(*[enrich(h) for h in holdings])
    return R.success(list(enriched))


# ── GET /api/v1/holdings/:stockId ──────────────────────────────────────────

@router.get("/{stock_id}")
async def get_by_id(stock_id: str):
    h = await holding.find_by_id(stock_id)
    if not h:
        raise HTTPException(404, "庫存不存在")
    if h["sharesHeld"] > 0:
        try:
            quote = await _fetch_snapshot(stock_id)
            h = {**h,
                 "stockName":     quote["name"],
                 "currentPrice":  quote["price"],
                 "change":        quote["change"],
                 "changePercent": quote["changePercent"]}
        except Exception:
            pass
    return R.success(h)


# ── PUT /api/v1/holdings/reorder ────────────────────────────────────────────

@router.put("/reorder")
async def reorder(body: dict):
    order = body.get("order")
    if not isinstance(order, list) or len(order) == 0:
        raise HTTPException(400, "order 必須為非空字串陣列")
    await holding.reorder([str(s) for s in order])
    return R.success({"reordered": len(order)})


# ── POST /api/v1/holdings/recalculate ───────────────────────────────────────

@router.post("/recalculate")
async def recalculate(request: Request):
    body = await request.json()
    if not isinstance(body, list) or not body:
        raise HTTPException(400, "Request body 必須為非空陣列")
    await holding.batch_upsert(body)
    return R.success({"updated": len(body)})
