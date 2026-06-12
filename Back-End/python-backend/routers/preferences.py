from fastapi import APIRouter
from firebase_admin import firestore as fs
from services.firestore import get_db

router = APIRouter()

DEFAULTS = {
    "chart": {
        "showK":      True,
        "showMA5":    True,
        "showMA20":   True,
        "showMA60":   True,
        "showVolume": True,
        "zoomLock":   False,
    },
    "wlCollapsedGroups": [],
}


def _from_firestore(d: dict) -> dict:
    """Firestore 欄位直接是 camelCase（例外規則）"""
    chart_raw = d.get("chart", {})
    return {
        "chart": {
            "showK":      bool(chart_raw.get("showK",      DEFAULTS["chart"]["showK"])),
            "showMA5":    bool(chart_raw.get("showMA5",    DEFAULTS["chart"]["showMA5"])),
            "showMA20":   bool(chart_raw.get("showMA20",   DEFAULTS["chart"]["showMA20"])),
            "showMA60":   bool(chart_raw.get("showMA60",   DEFAULTS["chart"]["showMA60"])),
            "showVolume": bool(chart_raw.get("showVolume", DEFAULTS["chart"]["showVolume"])),
            "zoomLock":   bool(chart_raw.get("zoomLock",  DEFAULTS["chart"]["zoomLock"])),
        },
        "wlCollapsedGroups": list(d.get("wlCollapsedGroups", [])),
    }


# ─── GET /preferences ─────────────────────────────────────────────────────────

@router.get("")
async def get_preferences():
    db = get_db()
    doc = db.collection("preferences").document("default").get()
    if not doc.exists:
        return {"success": True, "data": DEFAULTS}
    return {"success": True, "data": _from_firestore(doc.to_dict())}


# ─── PUT /preferences ─────────────────────────────────────────────────────────

@router.put("")
async def update_preferences(body: dict):
    db = get_db()
    doc = db.collection("preferences").document("default").get()
    current = _from_firestore(doc.to_dict()) if doc.exists else DEFAULTS

    # Deep merge chart
    input_chart = body.get("chart", {})
    merged_chart = {**current["chart"], **input_chart}

    # Direct replace for wlCollapsedGroups
    if "wlCollapsedGroups" in body:
        wl_groups = [str(g) for g in body["wlCollapsedGroups"]]
    else:
        wl_groups = current.get("wlCollapsedGroups", [])

    db.collection("preferences").document("default").set({
        "chart":             merged_chart,
        "wlCollapsedGroups": wl_groups,
        "updated_at":        fs.SERVER_TIMESTAMP,
    }, merge=True)

    return {"success": True, "data": _from_firestore({"chart": merged_chart, "wlCollapsedGroups": wl_groups})}
