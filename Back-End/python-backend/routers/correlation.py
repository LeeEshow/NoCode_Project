from datetime import datetime, timezone
from fastapi import APIRouter
from firebase_admin import firestore as fs
from services.firestore import get_db

router = APIRouter()

COL    = "tag_correlation_matrix"
DOC_ID = "main"


def deserialize_entries(raw) -> list[dict]:
    if not raw:
        return []
    return [
        {"tagA": e.get("tag_a"), "tagB": e.get("tag_b"), "rho": e.get("rho")}
        for e in raw
    ]


def deserialize_matrix(doc) -> dict:
    d = doc.to_dict()
    lu = d.get("last_updated")
    if hasattr(lu, "isoformat"):
        last_updated = lu.isoformat()
    else:
        last_updated = datetime.now(timezone.utc).isoformat()

    prev = d.get("previous_entries")
    return {
        "lastUpdated":    last_updated,
        "entries":        deserialize_entries(d.get("entries", [])),
        "previousEntries": deserialize_entries(prev) if prev is not None else None,
    }


# ─── GET /tag-correlation-matrix ───────────────────────────────────────────────

@router.get("/")
async def get_matrix():
    db = get_db()
    doc = db.collection(COL).document(DOC_ID).get()
    if not doc.exists:
        return {
            "success": True,
            "data": {
                "lastUpdated":    datetime.now(timezone.utc).isoformat(),
                "entries":        [],
                "previousEntries": None,
            },
        }
    return {"success": True, "data": deserialize_matrix(doc)}


# ─── PUT /tag-correlation-matrix ───────────────────────────────────────────────

@router.put("/")
async def update_matrix(body: dict):
    entries_raw = body.get("entries", [])
    db = get_db()
    ref = db.collection(COL).document(DOC_ID)
    existing = ref.get()

    # 備份現有 entries → previous_entries
    prev_entries = None
    if existing.exists:
        prev_entries = existing.to_dict().get("entries")  # 保持 snake_case 原格式

    serialized_entries = [
        {"tag_a": e.get("tagA"), "tag_b": e.get("tagB"), "rho": e.get("rho")}
        for e in entries_raw
    ]

    ref.set({
        "last_updated":    fs.SERVER_TIMESTAMP,
        "entries":         serialized_entries,
        "previous_entries": prev_entries,
    })
    return {"success": True, "data": deserialize_matrix(ref.get())}
