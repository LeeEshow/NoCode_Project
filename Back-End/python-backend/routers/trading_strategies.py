"""
GET/GET_one/PUT/DELETE /api/v1/trading-strategies
GET /{stock_code}/progress

trading_strategies/{stockCode} ← singleton-per-stock，AI 覆寫，無堆疊

新設計：簡單意圖記錄
  action: buy | sell | hold
  target_quantity: int（股）
  priority: normal | urgent
  notes: str

進度由 transactions 集合中 linked_strategy=True 的買進紀錄計算。
"""
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException
from google.cloud.firestore_v1.base_query import FieldFilter
from pydantic import BaseModel
from services.firestore import get_db

TZ_TAIPEI = timezone(timedelta(hours=8))

router = APIRouter()

_VALID_ACTIONS  = {"buy", "sell", "hold"}
_VALID_PRIORITY = {"normal", "urgent"}


# ─── 工具函式 ──────────────────────────────────────────────────────────────────

def _compute_executed(db, stock_code: str) -> int:
    txns = db.collection("transactions").where(
        filter=FieldFilter("stock_id", "==", stock_code)
    ).get()
    return int(sum(
        doc.to_dict().get("shares", 0)
        for doc in txns
        if doc.to_dict().get("linked_strategy") is True
        and doc.to_dict().get("type") == "buy"
    ))


def _to_dto(stock_code: str, d: dict, executed: int = 0) -> dict:
    target    = int(d.get("target_quantity", 0))
    remaining = max(0, target - executed)
    return {
        "stockCode":         d.get("stock_code", stock_code),
        "stockName":         d.get("stock_name"),
        "action":            d.get("action", "hold"),
        "targetQuantity":    target,
        "priority":          d.get("priority", "normal"),
        "notes":             d.get("notes", ""),
        "updatedAt":         d.get("updated_at"),
        "executedQuantity":  executed,
        "remainingQuantity": remaining,
    }


# ─── GET /trading-strategies ──────────────────────────────────────────────────

@router.get("")
def get_all():
    db   = get_db()
    docs = db.collection("trading_strategies").get()
    if not docs:
        return {"success": True, "data": []}

    # 一次拿所有交易，避免 N 次查詢
    all_txns = db.collection("transactions").get()
    executed_map: dict[str, int] = {}
    for tx in all_txns:
        d = tx.to_dict()
        if d.get("linked_strategy") is True and d.get("type") == "buy":
            sid = str(d.get("stock_id", ""))
            executed_map[sid] = executed_map.get(sid, 0) + int(d.get("shares", 0))

    items = [
        _to_dto(doc.id, doc.to_dict(), executed_map.get(doc.id, 0))
        for doc in docs
    ]
    items.sort(key=lambda x: x.get("updatedAt") or "", reverse=True)
    return {"success": True, "data": items}


# ─── GET /trading-strategies/{stock_code} ─────────────────────────────────────

@router.get("/{stock_code}")
def get_one(stock_code: str):
    db  = get_db()
    doc = db.collection("trading_strategies").document(stock_code).get()
    if not doc.exists:
        return {"success": True, "data": None}
    executed = _compute_executed(db, stock_code)
    return {"success": True, "data": _to_dto(doc.id, doc.to_dict(), executed)}


# ─── PUT /trading-strategies/{stock_code} ─────────────────────────────────────

class StrategyBody(BaseModel):
    action:          str
    target_quantity: int
    stock_name:      str | None = None
    priority:        str        = "normal"
    notes:           str        = ""


@router.put("/{stock_code}")
def upsert(stock_code: str, body: StrategyBody):
    if body.action not in _VALID_ACTIONS:
        raise HTTPException(status_code=400, detail="action 必須為 buy|sell|hold")
    if body.priority not in _VALID_PRIORITY:
        raise HTTPException(status_code=400, detail="priority 必須為 normal|urgent")
    if body.target_quantity < 0:
        raise HTTPException(status_code=400, detail="target_quantity 不可為負數")

    db  = get_db()
    ref = db.collection("trading_strategies").document(stock_code)
    existing = ref.get()

    stock_name = body.stock_name or (
        existing.to_dict().get("stock_name", stock_code) if existing.exists else stock_code
    )

    doc_data = {
        "stock_code":      stock_code,
        "stock_name":      stock_name,
        "action":          body.action,
        "target_quantity": body.target_quantity,
        "priority":        body.priority,
        "notes":           body.notes,
        "updated_at":      datetime.now(TZ_TAIPEI).isoformat(),
    }
    ref.set(doc_data)

    executed = _compute_executed(db, stock_code)
    return {"success": True, "data": _to_dto(stock_code, doc_data, executed)}


# ─── GET /trading-strategies/{stock_code}/progress ────────────────────────────

@router.get("/{stock_code}/progress")
def get_progress(stock_code: str):
    db  = get_db()
    doc = db.collection("trading_strategies").document(stock_code).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="策略不存在")
    target   = int(doc.to_dict().get("target_quantity", 0))
    executed = _compute_executed(db, stock_code)
    return {
        "success": True,
        "data": {
            "targetQuantity":    target,
            "executedQuantity":  executed,
            "remainingQuantity": max(0, target - executed),
        },
    }


# ─── DELETE /trading-strategies/{stock_code} ──────────────────────────────────

@router.delete("/{stock_code}")
def delete_one(stock_code: str):
    db  = get_db()
    ref = db.collection("trading_strategies").document(stock_code)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail="策略不存在")
    ref.delete()
    return {"success": True, "data": {"deleted": stock_code}}
