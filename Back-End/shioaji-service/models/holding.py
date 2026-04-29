from __future__ import annotations
import asyncio
from typing import Optional
from google.cloud.firestore import SERVER_TIMESTAMP
from lib.firebase import get_db

COL = "holdings"


def _ts_to_iso(ts) -> Optional[str]:
    return ts.isoformat() if hasattr(ts, "isoformat") else None


def _from_doc(doc) -> dict:
    d = doc.to_dict()
    return {
        "stockId": doc.id,
        "sharesHeld": d.get("shares_held", 0),
        "avgCost": d.get("avg_cost", 0),
        "totalCost": d.get("total_cost", 0),
        "realizedProfit": d.get("realized_profit", 0),
        "costMethod": d.get("cost_method", "preserve_method"),
        "updatedAt": _ts_to_iso(d.get("updated_at")),
        "sortIndex": d.get("sort_index", 0),
    }


async def find_all() -> list[dict]:
    def _run():
        snap = get_db().collection(COL).get()
        docs = [_from_doc(d) for d in snap]
        return sorted(docs, key=lambda h: h["sortIndex"])
    return await asyncio.to_thread(_run)


async def find_by_id(stock_id: str) -> Optional[dict]:
    def _run():
        doc = get_db().collection(COL).document(stock_id).get()
        return _from_doc(doc) if doc.exists else None
    return await asyncio.to_thread(_run)


async def reorder(order: list[str]) -> None:
    def _run():
        db = get_db()
        batch = db.batch()
        for index, stock_id in enumerate(order):
            batch.update(db.collection(COL).document(stock_id), {"sort_index": index})
        batch.commit()
    await asyncio.to_thread(_run)


async def batch_upsert(holdings: list[dict]) -> None:
    def _run():
        db = get_db()
        batch = db.batch()
        for h in holdings:
            ref = db.collection(COL).document(h["stockId"])
            batch.set(ref, {
                "stock_id": h["stockId"],
                "shares_held": h["sharesHeld"],
                "avg_cost": h["avgCost"],
                "total_cost": h["totalCost"],
                "realized_profit": h["realizedProfit"],
                "cost_method": h["costMethod"],
                "updated_at": SERVER_TIMESTAMP,
            }, merge=True)
        batch.commit()
    await asyncio.to_thread(_run)
