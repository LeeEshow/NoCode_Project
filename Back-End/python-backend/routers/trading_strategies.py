"""
GET/GET_one/PATCH(dismiss)/PATCH(rule-status)/DELETE /api/v1/trading-strategies
trading_strategies/{stockCode}  ← singleton-per-stock，AI 覆寫，無堆疊
"""
from datetime import date
from fastapi import APIRouter, HTTPException
from services.firestore import get_db

router = APIRouter()

_CHIP_RULE_TYPES = frozenset({"chip_dealer_buy", "chip_foreign_buy", "chip_trust_buy"})


# ─── 工具函式 ──────────────────────────────────────────────────────────────────

def _rule_to_dto(r: dict) -> dict:
    result: dict = {"type": r["type"]}
    if "value" in r:
        result["value"] = r["value"]
    if "period" in r:
        result["period"] = r["period"]
    return result


def _tranche_to_dto(t: dict) -> dict:
    rules = t.get("trigger_rules") or []
    raw_statuses = t.get("rule_statuses") or {}
    # rule_statuses keys 是規則類型識別符（如 chip_dealer_buy），不做 camelCase 轉換
    statuses = {k: v for k, v in raw_statuses.items() if k in _CHIP_RULE_TYPES or k == "manual"}
    return {
        "batch":            t.get("batch", 1),
        "priceLow":         t.get("price_low"),
        "priceHigh":        t.get("price_high"),
        "sizeRatio":        t.get("size_ratio"),
        "shares":           t.get("shares", 0),
        "triggerCondition": t.get("trigger_condition", ""),
        "triggerRules":     [_rule_to_dto(r) for r in rules],
        "ruleStatuses":     statuses,
        "ruleEvaluatedAt":  t.get("rule_evaluated_at"),
        "status":           t.get("status", "pending"),
    }


def _evaluate_tranche_status(tranche: dict) -> dict:
    """H-3: chip_* 全 true + manual 全 true → triggered（在 Firestore snake_case dict 上操作）"""
    rules    = tranche.get("trigger_rules") or []
    statuses = tranche.get("rule_statuses") or {}

    chip_rules   = [r for r in rules if r.get("type") in _CHIP_RULE_TYPES]
    manual_rules = [r for r in rules if r.get("type") == "manual"]

    # 必須至少有一條 chip_* 或 manual rule
    if not chip_rules and not manual_rules:
        return tranche

    for r in chip_rules:
        if statuses.get(r["type"]) is not True:
            return tranche

    for _ in manual_rules:
        if statuses.get("manual") is not True:
            return tranche

    return {**tranche, "status": "triggered"}


def _compute_strategy_status(d: dict, tranches: list[dict]) -> str:
    """依 H-3 規則計算 strategy.status（在 Firestore raw dict 上操作）"""
    if d.get("dismissed", False):
        return "dismissed"
    expires_at = d.get("expires_at")
    current    = d.get("status", "active")
    if expires_at and str(expires_at)[:10] < date.today().isoformat() and current in ("active", "triggered"):
        return "expired"
    if current == "active" and any(t.get("status") == "triggered" for t in tranches):
        return "triggered"
    return current


def _to_dto(doc_id: str, d: dict) -> dict:
    # tranches：新格式 or 向後相容舊 trigger_price
    tranches_raw = d.get("tranches")
    if tranches_raw:
        tranches = [_tranche_to_dto(t) for t in tranches_raw]
    else:
        trigger_price = d.get("trigger_price")
        if trigger_price is not None:
            tranches = [{
                "batch":            1,
                "priceLow":         float(trigger_price),
                "priceHigh":        float(trigger_price),
                "sizeRatio":        1.0,
                "shares":           0,
                "triggerCondition": "",
                "triggerRules":     [],
                "ruleStatuses":     {},
                "ruleEvaluatedAt":  None,
                "status":           "pending",
            }]
        else:
            tranches = []

    dismissed  = d.get("dismissed", False)
    raw_status = d.get("status", "active")
    expires_at = d.get("expires_at")
    today      = date.today().isoformat()

    # dismissed 優先；lazy expires_at check（L-1）
    if dismissed:
        effective_status = "dismissed"
    elif expires_at and str(expires_at)[:10] < today and raw_status in ("active", "triggered"):
        effective_status = "expired"
    else:
        effective_status = raw_status

    return {
        "stockCode":             d.get("stock_code", doc_id),
        "stockName":             d.get("stock_name"),
        "tradeType":             d.get("trade_type"),
        "tranches":              tranches,
        "referencePrice":        d.get("reference_price"),
        "stopLossPrice":         d.get("stop_loss_price"),
        "targetPriceLow":        d.get("target_price_low"),
        "targetPriceHigh":       d.get("target_price_high"),
        "riskRewardRatio":       d.get("risk_reward_ratio"),
        "triggerCondition":      d.get("trigger_condition"),
        "invalidationCondition": d.get("invalidation_condition"),
        "confidence":            d.get("confidence"),
        "timeframe":             d.get("timeframe"),
        "summary":               d.get("summary"),
        "status":                effective_status,
        "dismissed":             dismissed,
        "createdAt":             d.get("created_at"),
        "expiresAt":             expires_at,
    }


