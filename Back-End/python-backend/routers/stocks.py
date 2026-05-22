from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Query

from services.firestore import db
from routers.schemas import success

router = APIRouter()
logger = logging.getLogger(__name__)

_STOCK_LIST_DOC = ("stock_list", "data")


# ── 快取：全股清單（TTL 3600s，TTLCache 管理） ────────────────────────────────

import threading
from cachetools import TTLCache

_list_cache = TTLCache(maxsize=1, ttl=3600)
_list_lock  = threading.Lock()


def _get_stock_list_sync() -> list:
    with _list_lock:
        if "all" in _list_cache:
            return _list_cache["all"]
    try:
        doc = db.collection("stock_list").document("data").get()
        if not doc.exists:
            return []
        items = doc.to_dict().get("stocks", []) or []
        with _list_lock:
            _list_cache["all"] = items
        return items
    except Exception as e:
        logger.warning("Stock list read failed: %s", e)
        return []


def _invalidate_list_cache():
    with _list_lock:
        _list_cache.clear()


# ── GET /stocks/search?q= ──────────────────────────────────────────────────────

@router.get("/search")
async def search(q: str = Query(default="")):
    q = q.strip()
    if not q:
        raise HTTPException(status_code=400, detail="請提供搜尋關鍵字 ?q=")

    items = await asyncio.to_thread(_get_stock_list_sync)
    keyword = q.lower()
    results = [
        s for s in items
        if s.get("code", "").startswith(keyword) or keyword in s.get("name", "").lower()
    ][:20]
    return success([{"stockId": s["code"], "name": s["name"], "market": s["market"]} for s in results])


# ── GET /stocks/list/meta ──────────────────────────────────────────────────────

@router.get("/list/meta")
async def list_meta():
    def _read():
        doc = db.collection("stock_list").document("data").get()
        if not doc.exists:
            return {"count": 0, "updatedAt": None}
        d = doc.to_dict()
        return {"count": d.get("count", 0), "updatedAt": d.get("updated_at")}

    return success(await asyncio.to_thread(_read))


# ── POST /stocks/list/refresh ──────────────────────────────────────────────────

@router.post("/list/refresh")
async def list_refresh():
    from services.shioaji_service import manager as sj_manager, is_shioaji_enabled

    if not is_shioaji_enabled():
        raise HTTPException(status_code=400, detail="未設定 SJ_API_KEY，此端點需要 Shioaji 服務")
    if not sj_manager.initialized:
        raise HTTPException(status_code=503, detail="Shioaji 服務尚未初始化")

    items = await sj_manager.get_all_stocks()

    from datetime import datetime
    updated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+08:00")

    def _write():
        db.collection("stock_list").document("data").set({
            "stocks":     items,
            "count":      len(items),
            "updated_at": updated_at,
        })

    await asyncio.to_thread(_write)
    _invalidate_list_cache()
    return success({"count": len(items), "updatedAt": updated_at})


# ── GET /stocks/{id}/quote ─────────────────────────────────────────────────────

@router.get("/{stock_id}/quote")
async def get_quote(stock_id: str):
    from services.shioaji_service import manager as sj_manager, is_shioaji_enabled
    from services import yahoo_finance as yf_svc

    if is_shioaji_enabled() and sj_manager.initialized:
        try:
            return success(await sj_manager.get_quote(stock_id))
        except Exception as e:
            logger.warning("Shioaji quote failed for %s, fallback: %s", stock_id, e)

    return success(await yf_svc.get_quote(stock_id))


# ── GET /stocks/{id}/history?days=90 ──────────────────────────────────────────

@router.get("/{stock_id}/history")
async def get_history(stock_id: str, days: int = Query(default=90, ge=1, le=365)):
    from services.shioaji_service import manager as sj_manager, is_shioaji_enabled
    from services import yahoo_finance as yf_svc

    if is_shioaji_enabled() and sj_manager.initialized:
        try:
            return success(await sj_manager.get_history(stock_id, days))
        except Exception as e:
            logger.warning("Shioaji history failed for %s, fallback: %s", stock_id, e)

    return success(await yf_svc.get_history(stock_id, days))


# ── GET /stocks/{id}/profile ───────────────────────────────────────────────────

@router.get("/{stock_id}/profile")
async def get_profile(stock_id: str):
    from services import yahoo_finance as yf_svc
    return success(await yf_svc.get_profile(stock_id))


# ── GET /stocks/{id}/chip ──────────────────────────────────────────────────────

@router.get("/{stock_id}/chip")
async def get_chip(stock_id: str):
    async def _fetch_t86(date_str: str) -> list:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    "https://www.twse.com.tw/rwd/zh/fund/T86",
                    params={"date": date_str, "stockNo": stock_id, "response": "json"},
                    headers={"User-Agent": "Mozilla/5.0"},
                )
            data = resp.json()
            if data.get("stat") != "OK" or not isinstance(data.get("data"), list):
                return []
            rows = []
            for row in data["data"]:
                parts = (row[0] or "").split("/")
                if len(parts) < 3:
                    continue
                iso_date = f"{int(parts[0]) + 1911}-{parts[1]}-{parts[2]}"
                parse = lambda s: int((s or "0").replace(",", "")) or 0
                rows.append({
                    "date":    iso_date,
                    "foreign": round((parse(row[1]) + parse(row[2])) / 1000),
                    "trust":   round(parse(row[3]) / 1000),
                    "dealer":  round((parse(row[4]) + parse(row[5])) / 1000),
                })
            return rows
        except Exception as e:
            logger.debug("T86 fetch failed %s: %s", date_str, e)
            return []

    from datetime import date
    today = date.today()
    date_str = f"{today.year}{today.month:02d}01"
    rows = await _fetch_t86(date_str)

    if len(rows) < 20:
        prev = date(today.year, today.month - 1, 1) if today.month > 1 else date(today.year - 1, 12, 1)
        prev_str = f"{prev.year}{prev.month:02d}01"
        prev_rows = await _fetch_t86(prev_str)
        rows = prev_rows + rows

    return success(rows[-20:])
