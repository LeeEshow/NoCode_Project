from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from shioaji_api.core.manager import manager
from shioaji_api.schemas.market import QuoteResponse

router = APIRouter()

# tick 資料超過此秒數視為 stale，改走 snapshot
_TICK_MAX_AGE_SECONDS = 120


def _is_fresh(cached: dict) -> bool:
    try:
        ts = datetime.fromisoformat(cached["timestamp"])
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - ts).total_seconds() < _TICK_MAX_AGE_SECONDS
    except Exception:
        return True  # 解析失敗時保守地視為新鮮


@router.get("/quote/{stock_id}", response_model=QuoteResponse)
async def get_quote(stock_id: str):
    if not manager.initialized:
        raise HTTPException(503, detail="Service not ready")

    # 訂閱（冪等，已訂閱則忽略）
    try:
        await manager.subscribe_stock(stock_id)
    except Exception:
        pass

    # 優先回傳 WebSocket tick 快取（需確認資料新鮮）
    cached = manager.get_cached_quote(stock_id)
    if cached and _is_fresh(cached):
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
