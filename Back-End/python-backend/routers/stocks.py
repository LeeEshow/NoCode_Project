import asyncio
from fastapi import APIRouter, HTTPException, Query
from google.cloud.firestore_v1.base_query import FieldFilter
from services.firestore import get_db
from services.cache import cache_get, cache_set
from services.yahoo_finance import get_all_stocks, get_full_history, get_history_range
from services.quote_service import get_quote

router = APIRouter()

_INDEX_ENTRIES = [
    {"stockId": "^TWII", "name": "加權指數", "market": "INDEX"},
]


def _to_camel(k: str) -> str:
    parts = k.split("_")
    return parts[0] + "".join(p.capitalize() for p in parts[1:])


def _convert_keys(obj):
    if isinstance(obj, dict):
        return {_to_camel(k): _convert_keys(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_convert_keys(i) for i in obj]
    return obj


# ─── GET /stocks/search?q= ────────────────────────────────────────────────────

@router.get("/search")
async def search(q: str = Query(default="")):
    q = q.strip()
    if not q:
        raise HTTPException(status_code=400, detail="請提供搜尋關鍵字 ?q=")

    loop = asyncio.get_event_loop()
    all_stocks = await loop.run_in_executor(None, get_all_stocks)

    keyword = q.lower()
    index_results = [
        e for e in _INDEX_ENTRIES
        if e["stockId"].lower().startswith(keyword) or keyword in e["name"].lower()
    ]
    stock_results = [
        {
            "stockId": s.get("code", ""),
            "name":    s.get("name", ""),
            "market":  s.get("market", "TSE"),
        }
        for s in all_stocks
        if s.get("code", "").lower().startswith(keyword) or keyword in s.get("name", "").lower()
    ]
    return {"success": True, "data": (index_results + stock_results)[:20]}


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

    data = await get_quote(stock_id)
    if data.get("quoteStatus") == "ok":
        cache_set(cache_key, data, 10)
    return {"success": True, "data": data}


# ─── GET /stocks/{id}/history?days=90 | ?start=YYYY-MM-DD&end=YYYY-MM-DD ─────

@router.get("/{stock_id}/history")
async def stock_history(
    stock_id: str,
    days:  int      = Query(default=90, ge=1, le=365),
    start: str | None = Query(default=None),
    end:   str | None = Query(default=None),
):
    loop = asyncio.get_running_loop()
    if start:
        cache_key = f"stock:history:{stock_id}:start={start}:end={end or ''}"
        cached = cache_get(cache_key)
        if cached is not None:
            return {"success": True, "data": cached}
        data = await loop.run_in_executor(None, get_history_range, stock_id, start, end)
    else:
        cache_key = f"stock:history:{stock_id}:days={days}"
        cached = cache_get(cache_key)
        if cached is not None:
            return {"success": True, "data": cached}
        data = await loop.run_in_executor(None, get_full_history, stock_id, days)
    if data:
        cache_set(cache_key, data, 300)
    return {"success": True, "data": data}


# ─── GET /stocks/{id}/profile ─────────────────────────────────────────────────

@router.get("/{stock_id}/profile")
async def stock_profile(stock_id: str):
    loop = asyncio.get_event_loop()

    def _read():
        db = get_db()
        doc = db.collection("stock_fundamentals").document(stock_id).get()
        if not doc.exists:
            return None
        return _convert_keys(doc.to_dict())

    data = await loop.run_in_executor(None, _read)
    return {"success": True, "data": data}


# ─── GET /stocks/{id}/chip ────────────────────────────────────────────────────

@router.get("/{stock_id}/chip")
async def stock_chip(
    stock_id: str,
    limit: int = Query(default=20, ge=1, le=60),
    start_date: str | None = Query(default=None),
):
    loop = asyncio.get_event_loop()

    def _read():
        db = get_db()
        q = (
            db.collection("stock_chip")
            .document(stock_id)
            .collection("records")
        )
        if start_date:
            q = q.where(filter=FieldFilter("date", ">=", start_date))
        docs = q.order_by("date", direction="DESCENDING").limit(limit).get()
        rows = []
        for doc in docs:
            d = doc.to_dict()
            rows.append({
                "stockId":   stock_id,
                "date":      d.get("date", ""),
                "foreign":   d.get("foreign", 0),
                "trust":     d.get("trust", 0),
                "dealer":    d.get("dealer", 0),
                "updatedAt": d.get("updated_at"),
            })
        rows.reverse()
        return rows

    data = await loop.run_in_executor(None, _read)
    return {"success": True, "data": data}
