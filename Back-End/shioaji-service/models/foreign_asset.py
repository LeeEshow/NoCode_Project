from __future__ import annotations
import asyncio
from typing import Optional
from google.cloud.firestore import SERVER_TIMESTAMP
from lib.firebase import get_db

COL = "foreign_assets"
ALLOWED_CURRENCIES = ["USD", "JPY", "EUR", "CNY", "HKD", "GBP", "AUD", "SGD"]
ALLOWED_TYPES = ["活存", "定存", "債券"]


def _ts_to_iso(ts) -> Optional[str]:
    return ts.isoformat() if hasattr(ts, "isoformat") else None


def _from_doc(doc) -> dict:
    d = doc.to_dict()
    return {
        "id": doc.id,
        "type": d.get("type", ""),
        "name": d.get("name", ""),
        "currency": d.get("currency", ""),
        "amount": d.get("amount", 0),
        "interestRate": d.get("interest_rate", 0),
        "maturityDate": d.get("maturity_date"),
        "useManualRate": d.get("use_manual_rate", False),
        "manualRate": d.get("manual_rate", 0),
        "updatedAt": _ts_to_iso(d.get("updated_at")),
    }


async def find_all() -> list[dict]:
    def _run():
        snap = get_db().collection(COL).order_by("updated_at", direction="DESCENDING").get()
        return [_from_doc(d) for d in snap]
    return await asyncio.to_thread(_run)


async def find_by_id(doc_id: str) -> Optional[dict]:
    def _run():
        doc = get_db().collection(COL).document(doc_id).get()
        return _from_doc(doc) if doc.exists else None
    return await asyncio.to_thread(_run)


async def create(data: dict) -> dict:
    def _run():
        ref = get_db().collection(COL).document()
        ref.set({
            "type": data["type"],
            "name": data.get("name", ""),
            "currency": data["currency"].upper(),
            "amount": data["amount"],
            "interest_rate": data.get("interestRate", 0),
            "maturity_date": data.get("maturityDate"),
            "use_manual_rate": data.get("useManualRate", False),
            "manual_rate": data.get("manualRate", 0),
            "updated_at": SERVER_TIMESTAMP,
        })
        return _from_doc(ref.get())
    return await asyncio.to_thread(_run)


async def update(doc_id: str, patch: dict) -> Optional[dict]:
    def _run():
        ref = get_db().collection(COL).document(doc_id)
        if not ref.get().exists:
            return None
        data: dict = {"updated_at": SERVER_TIMESTAMP}
        if "type" in patch:          data["type"]            = patch["type"]
        if "name" in patch:          data["name"]            = patch["name"]
        if "currency" in patch:      data["currency"]        = patch["currency"].upper()
        if "amount" in patch:        data["amount"]          = patch["amount"]
        if "interestRate" in patch:  data["interest_rate"]   = patch["interestRate"]
        if "maturityDate" in patch:  data["maturity_date"]   = patch["maturityDate"]
        if "useManualRate" in patch: data["use_manual_rate"] = patch["useManualRate"]
        if "manualRate" in patch:    data["manual_rate"]     = patch["manualRate"]
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
