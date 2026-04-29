import asyncio
from fastapi import APIRouter, HTTPException
from models import foreign_asset as fa_model
from lib.rate_helper import get_live_rate_map
import lib.api_response as R

router = APIRouter()

ALLOWED_CURRENCIES = fa_model.ALLOWED_CURRENCIES
ALLOWED_TYPES      = fa_model.ALLOWED_TYPES


def _validate(body: dict) -> None:
    if body.get("type") not in ALLOWED_TYPES:
        raise HTTPException(400, "type 必須為 活存 | 定存 | 債券")
    currency = (body.get("currency") or "").upper()
    if currency not in ALLOWED_CURRENCIES:
        raise HTTPException(400, f"currency 必須為 {' | '.join(ALLOWED_CURRENCIES)}")
    if not isinstance(body.get("amount"), (int, float)) or body["amount"] < 0:
        raise HTTPException(400, "amount 必須為非負數")
    if not isinstance(body.get("interestRate"), (int, float)) or body["interestRate"] < 0:
        raise HTTPException(400, "interestRate 必須為非負數")
    if body["type"] != "活存" and not body.get("maturityDate"):
        raise HTTPException(400, "定存與債券必須提供 maturityDate（YYYY-MM-DD）")
    md = body.get("maturityDate")
    if md and not __import__("re").match(r"^\d{4}-\d{2}-\d{2}$", md):
        raise HTTPException(400, "maturityDate 格式錯誤，應為 YYYY-MM-DD")


# ── GET /api/v1/foreign-assets ──────────────────────────────────────────────

@router.get("")
async def get_all():
    assets, rate_map = await asyncio.gather(
        fa_model.find_all(),
        get_live_rate_map(),
        return_exceptions=True,
    )
    if isinstance(assets, Exception):
        raise HTTPException(500, str(assets))
    if isinstance(rate_map, Exception):
        rate_map = {}

    result = [{**a, "liveRate": rate_map.get(a["currency"])} for a in assets]
    return R.success(result)


# ── POST /api/v1/foreign-assets ─────────────────────────────────────────────

@router.post("", status_code=201)
async def create(body: dict):
    _validate(body)
    data = await fa_model.create(body)
    return R.success(data)


# ── PUT /api/v1/foreign-assets/:id ──────────────────────────────────────────

@router.put("/{doc_id}")
async def update(doc_id: str, body: dict):
    if "currency" in body:
        body["currency"] = body["currency"].upper()
    if "type" in body and body["type"] not in ALLOWED_TYPES:
        raise HTTPException(400, "type 必須為 活存 | 定存 | 債券")
    data = await fa_model.update(doc_id, body)
    if data is None:
        raise HTTPException(404, "找不到該外幣資產")
    return R.success(data)


# ── DELETE /api/v1/foreign-assets/:id ───────────────────────────────────────

@router.delete("/{doc_id}")
async def delete(doc_id: str):
    deleted = await fa_model.delete(doc_id)
    if not deleted:
        raise HTTPException(404, "找不到該外幣資產")
    return R.success({"deleted": True})
