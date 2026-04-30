from datetime import datetime

from fastapi import APIRouter, HTTPException

from shioaji_api.core.manager import manager
from shioaji_api.schemas.market import IndexResponse

router = APIRouter()


@router.get("/index/taiex", response_model=IndexResponse)
async def get_taiex():
    if not manager.initialized:
        raise HTTPException(503, detail="Service not ready")

    # 優先回傳 tick 快取（若訂閱成功）
    cached = manager.get_cached_taiex()
    if cached:
        return IndexResponse(**cached)

    # Fallback：snapshot
    try:
        contract = manager.get_taiex_contract()
        if contract is None:
            raise ValueError("找不到 TSE001 加權指數合約")
        snaps = await manager.get_snapshot([contract])
    except Exception as e:
        raise HTTPException(503, detail=f"TAIEX data unavailable: {e}")

    if not snaps:
        raise HTTPException(503, detail="No TAIEX snapshot data")

    snap = snaps[0]
    return IndexResponse(
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


@router.get("/index/futures", response_model=IndexResponse)
async def get_futures():
    if not manager.initialized:
        raise HTTPException(503, detail="Service not ready")

    # 優先回傳 tick 快取（啟動時已訂閱 TXFC0）
    cached = manager.get_cached_futures()
    if cached:
        return IndexResponse(**cached)

    # Fallback：snapshot（動態找近月合約）
    try:
        contract = manager.get_nearest_txf_contract()
        if contract is None:
            raise ValueError("找不到有效的 TXF 近月合約")
        snaps = await manager.get_snapshot([contract])
    except Exception as e:
        raise HTTPException(503, detail=f"Futures data unavailable: {e}")

    if not snaps:
        raise HTTPException(503, detail="No futures snapshot data")

    snap = snaps[0]
    return IndexResponse(
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
