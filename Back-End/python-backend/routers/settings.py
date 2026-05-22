from __future__ import annotations

import asyncio
import logging
from typing import Optional, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, model_validator

from services.firestore import db
from routers.schemas import success

router = APIRouter()
logger = logging.getLogger(__name__)

_DOC = ("settings", "main")

_DEFAULTS = {
    "costMethod": "preserve_method",
}


class UpdateSettingsPayload(BaseModel):
    costMethod: Optional[Literal["preserve_method", "return_method"]] = None

    @model_validator(mode="after")
    def at_least_one(self):
        if self.costMethod is None:
            raise ValueError("至少需要提供一個欄位")
        return self


# ── GET /settings ──────────────────────────────────────────────────────────────

@router.get("")
async def get_settings():
    def _read():
        doc = db.collection(_DOC[0]).document(_DOC[1]).get()
        if not doc.exists:
            return _DEFAULTS.copy()
        d = doc.to_dict() or {}
        return {
            "costMethod": d.get("cost_method", _DEFAULTS["costMethod"]),
        }

    return success(await asyncio.to_thread(_read))


# ── PUT /settings ──────────────────────────────────────────────────────────────

@router.put("")
async def update_settings(body: UpdateSettingsPayload):
    updates: dict = {}
    if body.costMethod is not None:
        updates["cost_method"] = body.costMethod

    def _write():
        db.collection(_DOC[0]).document(_DOC[1]).set(updates, merge=True)

    await asyncio.to_thread(_write)
    return success({"costMethod": body.costMethod})
