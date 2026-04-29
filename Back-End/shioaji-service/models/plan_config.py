from __future__ import annotations
import asyncio
from typing import Optional
from google.cloud.firestore import SERVER_TIMESTAMP
from lib.firebase import get_db

COL = "plan_config"
DOC_ID = "main"

_DEFAULTS = {
    "annualInvest": 120000,
    "rBase": 0.08,
    "inflation": "base",
    "kRisk": 1.0,
    "startYear": None,  # filled at runtime
    "overrides": {},
    "currentYearReinvest": 0,
}


def _ts_to_iso(ts) -> Optional[str]:
    return ts.isoformat() if hasattr(ts, "isoformat") else None


def _from_doc(doc) -> dict:
    from datetime import datetime
    d = doc.to_dict()
    return {
        "annualInvest": d.get("annual_invest", _DEFAULTS["annualInvest"]),
        "rBase": d.get("r_base", _DEFAULTS["rBase"]),
        "inflation": d.get("inflation", _DEFAULTS["inflation"]),
        "kRisk": d.get("k_risk", _DEFAULTS["kRisk"]),
        "startYear": d.get("start_year", datetime.now().year),
        "overrides": d.get("overrides", {}),
        "currentYearReinvest": d.get("current_year_reinvest", 0),
        "updatedAt": _ts_to_iso(d.get("updated_at")),
    }


async def find() -> dict:
    def _run():
        from datetime import datetime
        doc = get_db().collection(COL).document(DOC_ID).get()
        if not doc.exists:
            return {**_DEFAULTS, "startYear": datetime.now().year, "updatedAt": None}
        return _from_doc(doc)
    return await asyncio.to_thread(_run)


async def upsert(data: dict) -> dict:
    def _run():
        ref = get_db().collection(COL).document(DOC_ID)
        ref.set({
            "annual_invest": data["annualInvest"],
            "r_base": data["rBase"],
            "inflation": data["inflation"],
            "k_risk": data["kRisk"],
            "start_year": data["startYear"],
            "overrides": data.get("overrides", {}),
            "current_year_reinvest": data.get("currentYearReinvest", 0),
            "updated_at": SERVER_TIMESTAMP,
        })
        return _from_doc(ref.get())
    return await asyncio.to_thread(_run)
