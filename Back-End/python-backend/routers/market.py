import asyncio
from fastapi import APIRouter
from services.yahoo_finance import get_indices, get_forex_rates, get_export_indicator
from services.api_switch import shioaji_enabled
from utils.market_hours import is_market_open

router = APIRouter()


def _sj_to_index_card(id_: str, name: str, data: dict) -> dict:
    return {
        "id":            id_,
        "name":          name,
        "price":         data.get("price"),
        "change":        data.get("change"),
        "changePercent": data.get("change_percent"),
    }


@router.get("/indices")
async def market_indices():
    loop = asyncio.get_event_loop()
    cards = await loop.run_in_executor(None, get_indices)

    # 盤中且 Shioaji 已啟用時，覆蓋 TAIEX（index 0）和台指期（index 1）
    # TAIEX：api.snapshots()（Index 不支援 Tick）；台指期：WebSocket tick
    if shioaji_enabled() and is_market_open():
        from services.shioaji_manager import shioaji_manager
        if shioaji_manager.initialized:
            taiex = await shioaji_manager.get_taiex_snapshot()
            if taiex:
                cards[0] = _sj_to_index_card("twii", "台股大盤", taiex)
            futures = shioaji_manager.get_cached_futures()
            if futures:
                cards[1] = _sj_to_index_card("futures", "台指期", futures)

    return {"success": True, "data": cards}


@router.get("/forex-rates")
async def forex_rates():
    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(None, get_forex_rates)
    return {"success": True, "data": data}


@router.get("/export-indicator")
async def export_indicator():
    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(None, get_export_indicator)
    return {"success": True, "data": data}
