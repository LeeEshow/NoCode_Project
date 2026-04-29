from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from models import transaction
import lib.api_response as R

router = APIRouter()


@router.get("")
async def get_all(stock_id: Optional[str] = Query(default=None)):
    data = await transaction.find_all(stock_id)
    return R.success(data)


@router.get("/{doc_id}")
async def get_by_id(doc_id: str):
    data = await transaction.find_by_id(doc_id)
    if not data:
        raise HTTPException(404, "交易紀錄不存在")
    return R.success(data)


@router.post("", status_code=201)
async def create(body: dict):
    required = ["stockId", "type", "date", "shares", "pricePerShare", "fee"]
    missing  = [k for k in required if body.get(k) is None]
    if missing:
        raise HTTPException(400, f"缺少必填欄位：{' / '.join(missing)}")
    data = await transaction.create(body)
    return R.success(data)


@router.put("/{doc_id}")
async def update(doc_id: str, body: dict):
    data = await transaction.update(doc_id, body)
    if not data:
        raise HTTPException(404, "交易紀錄不存在")
    return R.success(data)


@router.delete("/{doc_id}", status_code=204)
async def delete(doc_id: str):
    deleted = await transaction.delete(doc_id)
    if not deleted:
        raise HTTPException(404, "交易紀錄不存在")
