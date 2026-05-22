from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from google.cloud.firestore import SERVER_TIMESTAMP

from services.firestore import db
from routers.schemas import (
    CreateWatchlistPayload,
    ReorderPayload,
    UpdateWatchlistPayload,
    success,
)

router = APIRouter()
logger = logging.getLogger(__name__)

_COL = "watchlist"


def _deserialize(doc) -> dict:
    d = doc.to_dict()
    def _ts(field):
        v = d.get(field)
        return v.isoformat() if hasattr(v, "isoformat") else datetime.now(timezone.utc).isoformat()
    return {
        "stockId":     doc.id,
        "stockName":   d.get("stock_name", ""),
        "targetPrice": d.get("target_price", 0),
        "note":        d.get("note", ""),
        "createdAt":   _ts("created_at"),
        "updatedAt":   _ts("updated_at"),
        "sortIndex":   d.get("sort_index", 0),
    }


# ── GET /watchlist ─────────────────────────────────────────────────────────────

@router.get("")
def get_all():
    snap = db.collection(_COL).stream()
    items = sorted([_deserialize(d) for d in snap], key=lambda x: x["sortIndex"])
    return success(items)


# ── POST /watchlist ────────────────────────────────────────────────────────────

@router.post("", status_code=201)
def create(payload: CreateWatchlistPayload):
    ref = db.collection(_COL).document(payload.stockId)
    if ref.get().exists:
        raise HTTPException(status_code=409, detail="該股票已在自選股清單中")
    ref.set({
        "stock_id":     payload.stockId,
        "stock_name":   payload.stockName or "",
        "target_price": payload.targetPrice,
        "note":         payload.note or "",
        "created_at":   SERVER_TIMESTAMP,
        "updated_at":   SERVER_TIMESTAMP,
    })
    return success(_deserialize(ref.get()))


# ── PUT /watchlist/reorder ─────────────────────────────────────────────────────

@router.put("/reorder")
def reorder(payload: ReorderPayload):
    if not payload.order:
        raise HTTPException(status_code=400, detail="order 必須為非空字串陣列")
    batch = db.batch()
    col = db.collection(_COL)
    for idx, stock_id in enumerate(payload.order):
        batch.update(col.document(stock_id), {"sort_index": idx})
    batch.commit()
    return success({"reordered": len(payload.order)})


# ── PUT /watchlist/{stock_id} ──────────────────────────────────────────────────

@router.put("/{stock_id}")
def update(stock_id: str, payload: UpdateWatchlistPayload):
    ref = db.collection(_COL).document(stock_id)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail="自選股不存在")
    patch: dict = {"updated_at": SERVER_TIMESTAMP}
    if payload.targetPrice is not None:
        patch["target_price"] = payload.targetPrice
    if payload.note is not None:
        patch["note"] = payload.note
    ref.update(patch)
    return success(_deserialize(ref.get()))


# ── DELETE /watchlist/{stock_id} ───────────────────────────────────────────────

@router.delete("/{stock_id}")
def remove(stock_id: str):
    ref = db.collection(_COL).document(stock_id)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail="自選股不存在")
    ref.delete()
    return success({"deleted": stock_id})
