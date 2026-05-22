from __future__ import annotations

import asyncio
import logging
from typing import Optional, Any

from fastapi import APIRouter
from pydantic import BaseModel

from services.firestore import db
from routers.schemas import success

router = APIRouter()
logger = logging.getLogger(__name__)

_DOC = ("preferences", "default")

_DEFAULTS: dict[str, Any] = {
    "language": "zh-TW",
    "theme": "light",
    "defaultDays": 90,
}


class UpdatePreferencesPayload(BaseModel):
    language: Optional[str] = None
    theme: Optional[str] = None
    defaultDays: Optional[int] = None

    model_config = {"extra": "allow"}


# ── GET /preferences ───────────────────────────────────────────────────────────

@router.get("")
async def get_preferences():
    def _read():
        doc = db.collection(_DOC[0]).document(_DOC[1]).get()
        if not doc.exists:
            return _DEFAULTS.copy()
        d = doc.to_dict() or {}
        return {
            "language":    d.get("language",     _DEFAULTS["language"]),
            "theme":       d.get("theme",         _DEFAULTS["theme"]),
            "defaultDays": d.get("default_days",  _DEFAULTS["defaultDays"]),
            **{k: v for k, v in d.items() if k not in {"language", "theme", "default_days"}},
        }

    return success(await asyncio.to_thread(_read))


# ── PUT /preferences ───────────────────────────────────────────────────────────

@router.put("")
async def update_preferences(body: UpdatePreferencesPayload):
    extra = body.model_extra or {}
    updates: dict = {}

    if body.language is not None:
        updates["language"] = body.language
    if body.theme is not None:
        updates["theme"] = body.theme
    if body.defaultDays is not None:
        updates["default_days"] = body.defaultDays
    for k, v in extra.items():
        updates[k] = v

    if not updates:
        return success({})

    def _write():
        db.collection(_DOC[0]).document(_DOC[1]).set(updates, merge=True)

    await asyncio.to_thread(_write)
    result = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    result.update(extra)
    return success(result)
