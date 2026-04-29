"""舊版投報計畫 model（collection: investment_plans），保留向後相容。"""
from __future__ import annotations
import asyncio
from typing import Optional
from google.cloud.firestore import SERVER_TIMESTAMP
from lib.firebase import get_db

COL = "investment_plans"


def _ts_to_iso(ts) -> Optional[str]:
    return ts.isoformat() if hasattr(ts, "isoformat") else None


def _from_doc(doc) -> dict:
    d = doc.to_dict()
    return {
        "assetType": doc.id,
        "annualInvest": d.get("annual_invest", 0),
        "rBase": d.get("r_base", 0),
        "piBase": d.get("pi_base", 0),
        "piShock": d.get("pi_shock", 0),
        "inflationScenario": d.get("inflation_scenario", "base"),
        "kRisk": d.get("k_risk", 1.0),
        "startYear": d.get("start_year", 0),
        "planYears": d.get("plan_years", 0),
        "createdAt": _ts_to_iso(d.get("created_at")),
        "updatedAt": _ts_to_iso(d.get("updated_at")),
    }


async def find(asset_type: str = "tw_stock") -> Optional[dict]:
    def _run():
        doc = get_db().collection(COL).document(asset_type).get()
        return _from_doc(doc) if doc.exists else None
    return await asyncio.to_thread(_run)


async def upsert(data: dict) -> dict:
    def _run():
        asset_type = data.get("assetType", "tw_stock")
        ref = get_db().collection(COL).document(asset_type)
        existing = ref.get()
        ref.set({
            "asset_type": asset_type,
            "annual_invest": data["annualInvest"],
            "r_base": data["rBase"],
            "pi_base": data["piBase"],
            "pi_shock": data["piShock"],
            "inflation_scenario": data["inflationScenario"],
            "k_risk": data["kRisk"],
            "start_year": data["startYear"],
            "plan_years": data["planYears"],
            "created_at": existing.to_dict().get("created_at", SERVER_TIMESTAMP)
                          if existing.exists else SERVER_TIMESTAMP,
            "updated_at": SERVER_TIMESTAMP,
        }, merge=False)
        return _from_doc(ref.get())
    return await asyncio.to_thread(_run)
