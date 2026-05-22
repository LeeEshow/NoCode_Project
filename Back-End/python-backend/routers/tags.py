from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from google.cloud.firestore_v1.base_query import FieldFilter
from services.firestore import get_db
import asyncio
from concurrent.futures import ThreadPoolExecutor
from services.tag_risk_service import recalculate_dynamic_risk

router = APIRouter()

VALID_MARKET_STATES = {"neutral", "risk-on", "risk-off", "liquidity-dry"}
VALID_TRIGGER_DIRS  = {"both", "upper_only", "lower_only"}
VALID_FALLBACKS     = {"hold", "exclude"}


# ─── 反序列化 ──────────────────────────────────────────────────────────────────

def deserialize_tag(doc) -> dict:
    d = doc.to_dict()
    msp_raw = d.get("market_state_presets")
    msp = None
    if msp_raw:
        msp = {
            "riskOn":       msp_raw.get("risk_on"),
            "riskOff":      msp_raw.get("risk_off"),
            "liquidityDry": msp_raw.get("liquidity_dry"),
        }
    return {
        "id":                  doc.id,
        "name":                d.get("name"),
        "baseRisk":            d.get("base_risk", 0),
        "dynamicRisk":         d.get("dynamic_risk") if d.get("dynamic_risk") is not None else d.get("base_risk", 0),
        "targetWeight":        d.get("target_weight"),
        "fallbackBehavior":    d.get("fallback_behavior", "hold"),
        "marketStatePresets":  msp,
        "triggerDirection":    d.get("trigger_direction", "both"),
    }


def serialize_presets(presets) -> dict | None:
    if presets is None:
        return None
    return {
        "risk_on":       presets.get("riskOn"),
        "risk_off":      presets.get("riskOff"),
        "liquidity_dry": presets.get("liquidityDry"),
    }


def validate_presets(presets: dict) -> dict:
    for key in ["riskOn", "riskOff", "liquidityDry"]:
        val = presets.get(key)
        if val is not None:
            if not isinstance(val, (int, float)) or val < 0 or val > 3:
                raise HTTPException(status_code=400,
                    detail=f"marketStatePresets.{key} 必須為 0 ≤ value ≤ 3 的數字")
    return {
        "riskOn":       round(float(presets["riskOn"]), 2) if isinstance(presets.get("riskOn"), (int, float)) else None,
        "riskOff":      round(float(presets["riskOff"]), 2) if isinstance(presets.get("riskOff"), (int, float)) else None,
        "liquidityDry": round(float(presets["liquidityDry"]), 2) if isinstance(presets.get("liquidityDry"), (int, float)) else None,
    }


# ─── GET /tags ─────────────────────────────────────────────────────────────────

@router.get("/")
async def get_all():
    db = get_db()
    snap = db.collection("tags").order_by("name").get()
    return {"success": True, "data": [deserialize_tag(doc) for doc in snap]}


# ─── POST /tags ────────────────────────────────────────────────────────────────

@router.post("/")
async def create(body: dict):
    name = body.get("name")
    base_risk = body.get("baseRisk")

    if not name or not isinstance(name, str) or not name.strip():
        raise HTTPException(status_code=400, detail="name 為必填欄位")
    if not isinstance(base_risk, (int, float)) or base_risk < 0 or base_risk > 3:
        raise HTTPException(status_code=400, detail="baseRisk 必須為 0 ≤ value ≤ 3 的數字")

    target_weight = body.get("targetWeight")
    if target_weight is not None:
        if not isinstance(target_weight, (int, float)) or target_weight <= 0 or target_weight > 100:
            raise HTTPException(status_code=400, detail="targetWeight 必須為 0 < value ≤ 100 的數字")

    fallback = body.get("fallbackBehavior")
    if fallback is not None and fallback not in VALID_FALLBACKS:
        raise HTTPException(status_code=400, detail='fallbackBehavior 必須為 "hold" 或 "exclude"')

    trigger = body.get("triggerDirection")
    if trigger is not None and trigger not in VALID_TRIGGER_DIRS:
        raise HTTPException(status_code=400, detail="triggerDirection 必須為 both | upper_only | lower_only")

    presets_raw = body.get("marketStatePresets")
    presets = validate_presets(presets_raw) if presets_raw is not None else None

    db = get_db()
    existing = db.collection("tags").where(filter=FieldFilter("name", "==", name.strip())).limit(1).get()
    if list(existing):
        raise HTTPException(status_code=400, detail=f'Tag "{name.strip()}" 已存在')

    ref = db.collection("tags").document()
    ref.set({
        "name":                name.strip(),
        "base_risk":           float(base_risk),
        "dynamic_risk":        float(base_risk),
        "target_weight":       target_weight,
        "fallback_behavior":   fallback or "hold",
        "market_state_presets": serialize_presets(presets),
        "trigger_direction":   trigger or "both",
    })
    return JSONResponse(status_code=201, content={"success": True, "data": deserialize_tag(ref.get())})


