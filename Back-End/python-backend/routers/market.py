import asyncio
import logging
from datetime import datetime, timedelta
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from services.yahoo_finance import get_indices, get_forex_rates, get_export_indicator
from services.api_switch import shioaji_enabled
from services.cache import cache_get, cache_set
from utils.market_hours import is_market_open

logger = logging.getLogger(__name__)

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
    loop = asyncio.get_running_loop()
    cards = await loop.run_in_executor(None, get_indices)

    # 盤中且 Shioaji 已啟用時，台指期（index 1）以 WebSocket tick cache 覆蓋
    # TAIEX（index 0）由 Yahoo Finance ^TWII 提供（Index 不支援 Tick 訂閱）
    if shioaji_enabled() and is_market_open():
        from services.shioaji_manager import shioaji_manager
        if shioaji_manager.initialized:
            futures = shioaji_manager.get_cached_futures()
            if futures:
                cards[1] = _sj_to_index_card("futures", "台指期", futures)

    return {"success": True, "data": cards}


@router.get("/forex-rates")
async def forex_rates():
    loop = asyncio.get_running_loop()
    data = await loop.run_in_executor(None, get_forex_rates)
    return {"success": True, "data": data}


@router.get("/export-indicator")
async def export_indicator():
    loop = asyncio.get_running_loop()
    data = await loop.run_in_executor(None, get_export_indicator)
    return {"success": True, "data": data}


# ─── GET /market/index-kbars?start=YYYY-MM-DD&end=YYYY-MM-DD ─────────────────

@router.get("/index-kbars")
async def market_index_kbars(
    start: str | None = Query(default=None),
    end:   str | None = Query(default=None),
):
    """加權指數（TSE001）日 K，Shioaji 未啟用時回 503。"""
    if not shioaji_enabled():
        return JSONResponse(status_code=503, content={"success": False, "error": "Shioaji 未啟用"})

    from services.shioaji_manager import shioaji_manager
    if not shioaji_manager.initialized:
        return JSONResponse(status_code=503, content={"success": False, "error": "Shioaji 未初始化"})

    today      = datetime.now().strftime("%Y-%m-%d")
    end_date   = end   or today
    start_date = start or (datetime.now() - timedelta(days=365)).strftime("%Y-%m-%d")

    cache_key = f"market:index-kbars:{start_date}:{end_date}"
    cached = cache_get(cache_key)
    if cached is not None:
        return {"success": True, "data": cached}

    try:
        data = await shioaji_manager.get_index_kbars(start_date, end_date)
    except asyncio.TimeoutError:
        logger.warning("index_kbars timeout start=%s end=%s", start_date, end_date)
        return JSONResponse(status_code=503, content={"success": False, "error": "指數 K 線查詢逾時"})

    if data:
        cache_set(cache_key, data, 300)
    return {"success": True, "data": data}
