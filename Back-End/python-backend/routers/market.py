import asyncio
import logging
from datetime import datetime, timedelta
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from services.yahoo_finance import get_indices, get_forex_rates
from services.api_switch import shioaji_enabled
from services.cache import cache_get, cache_set
from services.firestore import get_db

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


def _get_ndc_indicators() -> dict:
    """從 Firestore 讀取景氣燈號 + PMI（同步，供 asyncio.to_thread 使用）"""
    try:
        db = get_db()
        col = db.collection("market_indicators")
        bc_doc  = col.document("business_cycle").get()
        pmi_doc = col.document("pmi").get()
        return {
            "businessCycle": bc_doc.to_dict()  if bc_doc.exists  else None,
            "pmi":           pmi_doc.to_dict() if pmi_doc.exists else None,
        }
    except Exception:
        logger.exception("Failed to read market_indicators from Firestore")
        return {"businessCycle": None, "pmi": None}


@router.get("/indices")
async def market_indices():
    loop = asyncio.get_running_loop()
    cards, ndc = await asyncio.gather(
        loop.run_in_executor(None, get_indices),
        asyncio.to_thread(_get_ndc_indicators),
    )
    cards = list(cards)  # shallow copy，避免 mutate LRU cached list

    if is_market_open():
        # TAIEX（index 0）：盤中改用 TWSE 即時行情（約 5 秒延遲，Yahoo 為 20 分鐘）
        from services.twse_finance import get_twse_taiex
        taiex = await asyncio.to_thread(get_twse_taiex)
        if taiex:
            cards[0] = taiex

        # 台指期（index 1）：Shioaji WebSocket tick cache 覆蓋
        if shioaji_enabled():
            from services.shioaji_manager import shioaji_manager
            if shioaji_manager.initialized:
                futures = shioaji_manager.get_cached_futures()
                if futures:
                    cards[1] = _sj_to_index_card("futures", "台指期", futures)

    return {"success": True, "data": cards, "ndcIndicators": ndc}


@router.get("/forex-rates")
async def forex_rates():
    loop = asyncio.get_running_loop()
    data = await loop.run_in_executor(None, get_forex_rates)
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

    try:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d")
        end_dt   = datetime.strptime(end_date,   "%Y-%m-%d")
    except ValueError:
        return JSONResponse(status_code=400, content={"success": False, "error": "日期格式錯誤，請用 YYYY-MM-DD"})

    if (end_dt - start_dt).days > 500:
        return JSONResponse(status_code=400, content={"success": False, "error": "查詢區間最長 500 天"})

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
