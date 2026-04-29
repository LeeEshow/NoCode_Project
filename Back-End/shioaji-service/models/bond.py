"""@deprecated 已由 foreign_asset 取代。保留供 snapshot 計算讀取舊資料。"""
from __future__ import annotations
import asyncio
from typing import Optional
from google.cloud.firestore import SERVER_TIMESTAMP
from lib.firebase import get_db

COL = "bonds"


def _ts_to_iso(ts) -> Optional[str]:
    return ts.isoformat() if hasattr(ts, "isoformat") else None


def _from_doc(doc) -> dict:
    d = doc.to_dict()
    return {
        "id": doc.id,
        "name": d.get("name", ""),
        "couponRate": d.get("coupon_rate", 0),
        "maturityDate": d.get("maturity_date", ""),
        "currency": d.get("currency", ""),
        "faceValue": d.get("face_value", 0),
        "note": d.get("note", ""),
        "createdAt": _ts_to_iso(d.get("created_at")),
        "updatedAt": _ts_to_iso(d.get("updated_at")),
    }


async def find_all() -> list[dict]:
    def _run():
        snap = get_db().collection(COL).order_by("created_at").get()
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
            "name": data["name"],
            "coupon_rate": data["couponRate"],
            "maturity_date": data["maturityDate"],
            "currency": data["currency"].upper(),
            "face_value": data["faceValue"],
            "note": data.get("note", ""),
            "created_at": SERVER_TIMESTAMP,
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
        if "name"         in patch: data["name"]          = patch["name"]
        if "couponRate"   in patch: data["coupon_rate"]   = patch["couponRate"]
        if "maturityDate" in patch: data["maturity_date"] = patch["maturityDate"]
        if "currency"     in patch: data["currency"]      = patch["currency"].upper()
        if "faceValue"    in patch: data["face_value"]    = patch["faceValue"]
        if "note"         in patch: data["note"]          = patch["note"]
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
