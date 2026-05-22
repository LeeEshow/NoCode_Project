from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

import yfinance as yf
from fastapi import APIRouter, HTTPException
from google.cloud.firestore import SERVER_TIMESTAMP

from services.firestore import db
from routers.schemas import (
    ALLOWED_CURRENCIES,
    CreateForeignAssetPayload,
    UpdateForeignAssetPayload,
    success,
)

router = APIRouter()
logger = logging.getLogger(__name__)

_COL = "foreign_assets"

# 對應 yfinance forex ticker 格式（X/TWD）
_FOREX_SYMBOLS = {
    "USD": "USDTWD=X",
    "JPY": "JPYTWD=X",
    "EUR": "EURTWD=X",
    "CNY": "CNYTWD=X",
    "HKD": "HKDTWD=X",
    "GBP": "GBPTWD=X",
    "AUD": "AUDTWD=X",
    "SGD": "SGDTWD=X",
}


def _deserialize(doc) -> dict:
    d = doc.to_dict()
    ua = d.get("updated_at")
    return {
        "id":            doc.id,
        "type":          d.get("type", "活存"),
        "name":          d.get("name", ""),
        "currency":      d.get("currency", ""),
        "amount":        d.get("amount", 0),
        "interestRate":  d.get("interest_rate", 0),
        "maturityDate":  d.get("maturity_date"),
        "useManualRate": d.get("use_manual_rate", False),
        "manualRate":    d.get("manual_rate", 0),
        "updatedAt":     ua.isoformat() if hasattr(ua, "isoformat") else datetime.now(timezone.utc).isoformat(),
    }


def _fetch_rate_sync(currency: str) -> Optional[float]:
    symbol = _FOREX_SYMBOLS.get(currency.upper())
    if not symbol:
        return None
    try:
        info = yf.Ticker(symbol).fast_info
        rate = getattr(info, "last_price", None) or getattr(info, "regular_market_price", None)
        return float(rate) if rate else None
    except Exception as e:
        logger.debug("Forex rate fetch failed for %s: %s", currency, e)
        return None


def _validate_create(payload: CreateForeignAssetPayload) -> None:
    if payload.currency.upper() not in ALLOWED_CURRENCIES:
        raise HTTPException(status_code=400, detail=f"currency 必須為 {' | '.join(ALLOWED_CURRENCIES)}")
    if payload.amount < 0:
        raise HTTPException(status_code=400, detail="amount 必須為非負數")
    if payload.interestRate < 0:
        raise HTTPException(status_code=400, detail="interestRate 必須為非負數")
    if payload.type != "活存" and not payload.maturityDate:
        raise HTTPException(status_code=400, detail="定存與債券必須提供 maturityDate（YYYY-MM-DD）")
    if payload.maturityDate:
        import re
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", payload.maturityDate):
            raise HTTPException(status_code=400, detail="maturityDate 格式錯誤，應為 YYYY-MM-DD")


# ── GET /foreign-assets ────────────────────────────────────────────────────────

@router.get("")
async def get_all():
    snap = db.collection(_COL).order_by("updated_at", direction="DESCENDING").stream()
    assets = [_deserialize(d) for d in snap]

    currencies = list({a["currency"] for a in assets})
    rate_results = await asyncio.gather(
        *[asyncio.to_thread(_fetch_rate_sync, c) for c in currencies],
        return_exceptions=True,
    )
    rate_map = {
        c: (r if not isinstance(r, Exception) else None)
        for c, r in zip(currencies, rate_results)
    }

    result = [{**a, "liveRate": rate_map.get(a["currency"])} for a in assets]
    return success(result)


# ── POST /foreign-assets ───────────────────────────────────────────────────────

@router.post("", status_code=201)
def create(payload: CreateForeignAssetPayload):
    _validate_create(payload)
    ref = db.collection(_COL).document()
    ref.set({
        "type":            payload.type,
        "name":            payload.name,
        "currency":        payload.currency.upper(),
        "amount":          payload.amount,
        "interest_rate":   payload.interestRate,
        "maturity_date":   payload.maturityDate,
        "use_manual_rate": payload.useManualRate,
        "manual_rate":     payload.manualRate,
        "updated_at":      SERVER_TIMESTAMP,
    })
    return success(_deserialize(ref.get()))


# ── PUT /foreign-assets/{id} ───────────────────────────────────────────────────

@router.put("/{asset_id}")
def update(asset_id: str, payload: UpdateForeignAssetPayload):
    ref = db.collection(_COL).document(asset_id)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail="找不到該外幣資產")

    import re
    if payload.type and payload.type not in ["活存", "定存", "債券"]:
        raise HTTPException(status_code=400, detail="type 必須為 活存 | 定存 | 債券")
    if payload.currency and payload.currency.upper() not in ALLOWED_CURRENCIES:
        raise HTTPException(status_code=400, detail=f"currency 必須為 {' | '.join(ALLOWED_CURRENCIES)}")
    if payload.maturityDate and not re.match(r"^\d{4}-\d{2}-\d{2}$", payload.maturityDate):
        raise HTTPException(status_code=400, detail="maturityDate 格式錯誤，應為 YYYY-MM-DD")

    patch: dict = {"updated_at": SERVER_TIMESTAMP}
    if payload.type           is not None: patch["type"]            = payload.type
    if payload.name           is not None: patch["name"]            = payload.name
    if payload.currency       is not None: patch["currency"]        = payload.currency.upper()
    if payload.amount         is not None: patch["amount"]          = payload.amount
    if payload.interestRate   is not None: patch["interest_rate"]   = payload.interestRate
    if payload.maturityDate   is not None: patch["maturity_date"]   = payload.maturityDate
    if payload.useManualRate  is not None: patch["use_manual_rate"] = payload.useManualRate
    if payload.manualRate     is not None: patch["manual_rate"]     = payload.manualRate
    ref.update(patch)
    return success(_deserialize(ref.get()))


# ── DELETE /foreign-assets/{id} ───────────────────────────────────────────────

@router.delete("/{asset_id}")
def remove(asset_id: str):
    ref = db.collection(_COL).document(asset_id)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail="找不到該外幣資產")
    ref.delete()
    return success({"deleted": True})
