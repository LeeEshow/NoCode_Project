"""
M13 交易策略：REST 端點

GET    /trading-strategies
GET    /trading-strategies/{stock_code}
PATCH  /trading-strategies/{stock_code}/dismiss
PATCH  /trading-strategies/{stock_code}/rule-status
POST   /trading-strategies/{stock_code}/tranches/{batch}/executions
DELETE /trading-strategies/{stock_code}

Firestore collection: trading_strategies/{stockCode}  (singleton-per-stock)
"""
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator
from services.firestore import get_db

TZ_TAIPEI = timezone(timedelta(hours=8))
router = APIRouter()


# ─── 狀態推導 ─────────────────────────────────────────────────────────────────

def _derive_strategy_status(d: dict) -> str:
    if d.get("dismissed"):
        return "dismissed"
    tranches = d.get("tranches", [])
    if not tranches:
        return "active"
    if all(t.get("status") == "executed" for t in tranches):
        return "completed"
    if any(t.get("status") == "triggered" for t in tranches):
        return "triggered"
    return "active"


# ─── DTO 轉換 ─────────────────────────────────────────────────────────────────

def _to_tranche_dto(t: dict) -> dict:
    return {
        "batch":            t.get("batch"),
        "priceLow":         t.get("price_low"),
        "priceHigh":        t.get("price_high"),
        "sizeRatio":        t.get("size_ratio"),
        "shares":           t.get("shares"),
        "triggerCondition": t.get("trigger_condition"),
        "triggerRules":     t.get("trigger_rules", []),
        "ruleStatuses":     t.get("rule_statuses", {}),  # keys 保持 snake_case
        "status":           t.get("status", "pending"),
        "executions":       [
            {
                "executedPrice":  e.get("executed_price"),
                "executedShares": e.get("executed_shares"),
                "transactionId":  e.get("transaction_id", ""),
                "executedAt":     e.get("executed_at"),
            }
            for e in t.get("executions", [])
        ],
    }


def _to_dto(doc_id: str, d: dict) -> dict:
    return {
        "stockCode":             d.get("stock_code", doc_id),
        "stockName":             d.get("stock_name"),
        "tradeType":             d.get("trade_type"),
        "referencePrice":        d.get("reference_price"),
        "stopLossPrice":         d.get("stop_loss_price"),
        "targetPriceLow":        d.get("target_price_low"),
        "targetPriceHigh":       d.get("target_price_high"),
        "triggerCondition":      d.get("trigger_condition"),
        "invalidationCondition": d.get("invalidation_condition"),
        "confidence":            d.get("confidence"),
        "timeframe":             d.get("timeframe"),
        "summary":               d.get("summary", ""),
        "expiresAt":             d.get("expires_at"),
        "dismissed":             d.get("dismissed", False),
        "status":                _derive_strategy_status(d),
        "createdAt":             d.get("created_at"),
        "updatedAt":             d.get("updated_at"),
        "riskRewardRatio":       d.get("risk_reward_ratio"),
        "tranches":              [_to_tranche_dto(t) for t in d.get("tranches", [])],
    }


# ─── GET /trading-strategies ──────────────────────────────────────────────────

@router.get("")
def get_all():
    db   = get_db()
    docs = db.collection("trading_strategies").get()
    if not docs:
        return {"success": True, "data": []}
    items = [_to_dto(doc.id, doc.to_dict()) for doc in docs]
    items.sort(key=lambda x: x.get("updatedAt") or "", reverse=True)
    return {"success": True, "data": items}


# ─── GET /trading-strategies/{stock_code} ─────────────────────────────────────

@router.get("/{stock_code}")
def get_one(stock_code: str):
    db  = get_db()
    doc = db.collection("trading_strategies").document(stock_code).get()
    if not doc.exists:
        return {"success": True, "data": None}
    return {"success": True, "data": _to_dto(doc.id, doc.to_dict())}


# ─── PATCH /trading-strategies/{stock_code}/dismiss ───────────────────────────

