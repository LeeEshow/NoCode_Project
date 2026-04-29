from fastapi import APIRouter, HTTPException
from models import settings as settings_model
import lib.api_response as R

router = APIRouter()


@router.get("")
async def get_settings():
    data = await settings_model.find()
    if not data:
        return R.success({"costMethod": "preserve_method", "updatedAt": None})
    return R.success(data)


@router.put("")
async def update_settings(body: dict):
    cost_method = body.get("costMethod")
    if not cost_method:
        raise HTTPException(400, "缺少必填欄位：costMethod")
    if cost_method not in ["preserve_method", "return_method"]:
        raise HTTPException(400, "costMethod 必須為 preserve_method 或 return_method")
    data = await settings_model.upsert(cost_method)
    return R.success(data)
