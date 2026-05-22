from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor
from fastapi import APIRouter, HTTPException
from firebase_admin import firestore as fs
from services.firestore import get_db
from services.yahoo_finance import get_quote, get_all_stocks

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
    snap = col.where("stock_code", "==", stock_code).get() if stock_code else col.get()
    return [deserialize_asset_tag(doc) for doc in snap]


def asset_tag_to_dto(at: dict, name_map: dict) -> dict:
    """createForHolding 回傳的 DTO（含 stockName）"""
    return {
        "id":          at["id"],
        "stockCode":   at["stockCode"],
        "stockName":   name_map.get(at["stockCode"]),
        "tagName":     at["tagName"],
        "weightRatio": at["weightRatio"],
    }


def build_name_map() -> dict[str, str]:
    all_stocks = get_all_stocks()
    return {s.get("code"): s.get("name") for s in all_stocks if s.get("code")}


# ─── GET /holdings ─────────────────────────────────────────────────────────────

def _fetch_quotes_parallel(stock_ids: list[str]) -> dict[str, dict]:
    """並行抓取多支股票報價，12 秒整體 timeout"""
    if not stock_ids:
        return {}
    quotes: dict[str, dict] = {}
    pool = ThreadPoolExecutor(max_workers=min(len(stock_ids), 8))
    futs = {pool.submit(get_quote, sid): sid for sid in stock_ids}
    for fut, sid in futs.items():
        try:
            quotes[sid] = fut.result(timeout=12)
        except Exception:
            pass
    pool.shutdown(wait=False)
    return quotes


@router.get("/")
async def get_all():
    holdings = find_all_holdings()
    all_asset_tags = find_all_asset_tags()

    tags_by_stock: dict[str, list] = {}
    for at in all_asset_tags:
        code = at["stockCode"]
        tags_by_stock.setdefault(code, []).append({
            "id":          at["id"],
            "tagName":     at["tagName"],
            "weightRatio": at["weightRatio"],
        })

    active_ids = [h["stockId"] for h in holdings if h["sharesHeld"] > 0]
    quotes = _fetch_quotes_parallel(active_ids)

    result = []
    for h in holdings:
        if h["sharesHeld"] > 0:
            q = quotes.get(h["stockId"], {})
            if q:
                h["stockName"]     = q.get("name", h["stockId"])
                h["currentPrice"]  = q.get("price", 0)
                h["change"]        = q.get("change", 0)
                h["changePercent"] = q.get("changePercent", 0)
        h["tags"] = tags_by_stock.get(h["stockId"], [])
        result.append(h)

    return {"success": True, "data": result}


# ─── GET /holdings/prices ──────────────────────────────────────────────────────

@router.get("/prices")
async def get_prices():
    holdings = find_all_holdings()
    active = [h for h in holdings if h["sharesHeld"] > 0]

    quotes = _fetch_quotes_parallel([h["stockId"] for h in active])

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
            "changePct":        q.get("changePercent", 0),  # 注意：changePct 非 changePercent
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
        try:
            q = get_quote(stock_id)
            h["stockName"]    = q["name"]
            h["currentPrice"] = q["price"]
            h["change"]       = q["change"]
            h["changePercent"]= q["changePercent"]
        except Exception:
            pass
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
    name_map = build_name_map()
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
        stock_name = h.get("stockName") or name_map.get(stock_id)
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
    tag_snap = db.collection("tags").where("name", "==", tag_name).limit(1).get()
    if not list(tag_snap):
        raise HTTPException(status_code=400, detail=f'Tag "{tag_name}" 不存在')

    ref = db.collection("asset_tags").document()
    ref.set({"stock_code": stock_code, "tag_name": tag_name, "weight_ratio": weight_ratio})
    created = deserialize_asset_tag(ref.get())
    name_map = build_name_map()
    return {"success": True, "data": asset_tag_to_dto(created, name_map)}


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
    name_map = build_name_map()
    return {"success": True, "data": asset_tag_to_dto(updated, name_map)}


# ─── DELETE /holdings/:stockCode/tags/:id (M2-B) ──────────────────────────────

@router.delete("/{stock_code}/tags/{tag_id}")
async def delete_asset_tag(stock_code: str, tag_id: str):
    db = get_db()
    ref = db.collection("asset_tags").document(tag_id)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail="AssetTag 不存在")
    ref.delete()
    return {"success": True, "data": {"deleted": tag_id}}