# ─── POST /tags/recalculate-dynamic-risk ───────────────────────────────────────

@router.post("/recalculate-dynamic-risk")
async def recalculate(body: dict):
    market_state = body.get("marketState")
    if market_state not in VALID_MARKET_STATES:
        raise HTTPException(status_code=400,
            detail="marketState 必須為 neutral / risk-on / risk-off / liquidity-dry")

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, recalculate_dynamic_risk, market_state)
    return {"success": True, "data": {"success": True, **result}}


# ─── PUT /tags/:id ─────────────────────────────────────────────────────────────

@router.put("/{tag_id}")
async def update(tag_id: str, body: dict):
    db = get_db()
    ref = db.collection("tags").document(tag_id)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail="Tag 不存在")

    name = body.get("name")
    if name is not None:
        if not isinstance(name, str) or not name.strip():
            raise HTTPException(status_code=400, detail="name 不可為空字串")
        # 檢查重名（排除自身）
        dup = db.collection("tags").where(filter=FieldFilter("name", "==", name.strip())).limit(1).get()
        for d in dup:
            if d.id != tag_id:
                raise HTTPException(status_code=400, detail=f'Tag "{name.strip()}" 已存在')

    base_risk = body.get("baseRisk")
    if base_risk is not None:
        if not isinstance(base_risk, (int, float)) or base_risk < 0 or base_risk > 3:
            raise HTTPException(status_code=400, detail="baseRisk 必須為 0 ≤ value ≤ 3 的數字")

    target_weight = body.get("targetWeight")
    if target_weight is not None:
        if not isinstance(target_weight, (int, float)) or target_weight <= 0 or target_weight > 100:
            raise HTTPException(status_code=400, detail="targetWeight 必須為 0 < value ≤ 100 的數字")

    fallback = body.get("fallbackBehavior")
    if fallback is not None and fallback not in VALID_FALLBACKS:
        raise HTTPException(status_code=400, detail='fallbackBehavior 必須為 "hold" 或 "exclude"')

    trigger = body.get("triggerDirection")
    if trigger is not None and trigger not in VALID_TRIGGER_DIRS:
        raise HTTPException(status_code=400, detail="triggerDirection 必須為 both | upper_only | lower_only")

    patch: dict = {}
    if name      is not None: patch["name"]              = name.strip()
    if base_risk is not None: patch["base_risk"]         = float(base_risk)
    if "targetWeight"    in body: patch["target_weight"]      = body["targetWeight"]
    if "fallbackBehavior" in body: patch["fallback_behavior"] = body.get("fallbackBehavior") or "hold"
    if "triggerDirection" in body: patch["trigger_direction"] = body.get("triggerDirection") or "both"
    if "marketStatePresets" in body:
        msp_raw = body["marketStatePresets"]
        patch["market_state_presets"] = serialize_presets(validate_presets(msp_raw) if msp_raw is not None else None)

    ref.update(patch)
    return {"success": True, "data": deserialize_tag(ref.get())}


# ─── DELETE /tags/:id ──────────────────────────────────────────────────────────

@router.delete("/{tag_id}")
async def remove(tag_id: str):
    db = get_db()
    ref = db.collection("tags").document(tag_id)
    tag_doc = ref.get()
    if not tag_doc.exists:
        raise HTTPException(status_code=404, detail="Tag 不存在")

    tag_name = tag_doc.to_dict().get("name", "")
    refs = db.collection("asset_tags").where(filter=FieldFilter("tag_name", "==", tag_name)).limit(1).get()
    if list(refs):
        raise HTTPException(status_code=400, detail="此 Tag 仍有股票對應，請先移除對應後再刪除")

    ref.delete()
    return {"success": True, "data": {"deleted": tag_id}}
