from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import List, Optional

import yfinance as yf
from fastapi import APIRouter, HTTPException, Request
from google.cloud.firestore import SERVER_TIMESTAMP

from services.firestore import db
from routers.schemas import (
    CreateAssetTagPayload,
    CreateHoldingPayload,
    HoldingDTO,
    HoldingTagDTO,
    ReorderPayload,
    UpdateAssetTagPayload,
    success,
)

router = APIRouter()
logger = logging.getLogger(__name__)

_HOLDINGS_COL = "holdings"
_ASSET_TAGS_COL = "asset_tags"


# ── 反序列化工具 ───────────────────────────────────────────────────────────────

def _deserialize_holding(doc) -> dict:
    d = doc.to_dict()
    ua = d.get("updated_at")
    updated_at = ua.isoformat() if hasattr(ua, "isoformat") else datetime.now(timezone.utc).isoformat()
    return {
        "stockId":        doc.id,
        "stockName":      d.get("stock_name"),
        "sharesHeld":     d.get("shares_held", 0),
        "avgCost":        d.get("avg_cost", 0),
        "totalCost":      d.get("total_cost", 0),
        "realizedProfit": d.get("realized_profit", 0),
        "costMethod":     d.get("cost_method", "preserve_method"),
        "updatedAt":      updated_at,
        "sortIndex":      d.get("sort_index", 0),
    }


def _deserialize_asset_tag(doc) -> dict:
    d = doc.to_dict()
    return {
        "id":          doc.id,
        "stockCode":   d.get("stock_code", ""),
        "tagName":     d.get("tag_name", ""),
        "weightRatio": d.get("weight_ratio", 0),
    }


# ── 即時報價（M4 完整實作前的簡易版）─────────────────────────────────────────

def _fetch_quote_sync(stock_id: str) -> Optional[dict]:
    try:
        ticker_sym = f"{stock_id}.TW" if len(stock_id) == 4 and stock_id.isdigit() else stock_id
        info = yf.Ticker(ticker_sym).fast_info
        price = getattr(info, "last_price", None) or getattr(info, "regular_market_price", None)
        prev  = getattr(info, "previous_close", None)
        if price and price > 0:
            change = round(price - prev, 2) if prev else 0.0
            change_pct = round(change / prev * 100, 2) if prev else 0.0
            return {"price": price, "change": change, "changePercent": change_pct}
    except Exception as e:
        logger.debug("Quote fetch failed for %s: %s", stock_id, e)
    return None


# ── GET /holdings/prices ───────────────────────────────────────────────────────

@router.get("/prices")
async def get_prices():
    snap = db.collection(_HOLDINGS_COL).stream()
    holdings = [_deserialize_holding(d) for d in snap]
    active = [h for h in holdings if h["sharesHeld"] > 0]

    async def fetch(h):
        q = await asyncio.to_thread(_fetch_quote_sync, h["stockId"])
        if not q:
            return None
        return {
            "stockCode":        h["stockId"],
            "currentPrice":     q["price"],
            "change":           q["change"],
            "changePct":        q["changePercent"],
            "unrealizedProfit": round(q["price"] * h["sharesHeld"] - h["totalCost"]),
        }

    results = await asyncio.gather(*[fetch(h) for h in active], return_exceptions=True)
    data = [r for r in results if r and not isinstance(r, Exception)]
    return success(data)


# ── GET /holdings ──────────────────────────────────────────────────────────────

@router.get("")
async def get_all():
    holdings_snap = db.collection(_HOLDINGS_COL).stream()
    tags_snap     = db.collection(_ASSET_TAGS_COL).stream()

    holdings = sorted(
        [_deserialize_holding(d) for d in holdings_snap],
        key=lambda h: h["sortIndex"],
    )
    tags_map: dict[str, list] = {}
    for td in tags_snap:
        at = _deserialize_asset_tag(td)
        tags_map.setdefault(at["stockCode"], []).append(
            {"id": at["id"], "tagName": at["tagName"], "weightRatio": at["weightRatio"]}
        )

    async def enrich(h):
        result = {**h, "tags": tags_map.get(h["stockId"], [])}
        if h["sharesHeld"] > 0:
            q = await asyncio.to_thread(_fetch_quote_sync, h["stockId"])
            if q:
                result["currentPrice"]  = q["price"]
                result["change"]        = q["change"]
                result["changePercent"] = q["changePercent"]
        return result

    enriched = await asyncio.gather(*[enrich(h) for h in holdings], return_exceptions=True)
    data = [r for r in enriched if not isinstance(r, Exception)]
    return success(data)


