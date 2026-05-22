from __future__ import annotations

import asyncio
import logging
import threading

from cachetools import TTLCache
from fastapi import APIRouter

from routers.schemas import success

router = APIRouter()
logger = logging.getLogger(__name__)

_lock = threading.Lock()
_indices_cache  = TTLCache(maxsize=1, ttl=5)
_forex_cache    = TTLCache(maxsize=1, ttl=300)
_export_cache   = TTLCache(maxsize=1, ttl=3600)


async def _get_or_set_async(cache: TTLCache, key: str, factory):
    with _lock:
        if key in cache:
            return cache[key]
    result = await factory()
    with _lock:
        cache[key] = result
    return result


# ── GET /market/indices ────────────────────────────────────────────────────────

@router.get("/indices")
async def get_indices():
    from services.shioaji_service import manager as sj_manager, is_shioaji_enabled
    from services import yahoo_finance as yf_svc

    async def _fetch():
        if is_shioaji_enabled() and sj_manager.initialized:
            try:
                twii_card, fut_card = await sj_manager.get_tw_indices()
                # 美股維持 Yahoo Finance
                us_symbols = [
                    {"id": "nasdaq", "name": "NASDAQ",     "symbol": "^IXIC"},
                    {"id": "sp500",  "name": "S&P 500",    "symbol": "^GSPC"},
                    {"id": "dji",    "name": "道瓊工業",   "symbol": "^DJI"},
                    {"id": "sox",    "name": "費城半導體", "symbol": "^SOX"},
                ]
                us_cards = await asyncio.gather(
                    *[asyncio.to_thread(yf_svc._fetch_index_card_sync, e) for e in us_symbols],
                    return_exceptions=True,
                )
                return [twii_card, fut_card, *[c for c in us_cards if not isinstance(c, Exception)]]
            except Exception as e:
                logger.warning("Shioaji indices failed, fallback Yahoo Finance: %s", e)
        return await yf_svc.fetch_indices()

    data = await _get_or_set_async(_indices_cache, "indices", _fetch)
    return success(data)


# ── GET /market/forex-rates ────────────────────────────────────────────────────

@router.get("/forex-rates")
async def get_forex_rates():
    from services import yahoo_finance as yf_svc
    data = await _get_or_set_async(_forex_cache, "forex", yf_svc.fetch_forex_rates)
    return success(data)


# ── GET /market/export-indicator ──────────────────────────────────────────────

@router.get("/export-indicator")
async def get_export_indicator():
    from services import yahoo_finance as yf_svc
    data = await _get_or_set_async(_export_cache, "export", yf_svc.fetch_export_indicator)
    return success(data)
