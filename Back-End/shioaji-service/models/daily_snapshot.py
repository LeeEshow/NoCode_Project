from __future__ import annotations
import asyncio
from typing import Optional
from google.cloud.firestore import SERVER_TIMESTAMP
from lib.firebase import get_db

COL = "daily_snapshots"


def _ts_to_iso(ts) -> Optional[str]:
    return ts.isoformat() if hasattr(ts, "isoformat") else None


def _from_doc(doc) -> dict:
    d = doc.to_dict()
    return {
        "date": d.get("date", ""),
        "totalInvested": d.get("total_invested", 0),
        "stockValue": d.get("stock_value", 0),
        "cashBalance": d.get("cash_balance", 0),
        "forexValue": d.get("forex_value", 0),
        "unrealizedProfit": d.get("unrealized_profit", 0),
        "realizedProfit": d.get("realized_profit", 0),
        "totalReturn": d.get("total_return", 0),
        "returnRate": d.get("return_rate", 0),
        "note": d.get("note", ""),
        "recordedAt": _ts_to_iso(d.get("recorded_at")),
    }


async def find_all(year: Optional[int] = None) -> list[dict]:
    def _run():
        from_date = f"{year}-01-01" if year else "2000-01-01"
        to_date   = f"{year}-12-31" if year else "9999-12-31"
        snap = (
            get_db().collection(COL)
            .where("date", ">=", from_date)
            .where("date", "<=", to_date)
            .order_by("date", direction="DESCENDING")
            .get()
        )
        return [_from_doc(d) for d in snap]
    return await asyncio.to_thread(_run)


async def find_by_range(from_date: str, to_date: str) -> list[dict]:
    def _run():
        snap = (
            get_db().collection(COL)
            .where("date", ">=", from_date)
            .where("date", "<=", to_date)
            .order_by("date", direction="DESCENDING")
            .get()
        )
        return [_from_doc(d) for d in snap]
    return await asyncio.to_thread(_run)


async def find_by_date(date: str) -> Optional[dict]:
    def _run():
        doc = get_db().collection(COL).document(date).get()
        return _from_doc(doc) if doc.exists else None
    return await asyncio.to_thread(_run)


async def find_latest() -> Optional[dict]:
    def _run():
        snap = (
            get_db().collection(COL)
            .order_by("date", direction="DESCENDING")
            .limit(1)
            .get()
        )
        docs = list(snap)
        return _from_doc(docs[0]) if docs else None
    return await asyncio.to_thread(_run)


async def record(data: dict) -> dict:
    def _run():
        ref = get_db().collection(COL).document(data["date"])
        ref.set({
            "date": data["date"],
            "total_invested": data["totalInvested"],
            "stock_value": data["stockValue"],
            "cash_balance": data["cashBalance"],
            "forex_value": data["forexValue"],
            "unrealized_profit": data["unrealizedProfit"],
            "realized_profit": data["realizedProfit"],
            "total_return": data["totalReturn"],
            "return_rate": data["returnRate"],
            "note": data.get("note", ""),
            "recorded_at": SERVER_TIMESTAMP,
        }, merge=True)
        return _from_doc(ref.get())
    return await asyncio.to_thread(_run)


async def update(date: str, patch: dict) -> Optional[dict]:
    def _run():
        ref = get_db().collection(COL).document(date)
        if not ref.get().exists:
            return None
        data: dict = {}
        if "cashBalance" in patch: data["cash_balance"] = patch["cashBalance"]
        if "note" in patch:        data["note"]         = patch["note"]
        if data:
            ref.update(data)
        return _from_doc(ref.get())
    return await asyncio.to_thread(_run)
