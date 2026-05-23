import asyncio
import time
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from firebase_admin import firestore as fs
from google.cloud.firestore_v1.base_query import FieldFilter
from services.firestore import get_db
from services.yahoo_finance import get_quote
from services.api_switch import api_switch_call

router = APIRouter()


# ─── 工具函式 ──────────────────────────────────────────────────────────────────

def ts_iso(val) -> str:
    if isinstance(val, datetime):
        return val.isoformat()
    return datetime.now(timezone.utc).isoformat()


# ─── Holding 反序列化 ──────────────────────────────────────────────────────────

def deserialize_holding(doc) -> dict:
    d = doc.to_dict()
    return {
        "stockId":        doc.id,
        "stockName":      d.get("stock_name"),
        "sharesHeld":     d.get("shares_held", 0),
        "avgCost":        d.get("avg_cost", 0),
        "totalCost":      d.get("total_cost", 0),
        "realizedProfit": d.get("realized_profit", 0),
        "costMethod":     d.get("cost_method", "preserve_method"),
        "updatedAt":      ts_iso(d.get("updated_at")),
        "sortIndex":      d.get("sort_index", 0),
    }


def find_all_holdings() -> list[dict]:
    db = get_db()
    snap = db.collection("holdings").get()
    items = [deserialize_holding(doc) for doc in snap]
    return sorted(items, key=lambda x: x["sortIndex"])


def find_holding_by_id(stock_id: str) -> dict | None:
    db = get_db()
    doc = db.collection("holdings").document(stock_id).get()
    return deserialize_holding(doc) if doc.exists else None


# ─── AssetTag 反序列化 ─────────────────────────────────────────────────────────

def deserialize_asset_tag(doc) -> dict:
    d = doc.to_dict()
    return {
        "id":          doc.id,
        "stockCode":   d.get("stock_code"),
        "tagName":     d.get("tag_name"),
        "weightRatio": d.get("weight_ratio"),
    }


def find_all_asset_tags(stock_code: str | None = None) -> list[dict]:
    db = get_db()
    col = db.collection("asset_tags")
    snap = col.where(filter=FieldFilter("stock_code", "==", stock_code)).get() if stock_code else col.get()
    return [deserialize_asset_tag(doc) for doc in snap]




# ─── GET /holdings ─────────────────────────────────────────────────────────────

async def _fetch_quotes_switched(stock_ids: list[str]) -> dict[str, dict]:
    """並行抓取報價：盤中走 Shioaji tick，其餘走 Yahoo v8"""
    if not stock_ids:
        return {}

    async def fetch_one(sid: str) -> tuple[str, dict | None]:
        async def primary():
            from services.shioaji_manager import shioaji_manager
            await shioaji_manager.subscribe_stock(sid)
            fresh = shioaji_manager.get_fresh_quote(sid)
            if fresh is None:
                raise RuntimeError("no fresh tick")
            return {
                "stockId": sid, "name": sid,
                "price":         fresh.get("price", 0),
                "change":        fresh.get("change") or 0,
                "changePercent": fresh.get("change_percent") or 0,
                "high":          fresh.get("high", 0),
                "low":           fresh.get("low", 0),
                "volume":        fresh.get("volume", 0),
                "marketStatus":  "TRADING",
                "updatedAt":     int(time.time()),
            }

        async def fallback():
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(None, get_quote, sid)

        try:
            q = await api_switch_call(primary, fallback)
            return sid, q
        except Exception:
            return sid, None

    results = await asyncio.gather(*[fetch_one(sid) for sid in stock_ids])
    return {sid: q for sid, q in results if q is not None}


@router.get("")
async def get_all():
    loop = asyncio.get_event_loop()
    holdings, all_asset_tags = await asyncio.gather(
        loop.run_in_executor(None, find_all_holdings),
        loop.run_in_executor(None, find_all_asset_tags),
    )

    tags_by_stock: dict[str, list] = {}
    for at in all_asset_tags:
        code = at["stockCode"]
        tags_by_stock.setdefault(code, []).append({
            "id":          at["id"],
            "tagName":     at["tagName"],
            "weightRatio": at["weightRatio"],
        })

    active_ids = [h["stockId"] for h in holdings if h["sharesHeld"] > 0]
    quotes = await _fetch_quotes_switched(active_ids)

    result = []
    for h in holdings:
        if h["sharesHeld"] > 0:
            q = quotes.get(h["stockId"], {})
            h["currentPrice"]  = q.get("price", 0)
            h["change"]        = q.get("change", 0)
            h["changePercent"] = q.get("changePercent", 0)
        h["tags"] = tags_by_stock.get(h["stockId"], [])
        result.append(h)

    return {"success": True, "data": result}


# ─── GET /holdings/prices ──────────────────────────────────────────────────────

@router.get("/prices")
async def get_prices():
    loop = asyncio.get_event_loop()
    holdings = await loop.run_in_executor(None, find_all_holdings)
    active = [h for h in holdings if h["sharesHeld"] > 0]
    quotes = await _fetch_quotes_switched([h["stockId"] for h in active])

    result = []
    for h in active:
        q = quotes.get(h["stockId"], {})
        price = q.get("price", 0) if q else 0
        if price <= 0:
            continue
        result.append({
            "stockCode":        h["stockId"],
            "currentPrice":     price,
            "change":           q.get("change", 0),
            "changePct":        q.get("changePercent", 0),
            "unrealizedProfit": round(price * h["sharesHeld"] - h["totalCost"]),
        })

    return {"success": True, "data": result}


# ─── GET /holdings/:stockId ────────────────────────────────────────────────────

