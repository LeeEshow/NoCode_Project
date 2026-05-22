"""
GET/POST/PUT/DELETE /api/v1/asset-tags
對應 Node.js assetTagsController（前端 tagModel.ts 直接呼叫此路由）
"""
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse
from services.firestore import get_db
from services.yahoo_finance import get_all_stocks

router = APIRouter()


def _name_map() -> dict[str, str]:
    stocks = get_all_stocks()
    return {s.get("code"): s.get("name") for s in stocks if s.get("code")}


def _to_dto(doc_id: str, d: dict, name_map: dict) -> dict:
    code = d.get("stock_code")
    return {
        "id":          doc_id,
        "stockCode":   code,
        "stockName":   name_map.get(code) if code else None,
        "tagName":     d.get("tag_name"),
        "weightRatio": d.get("weight_ratio"),
    }


def _deserialize(doc, name_map: dict) -> dict:
    return _to_dto(doc.id, doc.to_dict(), name_map)


# ─── GET /asset-tags ─────────────────────────────────────────────────────────

@router.get("/")
async def get_all(stockCode: str | None = Query(default=None)):
    db = get_db()
    col = db.collection("asset_tags")
    snap = col.where("stock_code", "==", stockCode).get() if stockCode else col.get()
    name_map = _name_map()
    return {"success": True, "data": [_deserialize(doc, name_map) for doc in snap]}


# ─── POST /asset-tags ────────────────────────────────────────────────────────

@router.post("/")
async def create(body: dict):
    stock_code   = (body.get("stockCode") or "").strip()
    tag_name     = (body.get("tagName") or "").strip()
    weight_ratio = body.get("weightRatio")

    if not stock_code:
        raise HTTPException(status_code=400, detail="stockCode 為必填欄位")
    if not tag_name:
        raise HTTPException(status_code=400, detail="tagName 為必填欄位")
    if not isinstance(weight_ratio, (int, float)) or weight_ratio <= 0 or weight_ratio > 100:
        raise HTTPException(status_code=400, detail="weightRatio 必須為 0 < value ≤ 100 的數字")

    db = get_db()
    tag_snap = db.collection("tags").where("name", "==", tag_name).limit(1).get()
    if not list(tag_snap):
        raise HTTPException(status_code=400, detail=f'Tag "{tag_name}" 不存在')

    ref = db.collection("asset_tags").document()
    ref.set({"stock_code": stock_code, "tag_name": tag_name, "weight_ratio": weight_ratio})
    name_map = _name_map()
    return JSONResponse(
        status_code=201,
        content={"success": True, "data": _to_dto(ref.id, ref.get().to_dict(), name_map)},
    )


# ─── PUT /asset-tags/:id ─────────────────────────────────────────────────────

@router.put("/{asset_tag_id}")
async def update(asset_tag_id: str, body: dict):
    weight_ratio = body.get("weightRatio")
    if not isinstance(weight_ratio, (int, float)) or weight_ratio <= 0 or weight_ratio > 100:
        raise HTTPException(status_code=400, detail="weightRatio 必須為 0 < value ≤ 100 的數字")

    db = get_db()
    ref = db.collection("asset_tags").document(asset_tag_id)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail="AssetTag 不存在")
    ref.update({"weight_ratio": weight_ratio})
    name_map = _name_map()
    return {"success": True, "data": _to_dto(asset_tag_id, ref.get().to_dict(), name_map)}


# ─── DELETE /asset-tags/:id ──────────────────────────────────────────────────

@router.delete("/{asset_tag_id}")
async def delete(asset_tag_id: str):
    db = get_db()
    ref = db.collection("asset_tags").document(asset_tag_id)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail="AssetTag 不存在")
    ref.delete()
    return {"success": True, "data": {"deleted": asset_tag_id}}
