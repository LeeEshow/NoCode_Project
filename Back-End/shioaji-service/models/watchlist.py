from __future__ import annotations
import asyncio
from typing import Optional
from google.cloud.firestore import SERVER_TIMESTAMP
from lib.firebase import get_db

COL = "watchlist"


def _ts_to_iso(ts) -> Optional[str]:
    return ts.isoformat() if hasattr(ts, "isoformat") else None


def _from_doc(doc) -> dict:
    d = doc.to_dict()
    return {
        "stockId": doc.id,
        "targetPrice": d.get("target_price", 0),
        "note": d.get("note", ""),
        "createdAt": _ts_to_iso(d.get("created_at")),
        "updatedAt": _ts_to_iso(d.get("updated_at")),
        "sortIndex": d.get("sort_index", 0),
    }


async def find_all() -> list[dict]:
    def _run():
        snap = get_db().collection(COL).get()
        docs = [_from_doc(d) for d in snap]
        return sorted(docs, key=lambda w: w["sortIndex"])
    return await asyncio.to_thread(_run)


async def find_by_stock_id(stock_id: str) -> Optional[dict]:
    def _run():
        doc = get_db().collection(COL).document(stock_id).get()
        return _from_doc(doc) if doc.exists else None
    return await asyncio.to_thread(_run)


async def create(stock_id: str, target_price: float, note: str = "") -> Optional[dict]:
    def _run():
        ref = get_db().collection(COL).document(stock_id)
        if ref.get().exists:
            return None
        ref.set({
            "stock_id": stock_id,
            "target_price": target_price,
            "note": note,
            "created_at": SERVER_TIMESTAMP,
            "updated_at": SERVER_TIMESTAMP,
        })
        return _from_doc(ref.get())
    return await asyncio.to_thread(_run)


async def update(stock_id: str, patch: dict) -> Optional[dict]:
    def _run():
        ref = get_db().collection(COL).document(stock_id)
        if not ref.get().exists:
            return None
        data: dict = {"updated_at": SERVER_TIMESTAMP}
        if "targetPrice" in patch: data["target_price"] = patch["targetPrice"]
        if "note" in patch:        data["note"]         = patch["note"]
        ref.update(data)
        return _from_doc(ref.get())
    return await asyncio.to_thread(_run)


async def delete(stock_id: str) -> bool:
    def _run():
        ref = get_db().collection(COL).document(stock_id)
        if not ref.get().exists:
            return False
        ref.delete()
        return True
    return await asyncio.to_thread(_run)


async def reorder(order: list[str]) -> None:
    def _run():
        db = get_db()
        batch = db.batch()
        for index, stock_id in enumerate(order):
            batch.update(db.collection(COL).document(stock_id), {"sort_index": index})
        batch.commit()
    await asyncio.to_thread(_run)
