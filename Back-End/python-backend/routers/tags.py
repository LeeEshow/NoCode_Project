from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from google.cloud.firestore import SERVER_TIMESTAMP

from services.firestore import db
from routers.schemas import (
    CreateTagPayload,
    RecalculateDynamicRiskPayload,
    TagDTO,
    UpdateTagPayload,
    success,
)

router = APIRouter()
logger = logging.getLogger(__name__)

_COL = "tags"


def _deserialize(doc) -> dict:
    d = doc.to_dict()
    msp = d.get("market_state_presets")
    return {
        "id":               doc.id,
        "name":             d.get("name", ""),
        "baseRisk":         d.get("base_risk", 0),
        "dynamicRisk":      d.get("dynamic_risk") if d.get("dynamic_risk") is not None else d.get("base_risk", 0),
        "targetWeight":     d.get("target_weight"),
        "fallbackBehavior": d.get("fallback_behavior", "hold"),
        "marketStatePresets": {
            "riskOn":       msp.get("risk_on"),
            "riskOff":      msp.get("risk_off"),
            "liquidityDry": msp.get("liquidity_dry"),
        } if msp else None,
        "triggerDirection": d.get("trigger_direction", "both"),
    }


def _serialize_presets(presets: Optional[object]) -> Optional[dict]:
    if presets is None:
        return None
    return {
        "risk_on":       presets.riskOn,
        "risk_off":      presets.riskOff,
        "liquidity_dry": presets.liquidityDry,
    }


# ── GET /tags ──────────────────────────────────────────────────────────────────

@router.get("")
def get_all():
    snap = db.collection(_COL).order_by("name").stream()
    return success([_deserialize(d) for d in snap])


# ── POST /tags ─────────────────────────────────────────────────────────────────

@router.post("", status_code=201)
def create(payload: CreateTagPayload):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="name 為必填欄位")

    # 名稱唯一性檢查
    existing = db.collection(_COL).where("name", "==", name).limit(1).stream()
    if any(True for _ in existing):
        raise HTTPException(status_code=409, detail=f'Tag "{name}" 已存在')

    ref = db.collection(_COL).document()
    ref.set({
        "name":                 name,
        "base_risk":            payload.baseRisk,
        "dynamic_risk":         payload.baseRisk,
        "target_weight":        payload.targetWeight,
        "fallback_behavior":    payload.fallbackBehavior or "hold",
        "market_state_presets": _serialize_presets(payload.marketStatePresets),
        "trigger_direction":    payload.triggerDirection or "both",
    })
    return success(_deserialize(ref.get()))


# ── PUT /tags/{tag_id} ─────────────────────────────────────────────────────────

@router.put("/{tag_id}")
def update(tag_id: str, payload: UpdateTagPayload):
    ref = db.collection(_COL).document(tag_id)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail="Tag 不存在")

    patch: dict = {}
    if payload.name              is not None: patch["name"]                 = payload.name.strip()
    if payload.baseRisk          is not None: patch["base_risk"]            = payload.baseRisk
    if "targetWeight"     in payload.model_fields_set: patch["target_weight"]        = payload.targetWeight
    if "fallbackBehavior" in payload.model_fields_set: patch["fallback_behavior"]    = payload.fallbackBehavior or "hold"
    if "marketStatePresets" in payload.model_fields_set:
        patch["market_state_presets"] = _serialize_presets(payload.marketStatePresets)
    if "triggerDirection" in payload.model_fields_set: patch["trigger_direction"]    = payload.triggerDirection or "both"

    ref.update(patch)
    return success(_deserialize(ref.get()))


# ── DELETE /tags/{tag_id} ──────────────────────────────────────────────────────

@router.delete("/{tag_id}")
def remove(tag_id: str):
    ref = db.collection(_COL).document(tag_id)
    doc = ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Tag 不存在")

    tag_name = doc.to_dict().get("name", "")
    # 刪除前確認無持股掛載此 Tag
    in_use = db.collection("asset_tags").where("tag_name", "==", tag_name).limit(1).stream()
    if any(True for _ in in_use):
        raise HTTPException(status_code=400, detail=f'Tag "{tag_name}" 仍有持股掛載，無法刪除')

    ref.delete()
    return success({"deleted": tag_id})


# ── POST /tags/recalculate-dynamic-risk ───────────────────────────────────────

@router.post("/recalculate-dynamic-risk")
async def recalculate_dynamic_risk(payload: RecalculateDynamicRiskPayload):
    from services.tag_risk_service import recalculate_dynamic_risk as svc
    result = await svc(payload.marketState)
    return success(result)
