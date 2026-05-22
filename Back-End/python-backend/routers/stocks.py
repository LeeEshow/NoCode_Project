import asyncio
from fastapi import APIRouter, HTTPException, Query
from services.firestore import get_db
from services.cache import cache_get, cache_set
from services.yahoo_finance import (
    get_all_stocks, get_quote, get_full_history,
    get_profile, get_chip,
)

router = APIRouter()


# ─── GET /stocks/search?q= ────────────────────────────────────────────────────

@router.get("/search")
async def search(q: str = Query(default="")):
    q = q.strip()
    if not q:
        raise HTTPException(status_code=400, detail="請提供搜尋關鍵字 ?q=")

    loop = asyncio.get_event_loop()
    all_stocks = await loop.run_in_executor(None, get_all_stocks)

    keyword = q.lower()
    results = [
        {
            "stockId": s.get("code", ""),
            "name":    s.get("name", ""),
            "market":  s.get("market", "TSE"),
        }
        for s in all_stocks
        if s.get("code", "").startswith(keyword) or keyword in s.get("name", "").lower()
    ]
    return {"success": True, "data": results[:20]}


# ─── GET /stocks/list/meta ────────────────────────────────────────────────────

@router.get("/list/meta")
async def list_meta():
    db = get_db()
    doc = db.collection("stock_list").document("data").get()
    if not doc.exists:
        return {"success": True, "data": {"count": 0, "updatedAt": None}}
    d = doc.to_dict()
    return {"success": True, "data": {
        "count":     d.get("count", 0),
        "updatedAt": d.get("updated_at"),
    }}


# ─── POST /stocks/list/refresh ────────────────────────────────────────────────

@router.post("/list/refresh")
async def list_refresh():
    import os
    if not os.getenv("SHIOAJI_API_URL"):
        raise HTTPException(status_code=400, detail="未設定 SHIOAJI_API_URL，此端點需要 Shioaji 服務")
    raise HTTPException(status_code=501, detail="Shioaji 整合尚未啟用")


# ─── GET /stocks/{id}/quote ───────────────────────────────────────────────────

@router.get("/{stock_id}/quote")
async def stock_quote(stock_id: str):
    cache_key = f"stock:quote:{stock_id}"
    cached = cache_get(cache_key)
    if cached is not None:
        return {"success": True, "data": cached}

    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(None, get_quote, stock_id)
    cache_set(cache_key, data, 60)
    return {"success": True, "data": data}


# ─── GET /stocks/{id}/history?days=90 ────────────────────────────────────────

@router.get("/{stock_id}/history")
async def stock_history(stock_id: str, days: int = Query(default=90, ge=1, le=365)):
    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(None, get_full_history, stock_id, days)
    return {"success": True, "data": data}


# ─── GET /stocks/{id}/profile ─────────────────────────────────────────────────

@router.get("/{stock_id}/profile")
async def stock_profile(stock_id: str):
    cache_key = f"stock:profile:{stock_id}"
    cached = cache_get(cache_key)
    if cached is not None:
        return {"success": True, "data": cached}

    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(None, get_profile, stock_id)
    cache_set(cache_key, data, 300)
    return {"success": True, "data": data}


# ─── GET /stocks/{id}/chip ────────────────────────────────────────────────────

@router.get("/{stock_id}/chip")
async def stock_chip(stock_id: str):
    cache_key = f"stock:chip:{stock_id}"
    cached = cache_get(cache_key)
    if cached is not None:
        return {"success": True, "data": cached}

    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(None, get_chip, stock_id)
    cache_set(cache_key, data, 300)
    return {"success": True, "data": data}
