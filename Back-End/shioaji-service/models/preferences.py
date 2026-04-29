from __future__ import annotations
import asyncio
from google.cloud.firestore import SERVER_TIMESTAMP
from lib.firebase import get_db

COL = "preferences"
DOC_ID = "default"

_DEFAULTS = {
    "chart": {
        "showK": True,
        "showMA5": True,
        "showMA20": True,
        "showMA60": True,
        "showVolume": True,
        "zoomLock": False,
    }
}


def _from_data(d: dict) -> dict:
    chart = d.get("chart", {})
    return {
        "chart": {
            "showK":      chart.get("showK",      True),
            "showMA5":    chart.get("showMA5",    True),
            "showMA20":   chart.get("showMA20",   True),
            "showMA60":   chart.get("showMA60",   True),
            "showVolume": chart.get("showVolume", True),
            "zoomLock":   chart.get("zoomLock",   False),
        }
    }


async def find() -> dict:
    def _run():
        doc = get_db().collection(COL).document(DOC_ID).get()
        return _from_data(doc.to_dict()) if doc.exists else _DEFAULTS.copy()
    return await asyncio.to_thread(_run)


async def merge(patch: dict) -> dict:
    def _run():
        ref = get_db().collection(COL).document(DOC_ID)
        doc = ref.get()
        current = _from_data(doc.to_dict()) if doc.exists else _DEFAULTS.copy()
        updated = {
            **current,
            **{k: v for k, v in patch.items() if k != "chart"},
            "chart": {**current["chart"], **patch.get("chart", {})},
        }
        ref.set({"chart": updated["chart"], "updated_at": SERVER_TIMESTAMP}, merge=True)
        return updated
    return await asyncio.to_thread(_run)
