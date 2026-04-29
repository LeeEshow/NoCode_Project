"""@deprecated 已由 /api/v1/foreign-assets 取代。保留路由避免舊呼叫 404。"""
from fastapi import APIRouter, HTTPException
from models import foreign_currency as fc_model
from lib.rate_helper import get_live_rate_map
import lib.api_response as R
import asyncio

router = APIRouter()


@router.get("")
async def get_all():
    currencies, rate_map = await asyncio.gather(fc_model.find_all(), get_live_rate_map())
    data = []
    for c in currencies:
        live_rate      = rate_map.get(c["currencyCode"])
        effective_rate = c["manualRate"] if c["useManualRate"] else live_rate
        twd_value      = round(c["amount"] * effective_rate) if effective_rate is not None else None
        data.append({**c, "liveRate": live_rate, "twdValue": twd_value})
    return R.success(data)


@router.put("/{code}")
async def upsert(code: str, body: dict):
    code = code.upper()
    if code not in fc_model.ALLOWED_CODES:
        raise HTTPException(400, f"不支援的幣別：{code}，允許：{', '.join(fc_model.ALLOWED_CODES)}")
    for k in ["amount", "useManualRate", "manualRate"]:
        if body.get(k) is None:
            raise HTTPException(400, f"缺少必填欄位：{k}")
    data = await fc_model.upsert({
        "currencyCode": code,
        "amount":       float(body["amount"]),
        "useManualRate": bool(body["useManualRate"]),
        "manualRate":   float(body["manualRate"]),
    })
    return R.success(data)


@router.delete("/{code}")
async def delete(code: str):
    deleted = await fc_model.delete(code)
    if not deleted:
        raise HTTPException(404, f"外幣持倉不存在：{code}")
    return R.success({"deleted": code.upper()})
