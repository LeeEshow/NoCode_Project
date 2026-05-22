from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from google.cloud.firestore import SERVER_TIMESTAMP

from services.firestore import db
from routers.schemas import (
    CreateTransactionPayload,
    UpdateTransactionPayload,
    success,
)

router = APIRouter()
logger = logging.getLogger(__name__)

_COL = "transactions"


def _deserialize(doc) -> dict:
    d = doc.to_dict()
    def _ts(field):
        v = d.get(field)
        return v.isoformat() if hasattr(v, "isoformat") else datetime.now(timezone.utc).isoformat()
    return {
        "id":            doc.id,
        "stockId":       d.get("stock_id", ""),
        "type":          d.get("type", "buy"),
        "date":          _ts("date"),
        "shares":        d.get("shares", 0),
        "pricePerShare": d.get("price_per_share", 0),
        "fee":           d.get("fee", 0),
        "note":          d.get("note", ""),
        "createdAt":     _ts("created_at"),
    }


# ── GET /transactions ──────────────────────────────────────────────────────────

@router.get("")
def get_all(stockId: Optional[str] = None):
    col = db.collection(_COL)
    query = col.where("stock_id", "==", stockId) if stockId else col
    snap = query.stream()
    items = sorted([_deserialize(d) for d in snap], key=lambda x: x["date"])
    return success(items)


# ── POST /transactions ─────────────────────────────────────────────────────────

@router.post("", status_code=201)
def create(payload: CreateTransactionPayload):
    ref = db.collection(_COL).document()
    ref.set({
        "stock_id":        payload.stockId,
        "type":            payload.type,
        "date":            datetime.fromisoformat(payload.date),
        "shares":          payload.shares,
        "price_per_share": payload.pricePerShare,
        "fee":             payload.fee,
        "note":            payload.note or "",
        "created_at":      SERVER_TIMESTAMP,
    })
    return success(_deserialize(ref.get()))


# ── PUT /transactions/{id} ─────────────────────────────────────────────────────

@router.put("/{tx_id}")
def update(tx_id: str, payload: UpdateTransactionPayload):
    ref = db.collection(_COL).document(tx_id)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail="交易紀錄不存在")
    patch: dict = {}
    if payload.stockId       is not None: patch["stock_id"]        = payload.stockId
    if payload.type          is not None: patch["type"]            = payload.type
    if payload.date          is not None: patch["date"]            = datetime.fromisoformat(payload.date)
    if payload.shares        is not None: patch["shares"]          = payload.shares
    if payload.pricePerShare is not None: patch["price_per_share"] = payload.pricePerShare
    if payload.fee           is not None: patch["fee"]             = payload.fee
    if payload.note          is not None: patch["note"]            = payload.note
    ref.update(patch)
    return success(_deserialize(ref.get()))


# ── DELETE /transactions/{id} ──────────────────────────────────────────────────

@router.delete("/{tx_id}")
def remove(tx_id: str):
    ref = db.collection(_COL).document(tx_id)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail="交易紀錄不存在")
    ref.delete()
    return success({"deleted": tx_id})