# ─── GET /trading-strategies ──────────────────────────────────────────────────

@router.get("")
def get_all():
    db   = get_db()
    docs = db.collection("trading_strategies").get()
    items = [_to_dto(doc.id, doc.to_dict()) for doc in docs]
    items.sort(key=lambda x: x.get("createdAt") or "", reverse=True)
    return {"success": True, "data": items}


# ─── GET /trading-strategies/{stock_code} ─────────────────────────────────────

@router.get("/{stock_code}")
def get_one(stock_code: str):
    db  = get_db()
    doc = db.collection("trading_strategies").document(stock_code).get()
    data = _to_dto(doc.id, doc.to_dict()) if doc.exists else None
    return {"success": True, "data": data}


# ─── PATCH /trading-strategies/{stock_code}/dismiss ───────────────────────────

@router.patch("/{stock_code}/dismiss")
def dismiss(stock_code: str):
    db  = get_db()
    ref = db.collection("trading_strategies").document(stock_code)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail="策略不存在")
    ref.update({"dismissed": True, "status": "dismissed"})
    return {"success": True, "data": _to_dto(stock_code, ref.get().to_dict())}


# ─── PATCH /trading-strategies/{stock_code}/rule-status ───────────────────────

@router.patch("/{stock_code}/rule-status")
def update_rule_status(stock_code: str, body: dict):
    """手動確認 manual 規則（M-2）。
    body: { batch: int, ruleType: "manual", confirmed: bool }
    """
    batch_num = body.get("batch")
    rule_type = body.get("ruleType")
    confirmed = body.get("confirmed")

    if rule_type != "manual":
        raise HTTPException(status_code=400, detail="ruleType 只允許 'manual'")
    if not isinstance(batch_num, int) or batch_num < 1:
        raise HTTPException(status_code=400, detail="batch 必須為正整數")
    if not isinstance(confirmed, bool):
        raise HTTPException(status_code=400, detail="confirmed 必須為 boolean")

    db  = get_db()
    ref = db.collection("trading_strategies").document(stock_code)
    doc = ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="策略不存在")

    d        = doc.to_dict()
    tranches = list(d.get("tranches") or [])

    idx = next((i for i, t in enumerate(tranches) if t.get("batch") == batch_num), None)
    if idx is None:
        raise HTTPException(status_code=400, detail=f"找不到 batch={batch_num} 的批次")

    tranche       = tranches[idx]
    trigger_rules = tranche.get("trigger_rules") or []
    if not any(r.get("type") == "manual" for r in trigger_rules):
        raise HTTPException(status_code=400, detail=f"batch={batch_num} 不含 manual 規則")

    rule_statuses        = dict(tranche.get("rule_statuses") or {})
    rule_statuses["manual"] = confirmed
    tranches[idx]        = _evaluate_tranche_status({**tranche, "rule_statuses": rule_statuses})

    new_status = _compute_strategy_status(d, tranches)
    ref.update({"tranches": tranches, "status": new_status})

    return {"success": True, "data": _to_dto(stock_code, {**d, "tranches": tranches, "status": new_status})}


# ─── DELETE /trading-strategies/{stock_code} ──────────────────────────────────

@router.delete("/{stock_code}")
def delete_one(stock_code: str):
    db  = get_db()
    ref = db.collection("trading_strategies").document(stock_code)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail="策略不存在")
    ref.delete()
    return {"success": True, "data": {"deleted": stock_code}}
