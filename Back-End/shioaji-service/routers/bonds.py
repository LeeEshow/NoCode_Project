"""@deprecated 已由 /api/v1/foreign-assets 取代。保留路由避免舊呼叫 404。"""
from fastapi import APIRouter, HTTPException
from models import bond as bond_model
from lib.rate_helper import get_live_rate_map
import lib.api_response as R
import asyncio

router = APIRouter()


@router.get("")
async def get_all():
    bonds, rate_map = await asyncio.gather(bond_model.find_all(), get_live_rate_map())
    data = [
        {**b, "twdEstimate": round(b["faceValue"] * rate_map[b["currency"]])
               if rate_map.get(b["currency"]) else None}
        for b in bonds
    ]
    return R.success(data)


@router.post("", status_code=201)
async def create(body: dict):
    required = ["name", "couponRate", "maturityDate", "currency", "faceValue"]
    missing  = [k for k in required if body.get(k) is None]
    if missing:
        raise HTTPException(400, f"缺少必填欄位：{' / '.join(missing)}")
    data = await bond_model.create(body)
    return R.success(data)


@router.put("/{doc_id}")
async def update(doc_id: str, body: dict):
    data = await bond_model.update(doc_id, body)
    if not data:
        raise HTTPException(404, f"債券不存在：{doc_id}")
    return R.success(data)


@router.delete("/{doc_id}")
async def delete(doc_id: str):
    deleted = await bond_model.delete(doc_id)
    if not deleted:
        raise HTTPException(404, f"債券不存在：{doc_id}")
    return R.success({"deleted": doc_id})
