import asyncio
from fastapi import APIRouter, HTTPException
from models import watchlist
from routers.stocks import _fetch_snapshot
import lib.api_response as R

router = APIRouter()


# ── GET /api/v1/watchlist ───────────────────────────────────────────────────

@router.get("")
async def get_all():
    items = await watchlist.find_all()

    price_results = await asyncio.gather(
        *[_fetch_snapshot(item["stockId"]) for item in items],
        return_exceptions=True,
    )

    data = []
    for item, result in zip(items, price_results):
        if isinstance(result, Exception):
            live_price = change = change_percent = stock_name = None
        else:
            live_price      = result["price"]
            change          = result["change"]
            change_percent  = result["changePercent"]
            stock_name      = result["name"]
        judgment = (
            ("買進" if live_price <= item["targetPrice"] else "觀望")
            if live_price is not None else None
        )
        data.append({**item, "livePrice": live_price, "change": change,
                     "changePercent": change_percent, "stockName": stock_name,
                     "judgment": judgment})

    return R.success(data)


# ── POST /api/v1/watchlist ──────────────────────────────────────────────────

@router.post("", status_code=201)
async def create(body: dict):
    stock_id     = body.get("stockId")
    target_price = body.get("targetPrice")
    if not stock_id or target_price is None:
        raise HTTPException(400, "缺少必填欄位：stockId / targetPrice")
    data = await watchlist.create(str(stock_id), float(target_price), body.get("note", ""))
    if data is None:
        raise HTTPException(409, f"關注清單已存在：{stock_id}")
    return R.success(data)


# ── PUT /api/v1/watchlist/reorder ──────────────────────────────────────────
# 必須在 /:stockId 之前宣告，避免被 path 參數攔截

@router.put("/reorder")
async def reorder(body: dict):
    order = body.get("order")
    if not isinstance(order, list) or len(order) == 0:
        raise HTTPException(400, "order 必須為非空字串陣列")
    await watchlist.reorder([str(s) for s in order])
    return R.success({"reordered": len(order)})


# ── PUT /api/v1/watchlist/:stockId ─────────────────────────────────────────

@router.put("/{stock_id}")
async def update(stock_id: str, body: dict):
    if "targetPrice" not in body and "note" not in body:
        raise HTTPException(400, "至少需提供 targetPrice 或 note 其中一個欄位")
    patch = {}
    if "targetPrice" in body: patch["targetPrice"] = float(body["targetPrice"])
    if "note"        in body: patch["note"]        = str(body["note"])
    data = await watchlist.update(stock_id, patch)
    if data is None:
        raise HTTPException(404, f"關注清單不存在：{stock_id}")
    return R.success(data)


# ── DELETE /api/v1/watchlist/:stockId ──────────────────────────────────────

@router.delete("/{stock_id}")
async def delete(stock_id: str):
    deleted = await watchlist.delete(stock_id)
    if not deleted:
        raise HTTPException(404, f"關注清單不存在：{stock_id}")
    return R.success({"deleted": stock_id})
