from fastapi import APIRouter, HTTPException
from services.firestore import get_db

router = APIRouter()

VALID_STATES = {"neutral", "risk-on", "risk-off", "liquidity-dry"}
COL    = "market_state"
DOC_ID = "main"


def deserialize_tag(doc) -> dict:
    d = doc.to_dict()
    msp = d.get("market_state_presets")
    return {
        "id":       doc.id,
        "name":     d.get("name"),
        "baseRisk": d.get("base_risk", 0),
        "dynamicRisk": d.get("dynamic_risk") if d.get("dynamic_risk") is not None else d.get("base_risk", 0),
        "marketStatePresets": {
            "riskOn":       msp.get("risk_on")       if msp else None,
            "riskOff":      msp.get("risk_off")      if msp else None,
            "liquidityDry": msp.get("liquidity_dry") if msp else None,
        } if msp else None,
    }


# ─── GET /market-state ─────────────────────────────────────────────────────────

@router.get("")
async def get_market_state():
    db = get_db()
    doc = db.collection(COL).document(DOC_ID).get()
    current = "neutral"
    if doc.exists:
        current = doc.to_dict().get("current", "neutral")
    return {"success": True, "data": {"current": current}}


# ─── PUT /market-state ─────────────────────────────────────────────────────────

@router.put("")
async def update_market_state(body: dict):
    state = body.get("state")
    if state not in VALID_STATES:
        raise HTTPException(status_code=400,
            detail=f"state 必須為：{' | '.join(sorted(VALID_STATES))}")

    db = get_db()
    tags_snap = db.collection("tags").get()
    tags = [deserialize_tag(doc) for doc in tags_snap]

    # 批次更新 dynamicRisk
    batch = db.batch()
    for tag in tags:
        presets = tag.get("marketStatePresets")
        if state == "risk-on":
            dynamic_risk = presets["riskOn"] if presets and presets["riskOn"] is not None else tag["baseRisk"]
        elif state == "risk-off":
            dynamic_risk = presets["riskOff"] if presets and presets["riskOff"] is not None else tag["baseRisk"]
        elif state == "liquidity-dry":
            dynamic_risk = presets["liquidityDry"] if presets and presets["liquidityDry"] is not None else tag["baseRisk"]
        else:
            dynamic_risk = tag["baseRisk"]

        batch.update(db.collection("tags").document(tag["id"]), {"dynamic_risk": dynamic_risk})

    batch.commit()

    # 寫入 market_state
    db.collection(COL).document(DOC_ID).set({"current": state})

    return {"success": True, "data": {"state": state, "updatedTags": len(tags)}}
