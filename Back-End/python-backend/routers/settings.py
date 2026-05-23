from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from firebase_admin import firestore as fs
from services.firestore import get_db

router = APIRouter()

VALID_COST_METHODS = {"preserve_method", "return_method"}


def deserialize_settings(doc) -> dict:
    d = doc.to_dict()
    ua = d.get("updated_at")
    return {
        "costMethod": d.get("cost_method", "preserve_method"),
        "updatedAt":  ua.isoformat() if hasattr(ua, "isoformat") else datetime.now(timezone.utc).isoformat(),
    }


# ─── GET /settings ────────────────────────────────────────────────────────────

@router.get("")
async def get_settings():
    db = get_db()
    doc = db.collection("settings").document("main").get()
    # 無資料時回傳 null（與 Node.js Settings.find() 一致）
    data = deserialize_settings(doc) if doc.exists else None
    return {"success": True, "data": data}


# ─── PUT /settings ────────────────────────────────────────────────────────────

@router.put("")
async def update_settings(body: dict):
    cost_method = body.get("costMethod")

    if cost_method is not None and cost_method not in VALID_COST_METHODS:
        raise HTTPException(status_code=400,
            detail="costMethod 必須為 preserve_method 或 return_method")

    patch: dict = {"updated_at": fs.SERVER_TIMESTAMP}
    if cost_method is not None:
        patch["cost_method"] = cost_method

    db = get_db()
    ref = db.collection("settings").document("main")
    ref.set(patch, merge=True)
    return {"success": True, "data": deserialize_settings(ref.get())}
