from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Query
from firebase_admin import firestore as fs
from services.firestore import get_db

rules_router     = APIRouter()
snapshots_router = APIRouter()

RULES_COL     = "rebalance_rules"
RULES_DOC     = "main"
SNAPSHOTS_COL = "rebalance_snapshots"

RULE_DEFAULTS = {
    "baseThreshold":     0.05,
    "volatilityFactor":  1.0,
    "liquidityCapRatio": 0.20,
    "advLookbackDays":   20,
    "concentrationLimit": 0.70,
}

VALID_MARKET_STATES = {"neutral", "risk-on", "risk-off", "liquidity-dry"}


# ─── RebalanceRule helpers ────────────────────────────────────────────────────

def deserialize_rule(doc) -> dict:
    d = doc.to_dict()
    return {
        "baseThreshold":     d.get("base_threshold",      RULE_DEFAULTS["baseThreshold"]),
        "volatilityFactor":  d.get("volatility_factor",   RULE_DEFAULTS["volatilityFactor"]),
        "liquidityCapRatio": d.get("liquidity_cap_ratio", RULE_DEFAULTS["liquidityCapRatio"]),
        "advLookbackDays":   int(d.get("adv_lookback_days",   RULE_DEFAULTS["advLookbackDays"])),
        "concentrationLimit": d.get("concentration_limit", RULE_DEFAULTS["concentrationLimit"]),
    }


# ─── GET /rebalance-rules ─────────────────────────────────────────────────────

@rules_router.get("/")
async def get_rules():
    db = get_db()
    doc = db.collection(RULES_COL).document(RULES_DOC).get()
    if not doc.exists:
        return {"success": True, "data": RULE_DEFAULTS}
    return {"success": True, "data": deserialize_rule(doc)}


# ─── PUT /rebalance-rules ─────────────────────────────────────────────────────

@rules_router.put("/")
async def update_rules(body: dict):
    base_threshold      = body.get("baseThreshold")
    volatility_factor   = body.get("volatilityFactor")
    liquidity_cap_ratio = body.get("liquidityCapRatio")

    if not isinstance(base_threshold, (int, float)) or not (0 < base_threshold < 1):
        raise HTTPException(status_code=400, detail="baseThreshold 必須為 0 < value < 1 的數字")
    if not isinstance(volatility_factor, (int, float)) or volatility_factor <= 0:
        raise HTTPException(status_code=400, detail="volatilityFactor 必須為正數")
    if not isinstance(liquidity_cap_ratio, (int, float)) or not (0 < liquidity_cap_ratio <= 1):
        raise HTTPException(status_code=400, detail="liquidityCapRatio 必須為 0 < value ≤ 1 的數字")

    db = get_db()
    current_doc = db.collection(RULES_COL).document(RULES_DOC).get()
    current = deserialize_rule(current_doc) if current_doc.exists else RULE_DEFAULTS

    adv = body.get("advLookbackDays")
    if adv is not None:
        if not isinstance(adv, int) or not (5 <= adv <= 60):
            raise HTTPException(status_code=400, detail="advLookbackDays 必須為 5 ≤ value ≤ 60 的整數")
        resolved_adv = adv
    else:
        resolved_adv = current["advLookbackDays"]

    conc = body.get("concentrationLimit")
    if conc is not None:
        if not isinstance(conc, (int, float)) or not (0.50 <= conc <= 0.95):
            raise HTTPException(status_code=400, detail="concentrationLimit 必須為 0.50 ≤ value ≤ 0.95 的數字")
        resolved_conc = conc
    else:
        resolved_conc = current["concentrationLimit"]

    ref = db.collection(RULES_COL).document(RULES_DOC)
    ref.set({
        "base_threshold":      float(base_threshold),
        "volatility_factor":   float(volatility_factor),
        "liquidity_cap_ratio": float(liquidity_cap_ratio),
        "adv_lookback_days":   int(resolved_adv),
        "concentration_limit": float(resolved_conc),
        "updated_at":          fs.SERVER_TIMESTAMP,
    })
    return {"success": True, "data": deserialize_rule(ref.get())}


# ─── RebalanceSnapshot helpers ────────────────────────────────────────────────

def deserialize_snapshot(doc) -> dict:
    d = doc.to_dict()
    ca = d.get("created_at")
    created_at = ca.isoformat() if hasattr(ca, "isoformat") else datetime.now(timezone.utc).isoformat()

    p = d.get("params", {})
    return {
        "id":        doc.id,
        "createdAt": created_at,
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


# ─── GET /rebalance-snapshots ─────────────────────────────────────────────────

@snapshots_router.get("/")
async def get_snapshots(limit: int = Query(default=10, ge=1, le=100)):
    db = get_db()
    snap = (
        db.collection(SNAPSHOTS_COL)
        .order_by("created_at", direction="DESCENDING")
        .limit(limit)
        .get()
    )
    return {"success": True, "data": [deserialize_snapshot(doc) for doc in snap]}


# ─── POST /rebalance-snapshots ────────────────────────────────────────────────

@snapshots_router.post("/")
async def create_snapshot(body: dict):
    params      = body.get("params")
    suggestions = body.get("suggestions", [])

    if not isinstance(params, dict):
        raise HTTPException(status_code=400, detail="params 為必填物件")

    market_state = params.get("marketState")
    if market_state not in VALID_MARKET_STATES:
        raise HTTPException(status_code=400, detail="params.marketState 值無效")

    db = get_db()
    ref = db.collection(SNAPSHOTS_COL).document()
    ref.set({
        "created_at": fs.SERVER_TIMESTAMP,
        "params": {
            "total_asset":         float(params.get("totalAsset", 0)),
            "base_threshold":      float(params.get("baseThreshold", 0)),
            "liquidity_cap_ratio": float(params.get("liquidityCapRatio", 0)),
            "market_state":        market_state,
        },
        "suggestions": [
            {
                "stock_code":           str(s.get("stockCode", "")),
                "stock_name":           str(s.get("stockName", "")),
                "action":               str(s.get("action", "hold")),
                "shares":               float(s.get("shares", 0)),
                "estimated_amount":     float(s.get("estimatedAmount", 0)),
                "is_liquidity_limited": bool(s.get("isLiquidityLimited", False)),
            }
            for s in suggestions
        ],
    })
    return {"success": True, "data": deserialize_snapshot(ref.get())}
