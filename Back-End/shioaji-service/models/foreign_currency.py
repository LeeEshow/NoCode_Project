"""@deprecated 已由 foreign_asset 取代。保留供 snapshot 計算讀取舊資料。"""
from __future__ import annotations
import asyncio
from typing import Optional
from google.cloud.firestore import SERVER_TIMESTAMP
from lib.firebase import get_db

COL = "foreign_currencies"
ALLOWED_CODES = ["USD", "JPY", "EUR", "CNY", "HKD", "GBP", "AUD", "SGD"]


def _ts_to_iso(ts) -> Optional[str]:
    return ts.isoformat() if hasattr(ts, "isoformat") else None


def _from_doc(doc) -> dict:
    d = doc.to_dict()
    return {
        "currencyCode": d.get("currency_code", doc.id),
        "amount": d.get("amount", 0),
        "useManualRate": d.get("use_manual_rate", False),
        "manualRate": d.get("manual_rate", 0),
        "updatedAt": _ts_to_iso(d.get("updated_at")),
    }


async def find_all() -> list[dict]:
    def _run():
        snap = get_db().collection(COL).get()
        return [_from_doc(d) for d in snap]
    return await asyncio.to_thread(_run)


async def find_by_code(code: str) -> Optional[dict]:
    def _run():
        doc = get_db().collection(COL).document(code.upper()).get()
        return _from_doc(doc) if doc.exists else None
    return await asyncio.to_thread(_run)


async def upsert(data: dict) -> dict:
    def _run():
        code = data["currencyCode"].upper()
        ref = get_db().collection(COL).document(code)
        ref.set({
            "currency_code": code,
            "amount": data["amount"],
            "use_manual_rate": data["useManualRate"],
            "manual_rate": data["manualRate"],
            "updated_at": SERVER_TIMESTAMP,
        }, merge=True)
        return _from_doc(ref.get())
    return await asyncio.to_thread(_run)


async def delete(code: str) -> bool:
    def _run():
        ref = get_db().collection(COL).document(code.upper())
        if not ref.get().exists:
            return False
        ref.delete()
        return True
    return await asyncio.to_thread(_run)
