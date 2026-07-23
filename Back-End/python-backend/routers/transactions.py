from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse, Response
from firebase_admin import firestore as fs
from google.cloud.firestore_v1.base_query import FieldFilter
from services.firestore import get_db

router = APIRouter()


def ts_iso(val) -> str:
    if isinstance(val, datetime):
        return val.isoformat()
    return datetime.now(timezone.utc).isoformat()


def deserialize_transaction(doc) -> dict:
    d = doc.to_dict()
    date_val = d.get("date")
    created_val = d.get("created_at")
    return {
        "id":            doc.id,
        "stockId":       d.get("stock_id"),
        "type":          d.get("type"),
        "date":          ts_iso(date_val),
        "shares":        d.get("shares", 0),
        "pricePerShare": d.get("price_per_share", 0),
        "fee":           d.get("fee", 0),
        "note":          d.get("note", ""),
        "createdAt":     ts_iso(created_val),
    }


# ─── GET /transactions ─────────────────────────────────────────────────────────

@router.get("")
def get_all(
    stock_id:   str | None = Query(default=None, alias="stock_id"),
    start_date: str | None = Query(default=None, alias="start_date"),
    end_date:   str | None = Query(default=None, alias="end_date"),
):
    db = get_db()
    col = db.collection("transactions")
    snap = col.where(filter=FieldFilter("stock_id", "==", stock_id)).get() if stock_id else col.get()
    items = [deserialize_transaction(doc) for doc in snap]
    if start_date:
        items = [t for t in items if t["date"][:10] >= start_date]
    if end_date:
        items = [t for t in items if t["date"][:10] <= end_date]
    items.sort(key=lambda x: x["date"])
    return {"success": True, "data": items}


# ─── GET /transactions/:id ─────────────────────────────────────────────────────

@router.get("/{tx_id}")
def get_by_id(tx_id: str):
    db = get_db()
    doc = db.collection("transactions").document(tx_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="交易紀錄不存在")
    return {"success": True, "data": deserialize_transaction(doc)}


# ─── POST /transactions ────────────────────────────────────────────────────────

@router.post("")
def create(body: dict):
    stock_id      = body.get("stockId")
    tx_type       = body.get("type")
    date          = body.get("date")
    shares        = body.get("shares")
    price_per_share = body.get("pricePerShare")
    fee           = body.get("fee")

    if not all([stock_id, tx_type, date, shares is not None,
                price_per_share is not None, fee is not None]):
        raise HTTPException(
            status_code=400,
            detail="缺少必填欄位：stockId / type / date / shares / pricePerShare / fee",
        )

    db = get_db()
    ref = db.collection("transactions").document()
    ref.set({
        "stock_id":        str(stock_id),
        "type":            str(tx_type),
        "date":            datetime.fromisoformat(str(date).replace("Z", "+00:00")),
        "shares":          float(shares),
        "price_per_share": float(price_per_share),
        "fee":             float(fee),
        "note":            str(body.get("note", "")),
        "created_at":      fs.SERVER_TIMESTAMP,
    })
    created = deserialize_transaction(ref.get())
    return JSONResponse(status_code=201, content={"success": True, "data": created})


# ─── PUT /transactions/:id ─────────────────────────────────────────────────────

@router.put("/{tx_id}")
def update(tx_id: str, body: dict):
    db = get_db()
    ref = db.collection("transactions").document(tx_id)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail="交易紀錄不存在")

    patch: dict = {}
    if "stockId"       in body: patch["stock_id"]        = str(body["stockId"])
    if "type"          in body: patch["type"]             = str(body["type"])
    if "date"          in body:
        patch["date"] = datetime.fromisoformat(str(body["date"]).replace("Z", "+00:00"))
    if "shares"        in body: patch["shares"]           = float(body["shares"])
    if "pricePerShare" in body: patch["price_per_share"]  = float(body["pricePerShare"])
    if "fee"           in body: patch["fee"]              = float(body["fee"])
    if "note"          in body: patch["note"]             = str(body["note"])

    ref.update(patch)
    updated = deserialize_transaction(ref.get())
    return {"success": True, "data": updated}


# ─── DELETE /transactions/:id ──────────────────────────────────────────────────

@router.delete("/{tx_id}", status_code=204)
def remove(tx_id: str):
    db = get_db()
    ref = db.collection("transactions").document(tx_id)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail="交易紀錄不存在")
    ref.delete()
    return Response(status_code=204)
