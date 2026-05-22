from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from google.cloud.firestore import SERVER_TIMESTAMP

from services.firestore import db
from routers.schemas import UpdateCorrelationMatrixPayload, success

router = APIRouter()
logger = logging.getLogger(__name__)

_COL    = "tag_correlation_matrix"
_DOC_ID = "main"


def _deserialize_entries(raw) -> list:
    if not raw:
        return []
    return [{"tagA": e.get("tag_a", ""), "tagB": e.get("tag_b", ""), "rho": e.get("rho", 0)} for e in raw]


def _deserialize(doc) -> dict:
    d = doc.to_dict()
    lu = d.get("last_updated")
    return {
        "lastUpdated":    lu.isoformat() if hasattr(lu, "isoformat") else datetime.now(timezone.utc).isoformat(),
        "entries":        _deserialize_entries(d.get("entries")),
        "previousEntries": _deserialize_entries(d.get("previous_entries")) if d.get("previous_entries") is not None else None,
    }


# ── GET /tag-correlation-matrix ───────────────────────────────────────────────

@router.get("")
def get_correlation_matrix():
    doc = db.collection(_COL).document(_DOC_ID).get()
    if not doc.exists:
        return success({
            "lastUpdated":    datetime.now(timezone.utc).isoformat(),
            "entries":        [],
            "previousEntries": None,
        })
    return success(_deserialize(doc))


# ── PUT /tag-correlation-matrix ───────────────────────────────────────────────

@router.put("")
async def update_correlation_matrix(payload: UpdateCorrelationMatrixPayload):
    entries = payload.entries

    # 驗證：tagA ≠ tagB
    for e in entries:
        if e.tagA == e.tagB:
            raise HTTPException(status_code=400, detail=f"tagA 與 tagB 不可相同（{e.tagA}）")

    # 驗證：tagA 與 tagB 皆須存在於 tags collection
    all_tags_snap = await asyncio.to_thread(lambda: list(db.collection("tags").stream()))
    existing_names = {doc.to_dict().get("name", "") for doc in all_tags_snap}

    for e in entries:
        if e.tagA not in existing_names:
            raise HTTPException(status_code=400, detail=f'Tag "{e.tagA}" 不存在')
        if e.tagB not in existing_names:
            raise HTTPException(status_code=400, detail=f'Tag "{e.tagB}" 不存在')

    # 備份現有 entries 為 previousEntries
    def _write():
        ref = db.collection(_COL).document(_DOC_ID)
        existing = ref.get()
        prev_entries = (
            existing.to_dict().get("entries")
            if existing.exists else None
        )
        ref.set({
            "last_updated":     SERVER_TIMESTAMP,
            "entries":          [{"tag_a": e.tagA, "tag_b": e.tagB, "rho": e.rho} for e in entries],
            "previous_entries": prev_entries,
        })
        return ref.get()

    updated_doc = await asyncio.to_thread(_write)
    return success(_deserialize(updated_doc))