# ── GET /holdings/{stock_id} ───────────────────────────────────────────────────

@router.get("/{stock_id}")
async def get_by_id(stock_id: str):
    doc = db.collection(_HOLDINGS_COL).document(stock_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="庫存不存在")
    h = _deserialize_holding(doc)
    if h["sharesHeld"] > 0:
        q = await asyncio.to_thread(_fetch_quote_sync, stock_id)
        if q:
            h["currentPrice"]  = q["price"]
            h["change"]        = q["change"]
            h["changePercent"] = q["changePercent"]
    return success(h)


# ── PUT /holdings/reorder ──────────────────────────────────────────────────────

@router.put("/reorder")
def reorder(payload: ReorderPayload):
    if not payload.order:
        raise HTTPException(status_code=400, detail="order 必須為非空字串陣列")
    batch = db.batch()
    col = db.collection(_HOLDINGS_COL)
    for idx, stock_id in enumerate(payload.order):
        batch.update(col.document(stock_id), {"sort_index": idx})
    batch.commit()
    return success({"reordered": len(payload.order)})


# ── POST /holdings/recalculate ─────────────────────────────────────────────────

@router.post("/recalculate")
def recalculate(request: Request, holdings: List[CreateHoldingPayload]):
    if not holdings:
        raise HTTPException(status_code=400, detail="Request body 必須為非空陣列")
    batch = db.batch()
    col = db.collection(_HOLDINGS_COL)
    for h in holdings:
        payload: dict = {
            "stock_id":        h.stockId,
            "shares_held":     h.sharesHeld,
            "avg_cost":        h.avgCost,
            "total_cost":      h.totalCost,
            "realized_profit": h.realizedProfit,
            "cost_method":     h.costMethod,
            "updated_at":      SERVER_TIMESTAMP,
        }
        if h.stockName:
            payload["stock_name"] = h.stockName
        batch.set(col.document(h.stockId), payload, merge=True)
    batch.commit()
    return success({"updated": len(holdings)})


# ── Asset Tag 嵌套路由 ─────────────────────────────────────────────────────────

@router.post("/{stock_code}/tags", status_code=201)
def create_asset_tag(stock_code: str, payload: CreateAssetTagPayload):
    tag_name = payload.tagName.strip()
    if not tag_name:
        raise HTTPException(status_code=400, detail="tagName 為必填欄位")

    # 確認 tag 存在
    tags_snap = db.collection("tags").where("name", "==", tag_name).limit(1).stream()
    if not any(True for _ in tags_snap):
        raise HTTPException(status_code=400, detail=f'Tag "{tag_name}" 不存在')

    ref = db.collection(_ASSET_TAGS_COL).document()
    ref.set({
        "stock_code":   stock_code,
        "tag_name":     tag_name,
        "weight_ratio": payload.weightRatio,
    })
    doc = ref.get()
    at = _deserialize_asset_tag(doc)
    return success(at)


@router.put("/{stock_code}/tags/{tag_id}")
def update_asset_tag(stock_code: str, tag_id: str, payload: UpdateAssetTagPayload):
    ref = db.collection(_ASSET_TAGS_COL).document(tag_id)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail="AssetTag 不存在")
    ref.update({"weight_ratio": payload.weightRatio})
    at = _deserialize_asset_tag(ref.get())
    return success(at)


@router.delete("/{stock_code}/tags/{tag_id}")
def delete_asset_tag(stock_code: str, tag_id: str):
    ref = db.collection(_ASSET_TAGS_COL).document(tag_id)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail="AssetTag 不存在")
    ref.delete()
    return success({"deleted": tag_id})
