from __future__ import annotations
import asyncio
from typing import Optional
from google.cloud.firestore import SERVER_TIMESTAMP
from lib.firebase import get_db

COL = "transactions"


def _ts_to_iso(ts) -> str:
    if hasattr(ts, "isoformat"):
        return ts.isoformat()
    from datetime import datetime, timezone
    return datetime.now(tz=timezone.utc).isoformat()


def _from_doc(doc) -> dict:
    d = doc.to_dict()
    return {
        "id": doc.id,
        "stockId": d.get("stock_id", ""),
        "type": d.get("type", "buy"),
        "date": _ts_to_iso(d.get("date")),
        "shares": d.get("shares", 0),
        "pricePerShare": d.get("price_per_share", 0),
        "fee": d.get("fee", 0),
        "note": d.get("note", ""),
        "createdAt": _ts_to_iso(d.get("created_at")),
    }


async def find_all(stock_id: Optional[str] = None) -> list[dict]:
    def _run():
        col = get_db().collection(COL)
        if stock_id:
            query = col.where("stock_id", "==", stock_id)
        else:
            query = col
        snap = query.get()
        docs = [_from_doc(d) for d in snap]
        return sorted(docs, key=lambda t: t["date"])
    return await asyncio.to_thread(_run)


async def find_by_id(doc_id: str) -> Optional[dict]:
    def _run():
        doc = get_db().collection(COL).document(doc_id).get()
        return _from_doc(doc) if doc.exists else None
    return await asyncio.to_thread(_run)


async def create(data: dict) -> dict:
    def _run():
        db = get_db()
        ref = db.collection(COL).document()
        ref.set({
            "stock_id": data["stockId"],
            "type": data["type"],
            "date": _parse_ts(data["date"]) if data.get("date") else SERVER_TIMESTAMP,
            "shares": data["shares"],
            "price_per_share": data["pricePerShare"],
            "fee": data["fee"],
            "note": data.get("note", ""),
            "created_at": SERVER_TIMESTAMP,
        })
        return _from_doc(ref.get())
    return await asyncio.to_thread(_run)


async def update(doc_id: str, patch: dict) -> Optional[dict]:
    def _run():
        ref = get_db().collection(COL).document(doc_id)
        doc = ref.get()
        if not doc.exists:
            return None
        data: dict = {}
        if "stockId" in patch:       data["stock_id"]        = patch["stockId"]
        if "type" in patch:          data["type"]            = patch["type"]
        if "date" in patch:          data["date"]            = _parse_ts(patch["date"])
        if "shares" in patch:        data["shares"]          = patch["shares"]
        if "pricePerShare" in patch: data["price_per_share"] = patch["pricePerShare"]
        if "fee" in patch:           data["fee"]             = patch["fee"]
        if "note" in patch:          data["note"]            = patch["note"]
        ref.update(data)
        return _from_doc(ref.get())
    return await asyncio.to_thread(_run)


async def delete(doc_id: str) -> bool:
    def _run():
        ref = get_db().collection(COL).document(doc_id)
        if not ref.get().exists:
            return False
        ref.delete()
        return True
    return await asyncio.to_thread(_run)


def _parse_ts(iso_str: str):
    from datetime import datetime, timezone
    dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
    return dt
