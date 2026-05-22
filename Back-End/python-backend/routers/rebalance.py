from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from google.cloud.firestore import SERVER_TIMESTAMP

from services.firestore import db
from routers.schemas import (
    CreateRebalanceSnapshotPayload,
    UpdateRebalanceRulePayload,
    success,
)

router = APIRouter()
logger = logging.getLogger(__name__)

_RULES_COL    = "rebalance_rules"
_RULES_DOC_ID = "main"
_SNAP_COL     = "rebalance_snapshots"

_RULE_DEFAULTS = {
    "baseThreshold":     0.05,
    "volatilityFactor":  1.0,
    "liquidityCapRatio": 0.20,
    "advLookbackDays":   20,
    "concentrationLimit": 0.70,
}


def _deserialize_rule(doc) -> dict:
    d = doc.to_dict()
    return {
        "baseThreshold":     d.get("base_threshold",      _RULE_DEFAULTS["baseThreshold"]),
        "volatilityFactor":  d.get("volatility_factor",   _RULE_DEFAULTS["volatilityFactor"]),
        "liquidityCapRatio": d.get("liquidity_cap_ratio", _RULE_DEFAULTS["liquidityCapRatio"]),
        "advLookbackDays":   d.get("adv_lookback_days",   _RULE_DEFAULTS["advLookbackDays"]),
        "concentrationLimit": d.get("concentration_limit", _RULE_DEFAULTS["concentrationLimit"]),
    }


def _validate_rules(p: UpdateRebalanceRulePayload, existing: dict) -> None:
    bt = p.baseThreshold
    vf = p.volatilityFactor
    lc = p.liquidityCapRatio
    ld = p.advLookbackDays if p.advLookbackDays is not None else existing["advLookbackDays"]
    cl = p.concentrationLimit if p.concentrationLimit is not None else existing["concentrationLimit"]

    if not (0 <= bt <= 1):
        raise HTTPException(status_code=400, detail="baseThreshold 必須在 0–1 之間")
    if vf <= 0:
        raise HTTPException(status_code=400, detail="volatilityFactor 必須 > 0")
    if not (0 <= lc <= 1):
        raise HTTPException(status_code=400, detail="liquidityCapRatio 必須在 0–1 之間")
    if not (5 <= ld <= 60):
        raise HTTPException(status_code=400, detail="advLookbackDays 必須在 5–60 之間")
    if not (0.50 <= cl <= 0.95):
        raise HTTPException(status_code=400, detail="concentrationLimit 必須在 0.50–0.95 之間")


# ── GET /rebalance-rules ───────────────────────────────────────────────────────

@router.get("/rebalance-rules")
def get_rules():
    doc = db.collection(_RULES_COL).document(_RULES_DOC_ID).get()
    if not doc.exists:
        return success(_RULE_DEFAULTS)
    return success(_deserialize_rule(doc))


# ── PUT /rebalance-rules ───────────────────────────────────────────────────────

@router.put("/rebalance-rules")
def update_rules(payload: UpdateRebalanceRulePayload):
    ref = db.collection(_RULES_COL).document(_RULES_DOC_ID)
    existing_doc = ref.get()
    existing = _deserialize_rule(existing_doc) if existing_doc.exists else _RULE_DEFAULTS.copy()

    _validate_rules(payload, existing)

    ref.set({
        "base_threshold":      payload.baseThreshold,
        "volatility_factor":   payload.volatilityFactor,
        "liquidity_cap_ratio": payload.liquidityCapRatio,
        "adv_lookback_days":   payload.advLookbackDays if payload.advLookbackDays is not None else existing["advLookbackDays"],
        "concentration_limit": payload.concentrationLimit if payload.concentrationLimit is not None else existing["concentrationLimit"],
        "updated_at":          SERVER_TIMESTAMP,
    })
    return success(_deserialize_rule(ref.get()))


# ── GET /rebalance-snapshots ───────────────────────────────────────────────────

@router.get("/rebalance-snapshots")
def get_snapshots(limit: int = Query(default=10, ge=1, le=100)):
    snap = (
        db.collection(_SNAP_COL)
        .order_by("created_at", direction="DESCENDING")
        .limit(limit)
        .stream()
    )
    return success([_deserialize_snapshot(d) for d in snap])


# ── POST /rebalance-snapshots ──────────────────────────────────────────────────

@router.post("/rebalance-snapshots", status_code=201)
def create_snapshot(payload: CreateRebalanceSnapshotPayload):
    ref = db.collection(_SNAP_COL).document()
    ref.set({
        "created_at": SERVER_TIMESTAMP,
        "params": {
            "total_asset":         payload.params.totalAsset,
            "base_threshold":      payload.params.baseThreshold,
            "liquidity_cap_ratio": payload.params.liquidityCapRatio,
            "market_state":        payload.params.marketState,
        },
        "suggestions": [
            {
                "stock_code":           s.stockCode,
                "stock_name":           s.stockName,
                "action":               s.action,
                "shares":               s.shares,
                "estimated_amount":     s.estimatedAmount,
                "is_liquidity_limited": s.isLiquidityLimited,
            }
            for s in payload.suggestions
        ],
    })
    return success(_deserialize_snapshot(ref.get()))


def _deserialize_snapshot(doc) -> dict:
    d = doc.to_dict()
    ca = d.get("created_at")
    p  = d.get("params", {})
    return {
        "id":        doc.id,
        "createdAt": ca.isoformat() if hasattr(ca, "isoformat") else datetime.now(timezone.utc).isoformat(),
        "params": {
            "totalAsset":        p.get("total_asset", 0),
            "baseThreshold":     p.get("base_threshold", 0),
            "liquidityCapRatio": p.get("liquidity_cap_ratio", 0),
            "marketState":       p.get("market_state", "neutral"),
        },
        "suggestions": [
            {
                "stockCode":          s.get("stock_code", ""),
                "stockName":          s.get("stock_name", ""),
                "action":             s.get("action", "hold"),
                "shares":             s.get("shares", 0),
                "estimatedAmount":    s.get("estimated_amount", 0),
                "isLiquidityLimited": s.get("is_liquidity_limited", False),
            }
            for s in d.get("suggestions", [])
        ],
    }
