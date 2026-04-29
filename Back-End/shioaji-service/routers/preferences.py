from fastapi import APIRouter
from models import preferences as prefs_model
import lib.api_response as R

router = APIRouter()


@router.get("")
async def get_preferences():
    data = await prefs_model.find()
    return R.success(data)


@router.put("")
async def update_preferences(body: dict):
    data = await prefs_model.merge(body)
    return R.success(data)
