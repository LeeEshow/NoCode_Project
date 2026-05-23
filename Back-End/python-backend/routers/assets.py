from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from firebase_admin import firestore as fs
from services.firestore import get_db
from services.rate_helper import get_live_rate_map

router = APIRouter()

ALLOWED_CURRENCIES = ["USD", "JPY", "EUR", "CNY", "HKD", "GBP", "AUD", "SGD"]
ALLOWED_TYPES = ["活存", "定存", "債券"]


def ts_iso(val) -> str:
    if isinstance(val, datetime):
        return val.isoformat()
    return datetime.now(timezone.utc).isoformat()


def deserialize_asset(doc) -> dict:
    d = doc.to_dict()
    return {
        "id":            doc.id,
        "type":          d.get("type"),
        "name":          d.get("name", ""),
        "currency":      d.get("currency"),
        "amount":        d.get("amount", 0),
        "interestRate":  d.get("interest_rate", 0),
        "maturityDate":  d.get("maturity_date"),
        "useManualRate": d.get("use_manual_rate", False),
        "manualRate":    d.get("manual_rate", 0),
        "updatedAt":     ts_iso(d.get("updated_at")),
    }


def validate_input(body: dict) -> None:
    if body.get("type") not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="type 必須為 活存 | 定存 | 債券")
    currency = str(body.get("currency", "")).upper()
    if currency not in ALLOWED_CURRENCIES:
        raise HTTPException(
            status_code=400,
            detail=f"currency 必須為 {' | '.join(ALLOWED_CURRENCIES)}",
        )
    if not isinstance(body.get("amount"), (int, float)) or body["amount"] < 0:
        raise HTTPException(status_code=400, detail="amount 必須為非負數")
    if not isinstance(body.get("interestRate"), (int, float)) or body["interestRate"] < 0:
        raise HTTPException(status_code=400, detail="interestRate 必須為非負數")
    if body.get("type") != "活存" and not body.get("maturityDate"):
        raise HTTPException(status_code=400, detail="定存與債券必須提供 maturityDate（YYYY-MM-DD）")


# ─── GET /foreign-assets ───────────────────────────────────────────────────────

@router.get("")
async def get_all():
    db = get_db()
    snap = db.collection("foreign_assets").order_by("updated_at", direction="DESCENDING").get()
    assets = [deserialize_asset(doc) for doc in snap]

    try:
        rate_map = get_live_rate_map()
    except Exception:
        rate_map = {}

    result = [
        {**a, "liveRate": rate_map.get(a["currency"])}
        for a in assets
    ]
    return {"success": True, "data": result}


# ─── POST /foreign-assets ──────────────────────────────────────────────────────

@router.post("")
async def create(body: dict):
    validate_input(body)
    db = get_db()
    ref = db.collection("foreign_assets").document()
    ref.set({
        "type":           body["type"],
        "name":           str(body.get("name", "")),
        "currency":       str(body["currency"]).upper(),
        "amount":         float(body["amount"]),
        "interest_rate":  float(body["interestRate"]),
        "maturity_date":  body.get("maturityDate"),
        "use_manual_rate": bool(body.get("useManualRate", False)),
        "manual_rate":    float(body.get("manualRate", 0)),
        "updated_at":     fs.SERVER_TIMESTAMP,
    })
    created = deserialize_asset(ref.get())
    return {"success": True, "data": created}


# ─── PUT /foreign-assets/:id ───────────────────────────────────────────────────

@router.put("/{asset_id}")
async def update(asset_id: str, body: dict):
    db = get_db()
    ref = db.collection("foreign_assets").document(asset_id)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail="找不到該外幣資產")

    if body.get("type") and body["type"] not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="type 必須為 活存 | 定存 | 債券")

    patch: dict = {"updated_at": fs.SERVER_TIMESTAMP}
    if "type"          in body: patch["type"]           = body["type"]
    if "name"          in body: patch["name"]           = str(body["name"])
    if "currency"      in body: patch["currency"]       = str(body["currency"]).upper()
    if "amount"        in body: patch["amount"]         = float(body["amount"])
    if "interestRate"  in body: patch["interest_rate"]  = float(body["interestRate"])
    if "maturityDate"  in body: patch["maturity_date"]  = body.get("maturityDate")
    if "useManualRate" in body: patch["use_manual_rate"]= bool(body["useManualRate"])
    if "manualRate"    in body: patch["manual_rate"]    = float(body["manualRate"])

    ref.update(patch)
    updated = deserialize_asset(ref.get())
    return {"success": True, "data": updated}


# ─── DELETE /foreign-assets/:id ────────────────────────────────────────────────

@router.delete("/{asset_id}")
async def remove(asset_id: str):
    db = get_db()
    ref = db.collection("foreign_assets").document(asset_id)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail="找不到該外幣資產")
    ref.delete()
    return {"success": True, "data": {"deleted": True}}
