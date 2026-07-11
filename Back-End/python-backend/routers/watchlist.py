import asyncio
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from firebase_admin import firestore as fs
from services.firestore import get_db
from services.quote_service import get_quotes

router = APIRouter()


def ts_iso(val) -> str:
    if isinstance(val, datetime):
        return val.isoformat()
    return datetime.now(timezone.utc).isoformat()


def deserialize_watchlist(doc) -> dict:
    d = doc.to_dict()
    return {
        "stockId":     doc.id,
        "stockName":   d.get("stock_name", ""),
        "targetPrice": d.get("target_price", 0),
        "note":        d.get("note", ""),
        "group":       d.get("group"),
        "createdAt":   ts_iso(d.get("created_at")),
        "updatedAt":   ts_iso(d.get("updated_at")),
        "sortIndex":   d.get("sort_index", 0),
    }


def find_all() -> list[dict]:
    db = get_db()
    snap = db.collection("watchlist").get()
    items = [deserialize_watchlist(doc) for doc in snap]
    return sorted(items, key=lambda x: x["sortIndex"])


# ─── GET /watchlist ────────────────────────────────────────────────────────────

@router.get("")
async def get_all():
    items = await asyncio.to_thread(find_all)

    stock_ids = [item["stockId"] for item in items]
    quotes = await get_quotes(stock_ids)

    result = []
    for item in items:
        q = quotes.get(item["stockId"], {})
        price = q.get("price", 0) or 0
        if price > 0:
            live_price  = price
            change      = q.get("change")
            change_pct  = q.get("changePercent")
            judgment    = "買進" if live_price <= item["targetPrice"] else "觀望"
        else:
            live_price = change = change_pct = judgment = None

        result.append({
            **item,
            "livePrice":     live_price,
            "change":        change,
            "changePercent": change_pct,
            "judgment":      judgment,
            "quoteSource":   q.get("quoteSource", "unknown"),
            "quoteStatus":   q.get("quoteStatus", "error"),
        })

    return {"success": True, "data": list(result)}


# ─── POST /watchlist ───────────────────────────────────────────────────────────

@router.post("")
def create(body: dict):
    stock_id = body.get("stockId")
    target_price = body.get("targetPrice")
    if not stock_id or target_price is None:
        raise HTTPException(status_code=400, detail="缺少必填欄位：stockId / targetPrice")

    db = get_db()
    ref = db.collection("watchlist").document(str(stock_id))
    if ref.get().exists:
        raise HTTPException(status_code=409, detail=f"關注清單已存在：{stock_id}")

    group = body.get("group")
    ref.set({
        "stock_id":     str(stock_id),
        "stock_name":   str(body.get("stockName", "")),
        "target_price": float(target_price),
        "note":         str(body.get("note", "")),
        "group":        group if isinstance(group, str) else None,
        "created_at":   fs.SERVER_TIMESTAMP,
        "updated_at":   fs.SERVER_TIMESTAMP,
    })
    created = deserialize_watchlist(ref.get())
    return {"success": True, "data": created}


# ─── PUT /watchlist/reorder ────────────────────────────────────────────────────

@router.put("/reorder")
def reorder(body: dict):
    order = body.get("order")
    if not isinstance(order, list) or len(order) == 0:
        raise HTTPException(status_code=400, detail="order 必須為非空字串陣列")
    db = get_db()
    batch = db.batch()
    for i, stock_id in enumerate(order):
        ref = db.collection("watchlist").document(str(stock_id))
        batch.update(ref, {"sort_index": i})
    batch.commit()
    return {"success": True, "data": {"reordered": len(order)}}


# ─── PUT /watchlist/:stockId ───────────────────────────────────────────────────

@router.put("/{stock_id}")
def update(stock_id: str, body: dict):
    target_price = body.get("targetPrice")
    note = body.get("note")
    group = body.get("group", "__unset__")
    if target_price is None and note is None and group == "__unset__":
        raise HTTPException(status_code=400, detail="至少需提供 targetPrice、note 或 group 其中一個欄位")

    db = get_db()
    ref = db.collection("watchlist").document(stock_id)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail=f"關注清單不存在：{stock_id}")

    patch: dict = {"updated_at": fs.SERVER_TIMESTAMP}
    if target_price is not None:
        patch["target_price"] = float(target_price)
    if note is not None:
        patch["note"] = str(note)
    if group != "__unset__":
        patch["group"] = group if isinstance(group, str) else None
    ref.update(patch)
    updated = deserialize_watchlist(ref.get())
    return {"success": True, "data": updated}


# ─── DELETE /watchlist/:stockId ────────────────────────────────────────────────

@router.delete("/{stock_id}")
def remove(stock_id: str):
    db = get_db()
    ref = db.collection("watchlist").document(stock_id)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail=f"關注清單不存在：{stock_id}")
    ref.delete()
    return {"success": True, "data": {"deleted": stock_id}}
