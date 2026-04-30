from datetime import datetime

from fastapi import APIRouter, HTTPException

from shioaji_api.core.manager import manager
from shioaji_api.schemas.market import QuoteResponse

router = APIRouter()


@router.get("/quote/{stock_id}", response_model=QuoteResponse)
async def get_quote(stock_id: str):
    if not manager.initialized:
        raise HTTPException(503, detail="Service not ready")

    # 訂閱（冪等，已訂閱則忽略）
    try:
        await manager.subscribe_stock(stock_id)
    except Exception:
        pass

    # 優先回傳 WebSocket tick 快取
    cached = manager.get_cached_quote(stock_id)
    if cached:
        return QuoteResponse(**cached)

    # Fallback：snapshot
    try:
        contract = manager.api.Contracts.Stocks[stock_id]
    except (KeyError, AttributeError):
        raise HTTPException(404, detail=f"Stock {stock_id} not found")

    snaps = await manager.get_snapshot([contract])
    if not snaps:
        raise HTTPException(503, detail="No snapshot data available")

    snap = snaps[0]
    return QuoteResponse(
        code=snap.code,
        price=snap.close,
        open=snap.open,
        high=snap.high,
        low=snap.low,
        volume=snap.total_volume,
        change=snap.change_price,
        change_percent=snap.change_rate,
        timestamp=datetime.fromtimestamp(snap.ts / 1e9).isoformat(),
        source="snapshot",
    )
