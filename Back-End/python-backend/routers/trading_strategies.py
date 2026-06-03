"""
GET/GET_one/PATCH(dismiss)/DELETE /api/v1/trading-strategies
trading_strategies/{stockCode}  ← singleton-per-stock，AI 覆寫，無堆疊
"""
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from services.firestore import get_db

router = APIRouter()

_VALID_TRADE_TYPES = {"entry", "add", "reduce", "exit", "stop_loss", "take_profit", "watch"}
_VALID_CONFIDENCE  = {"high", "medium", "low"}
_VALID_TIMEFRAME   = {"short", "medium", "long"}
_TZ_TAIPEI = timezone(timedelta(hours=8))


def _to_dto(doc_id: str, d: dict) -> dict:
    return {
        "stockCode":      d.get("stock_code", doc_id),
        "stockName":      d.get("stock_name"),
        "tradeType":      d.get("trade_type"),
        "triggerPrice":   d.get("trigger_price"),
        "referencePrice": d.get("reference_price"),
        "targetPrice":    d.get("target_price"),
        "stopLossPrice":  d.get("stop_loss_price"),
        "confidence":     d.get("confidence"),
        "timeframe":      d.get("timeframe"),
        "summary":        d.get("summary"),
        "dismissed":      d.get("dismissed", False),
        "createdAt":      d.get("created_at"),
        "expiresAt":      d.get("expires_at"),
    }


# ─── GET /trading-strategies ──────────────────────────────────────────────────

@router.get("")
def get_all():
    db = get_db()
    docs = db.collection("trading_strategies").get()
    items = [_to_dto(doc.id, doc.to_dict()) for doc in docs]
    items.sort(key=lambda x: x.get("createdAt") or "", reverse=True)
    return {"success": True, "data": items}


# ─── GET /trading-strategies/{stock_code} ─────────────────────────────────────

@router.get("/{stock_code}")
def get_one(stock_code: str):
    db = get_db()
    doc = db.collection("trading_strategies").document(stock_code).get()
    data = _to_dto(doc.id, doc.to_dict()) if doc.exists else None
    return {"success": True, "data": data}


# ─── PATCH /trading-strategies/{stock_code}/dismiss ───────────────────────────

@router.patch("/{stock_code}/dismiss")
def dismiss(stock_code: str):
    db = get_db()
    ref = db.collection("trading_strategies").document(stock_code)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail="策略不存在")
    ref.update({"dismissed": True})
    return {"success": True, "data": _to_dto(stock_code, ref.get().to_dict())}


# ─── DELETE /trading-strategies/{stock_code} ──────────────────────────────────

@router.delete("/{stock_code}")
def delete_one(stock_code: str):
    db = get_db()
    ref = db.collection("trading_strategies").document(stock_code)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail="策略不存在")
    ref.delete()
    return {"success": True, "data": {"deleted": stock_code}}