@router.get("/{stock_id}")
async def get_by_id(stock_id: str):
    h = find_holding_by_id(stock_id)
    if not h:
        raise HTTPException(status_code=404, detail="庫存不存在")
    if h["sharesHeld"] > 0:
        loop = asyncio.get_event_loop()

        async def primary():
            from services.shioaji_manager import shioaji_manager
            await shioaji_manager.subscribe_stock(stock_id)
            fresh = shioaji_manager.get_fresh_quote(stock_id)
            if fresh is None:
                raise RuntimeError("no fresh tick")
            return {
                "price":         fresh.get("price", 0),
                "change":        fresh.get("change") or 0,
                "changePercent": fresh.get("change_percent") or 0,
            }

        async def fallback():
            q = await loop.run_in_executor(None, get_quote, stock_id)
            return {"price": q.get("price", 0), "change": q.get("change", 0),
                    "changePercent": q.get("changePercent", 0)}

        try:
            q = await api_switch_call(primary, fallback)
            h["currentPrice"]  = q.get("price", 0)
            h["change"]        = q.get("change", 0)
            h["changePercent"] = q.get("changePercent", 0)
        except Exception:
            h["currentPrice"]  = 0
            h["change"]        = 0
            h["changePercent"] = 0

    return {"success": True, "data": h}


# ─── PUT /holdings/reorder ─────────────────────────────────────────────────────

@router.put("/reorder")
async def reorder(body: dict):
    order = body.get("order")
    if not isinstance(order, list) or len(order) == 0:
        raise HTTPException(status_code=400, detail="order 必須為非空字串陣列")
    db = get_db()
    batch = db.batch()
    for i, stock_id in enumerate(order):
        ref = db.collection("holdings").document(str(stock_id))
        batch.update(ref, {"sort_index": i})
    batch.commit()
    return {"success": True, "data": {"reordered": len(order)}}


# ─── POST /holdings/recalculate ───────────────────────────────────────────────

@router.post("/recalculate")
async def recalculate(body: list[dict]):
    if not body:
        raise HTTPException(status_code=400, detail="Request body 必須為非空陣列")
    db = get_db()
    batch = db.batch()
    for h in body:
        stock_id = h.get("stockId")
        if not stock_id:
            continue
        ref = db.collection("holdings").document(str(stock_id))
        payload = {
            "stock_id":        stock_id,
            "shares_held":     h.get("sharesHeld", 0),
            "avg_cost":        h.get("avgCost", 0),
            "total_cost":      h.get("totalCost", 0),
            "realized_profit": h.get("realizedProfit", 0),
            "cost_method":     h.get("costMethod", "preserve_method"),
            "updated_at":      fs.SERVER_TIMESTAMP,
        }
        stock_name = h.get("stockName")
        if stock_name:
            payload["stock_name"] = stock_name
        batch.set(ref, payload, merge=True)
    batch.commit()
    return {"success": True, "data": {"updated": len(body)}}


# ─── POST /holdings/:stockCode/tags (M2-B) ────────────────────────────────────

@router.post("/{stock_code}/tags")
async def create_asset_tag(stock_code: str, body: dict):
    tag_name   = body.get("tagName", "").strip()
    weight_ratio = body.get("weightRatio")

    if not tag_name:
        raise HTTPException(status_code=400, detail="tagName 為必填欄位")
    if not isinstance(weight_ratio, (int, float)) or weight_ratio <= 0 or weight_ratio > 100:
        raise HTTPException(status_code=400, detail="weightRatio 必須為 0 < value ≤ 100 的數字")

    db = get_db()
    tag_snap = db.collection("tags").where(filter=FieldFilter("name", "==", tag_name)).limit(1).get()
    if not list(tag_snap):
        raise HTTPException(status_code=400, detail=f'Tag "{tag_name}" 不存在')

    ref = db.collection("asset_tags").document()
    ref.set({"stock_code": stock_code, "tag_name": tag_name, "weight_ratio": weight_ratio})
    created = deserialize_asset_tag(ref.get())
    holding_doc = db.collection("holdings").document(stock_code).get()
    stock_name = holding_doc.to_dict().get("stock_name") if holding_doc.exists else None
    return {"success": True, "data": {**created, "stockName": stock_name}}


# ─── PUT /holdings/:stockCode/tags/:id (M2-B) ─────────────────────────────────

@router.put("/{stock_code}/tags/{tag_id}")
async def update_asset_tag(stock_code: str, tag_id: str, body: dict):
    weight_ratio = body.get("weightRatio")
    if not isinstance(weight_ratio, (int, float)) or weight_ratio <= 0 or weight_ratio > 100:
        raise HTTPException(status_code=400, detail="weightRatio 必須為 0 < value ≤ 100 的數字")

    db = get_db()
    ref = db.collection("asset_tags").document(tag_id)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail="AssetTag 不存在")
    ref.update({"weight_ratio": weight_ratio})
    updated = deserialize_asset_tag(ref.get())
    holding_doc = db.collection("holdings").document(stock_code).get()
    stock_name = holding_doc.to_dict().get("stock_name") if holding_doc.exists else None
    return {"success": True, "data": {**updated, "stockName": stock_name}}


# ─── DELETE /holdings/:stockCode/tags/:id (M2-B) ──────────────────────────────

@router.delete("/{stock_code}/tags/{tag_id}")
async def delete_asset_tag(stock_code: str, tag_id: str):
    db = get_db()
    ref = db.collection("asset_tags").document(tag_id)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail="AssetTag 不存在")
    ref.delete()
    return {"success": True, "data": {"deleted": tag_id}}