@router.patch("/{stock_code}/dismiss")
def dismiss(stock_code: str):
    db  = get_db()
    ref = db.collection("trading_strategies").document(stock_code)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail="策略不存在")
    ref.update({
        "dismissed":  True,
        "updated_at": datetime.now(TZ_TAIPEI).isoformat(),
    })
    doc = ref.get()
    return {"success": True, "data": _to_dto(doc.id, doc.to_dict())}


# ─── PATCH /trading-strategies/{stock_code}/rule-status ───────────────────────

class RuleStatusBody(BaseModel):
    batch:     int
    ruleType:  str
    confirmed: bool


@router.patch("/{stock_code}/rule-status")
def update_rule_status(stock_code: str, body: RuleStatusBody):
    if body.ruleType != "manual":
        raise HTTPException(status_code=400, detail="只能手動更新 manual 類型的 rule")

    db   = get_db()
    ref  = db.collection("trading_strategies").document(stock_code)
    snap = ref.get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="策略不存在")

    d        = snap.to_dict()
    tranches = d.get("tranches", [])

    tranche_idx = next(
        (i for i, t in enumerate(tranches) if t.get("batch") == body.batch),
        None,
    )
    if tranche_idx is None:
        raise HTTPException(status_code=400, detail="批次不存在")

    tranche      = tranches[tranche_idx]
    rule_statuses = tranche.get("rule_statuses", {})
    if "manual" not in rule_statuses:
        raise HTTPException(status_code=400, detail="此批次無 manual 規則")

    rule_statuses["manual"] = body.confirmed
    tranche["rule_statuses"] = rule_statuses
    # 所有 manual 規則為 True → tranche triggered
    if all(v is True for k, v in rule_statuses.items() if k == "manual"):
        tranche["status"] = "triggered"
    else:
        tranche["status"] = "pending"

    tranches[tranche_idx] = tranche
    d["tranches"]   = tranches
    d["updated_at"] = datetime.now(TZ_TAIPEI).isoformat()

    ref.set(d)
    return {"success": True, "data": _to_dto(stock_code, d)}


# ─── POST /trading-strategies/{stock_code}/tranches/{batch}/executions ────────

class ExecutionBody(BaseModel):
    executedPrice:  float
    executedShares: int
    transactionId:  str | None = None
    executedAt:     str | None = None

    @field_validator("executedPrice")
    @classmethod
    def price_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("executedPrice 必須大於 0")
        return v

    @field_validator("executedShares")
    @classmethod
    def shares_positive(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("executedShares 必須大於 0")
        return v


@router.post("/{stock_code}/tranches/{batch}/executions")
def add_execution(stock_code: str, batch: int, body: ExecutionBody):
    db   = get_db()
    ref  = db.collection("trading_strategies").document(stock_code)
    snap = ref.get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="策略不存在")

    d        = snap.to_dict()
    tranches = d.get("tranches", [])

    tranche_idx = next(
        (i for i, t in enumerate(tranches) if t.get("batch") == batch),
        None,
    )
    if tranche_idx is None:
        raise HTTPException(status_code=400, detail="批次不存在")

    tranche  = tranches[tranche_idx]
    execs    = tranche.get("executions", [])
    execs.append({
        "executed_price":  body.executedPrice,
        "executed_shares": body.executedShares,
        "transaction_id":  body.transactionId or "",
        "executed_at":     body.executedAt or datetime.now(TZ_TAIPEI).isoformat(),
    })
    tranche["executions"] = execs
    tranche["status"]     = "executed"
    tranches[tranche_idx] = tranche

    d["tranches"]   = tranches
    d["updated_at"] = datetime.now(TZ_TAIPEI).isoformat()

    ref.set(d)
    return {"success": True, "data": _to_dto(stock_code, d)}


# ─── DELETE /trading-strategies/{stock_code} ──────────────────────────────────

@router.delete("/{stock_code}")
def delete_one(stock_code: str):
    db  = get_db()
    ref = db.collection("trading_strategies").document(stock_code)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail="策略不存在")
    ref.delete()
    return {"success": True, "data": {"deleted": stock_code}}
