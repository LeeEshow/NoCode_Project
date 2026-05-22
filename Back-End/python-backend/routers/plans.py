from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter
from google.cloud.firestore import SERVER_TIMESTAMP

from services.firestore import db
from routers.schemas import UpdatePlanConfigPayload, success

router = APIRouter()
logger = logging.getLogger(__name__)

_COL    = "plan_config"
_DOC_ID = "main"

_DEFAULTS = {
    "annualInvest":        120000,
    "rBase":               0.08,
    "inflation":           "base",
    "kRisk":               1.0,
    "startYear":           datetime.now().year,
    "overrides":           {},
    "currentYearReinvest": 0,
}


def _deserialize(doc) -> dict:
    d = doc.to_dict()
    ua = d.get("updated_at")
    return {
        "annualInvest":        d.get("annual_invest",          _DEFAULTS["annualInvest"]),
        "rBase":               d.get("r_base",                 _DEFAULTS["rBase"]),
        "inflation":           d.get("inflation",              _DEFAULTS["inflation"]),
        "kRisk":               d.get("k_risk",                 _DEFAULTS["kRisk"]),
        "startYear":           d.get("start_year",             _DEFAULTS["startYear"]),
        "overrides":           d.get("overrides",              {}),
        "currentYearReinvest": d.get("current_year_reinvest",  0),
        "updatedAt":           ua.isoformat() if hasattr(ua, "isoformat") else datetime.now(timezone.utc).isoformat(),
    }


# ── GET /plan ──────────────────────────────────────────────────────────────────

@router.get("")
def get_plan():
    doc = db.collection(_COL).document(_DOC_ID).get()
    if not doc.exists:
        return success({**_DEFAULTS, "updatedAt": datetime.now(timezone.utc).isoformat()})
    return success(_deserialize(doc))


# ── PUT /plan ──────────────────────────────────────────────────────────────────

@router.put("")
def update_plan(payload: UpdatePlanConfigPayload):
    ref = db.collection(_COL).document(_DOC_ID)
    existing = ref.get()
    current = _deserialize(existing) if existing.exists else {**_DEFAULTS, "updatedAt": ""}

    merged = {
        "annual_invest":         payload.annualInvest        if payload.annualInvest        is not None else current["annualInvest"],
        "r_base":                payload.rBase               if payload.rBase               is not None else current["rBase"],
        "inflation":             payload.inflation           if payload.inflation           is not None else current["inflation"],
        "k_risk":                payload.kRisk               if payload.kRisk               is not None else current["kRisk"],
        "start_year":            payload.startYear           if payload.startYear           is not None else current["startYear"],
        "overrides":             payload.overrides           if payload.overrides           is not None else current["overrides"],
        "current_year_reinvest": payload.currentYearReinvest if payload.currentYearReinvest is not None else current["currentYearReinvest"],
        "updated_at":            SERVER_TIMESTAMP,
    }
    ref.set(merged)
    return success(_deserialize(ref.get()))
