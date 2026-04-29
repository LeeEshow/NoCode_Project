from __future__ import annotations
import asyncio
from typing import Optional
from google.cloud.firestore import SERVER_TIMESTAMP
from lib.firebase import get_db

COL = "settings"
DOC_ID = "main"


def _ts_to_iso(ts) -> Optional[str]:
    return ts.isoformat() if hasattr(ts, "isoformat") else None


def _from_doc(doc) -> dict:
    d = doc.to_dict()
    return {
        "costMethod": d.get("cost_method", "preserve_method"),
        "updatedAt": _ts_to_iso(d.get("updated_at")),
    }


async def find() -> Optional[dict]:
    def _run():
        doc = get_db().collection(COL).document(DOC_ID).get()
        return _from_doc(doc) if doc.exists else None
    return await asyncio.to_thread(_run)


async def upsert(cost_method: str) -> dict:
    def _run():
        ref = get_db().collection(COL).document(DOC_ID)
        ref.set({"cost_method": cost_method, "updated_at": SERVER_TIMESTAMP}, merge=True)
        return _from_doc(ref.get())
    return await asyncio.to_thread(_run)
