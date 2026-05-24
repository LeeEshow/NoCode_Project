import asyncio
import logging
import re
from datetime import datetime, timezone
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from fastapi.responses import JSONResponse
from firebase_admin import firestore as fs
from google.cloud.firestore_v1.base_query import FieldFilter
from services.firestore import get_db
from services.snapshot_service import record_snapshot, _deserialize_snapshot_dict

logger = logging.getLogger(__name__)

router = APIRouter()


def deserialize_snapshot(doc) -> dict:
    return _deserialize_snapshot_dict(doc.id, doc.to_dict())


# ─── GET /snapshots ───────────────────────────────────────────────────────────

@router.get("")
async def get_snapshots(year: int | None = Query(default=None)):
    if year is not None and not (2000 <= year <= 2100):
        raise HTTPException(status_code=400, detail="year 參數格式錯誤（例：?year=2025）")

    from_date = f"{year}-01-01" if year else "2000-01-01"
    to_date   = f"{year}-12-31" if year else "9999-12-31"

    db = get_db()
    snap = (
        db.collection("daily_snapshots")
        .where(filter=FieldFilter("date", ">=", from_date))
        .where(filter=FieldFilter("date", "<=", to_date))
        .order_by("date", direction="DESCENDING")
        .get()
    )
    return {"success": True, "data": [deserialize_snapshot(doc) for doc in snap]}


# ─── POST /snapshots/record ───────────────────────────────────────────────────

def _bg_recalculate_risk() -> None:
    """背景任務：重算 Tag 動態風險（不阻塞 record 回應）"""
    try:
        from services.firestore import get_db as _get_db
        from services.tag_risk_service import recalculate_dynamic_risk
        _db = _get_db()
        mstate_doc = _db.collection("market_state").document("main").get()
        mstate = mstate_doc.to_dict().get("current", "neutral") if mstate_doc.exists else "neutral"
        recalculate_dynamic_risk(mstate)
    except Exception as e:
        logger.error("Background risk recalculation failed: %s", e)


@router.post("/record")
async def record(background_tasks: BackgroundTasks):
    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(None, record_snapshot)
    background_tasks.add_task(_bg_recalculate_risk)
    return {"success": True, "data": data}


# ─── POST /snapshots ──────────────────────────────────────────────────────────

@router.post("")
async def create_snapshot(body: dict):
    date = body.get("date")
    if not date or not re.match(r"^\d{4}-\d{2}-\d{2}$", str(date)):
        raise HTTPException(status_code=400, detail="date 為必填欄位，格式 YYYY-MM-DD")

    for key in ["stockValue", "cashBalance", "forexValue", "unrealizedProfit"]:
        if body.get(key) is None:
            raise HTTPException(status_code=400, detail=f"缺少必填欄位：{key}")

    db = get_db()
    ref = db.collection("daily_snapshots").document(str(date))
    ref.set({
        "date":              str(date),
        "exec_capital":      float(body.get("execCapital", 0)),
        "reinvest":          float(body.get("reinvest", 0)),
        "stock_value":       float(body["stockValue"]),
        "cash_balance":      float(body["cashBalance"]),
        "forex_value":       float(body["forexValue"]),
        "unrealized_profit": float(body["unrealizedProfit"]),
        "note":              str(body.get("note", "")),
        "holdings":          body.get("holdings", []),
        "vix":               body.get("vix"),
        "market_state_auto": body.get("marketStateAuto"),
        "recorded_at":       fs.SERVER_TIMESTAMP,
    }, merge=True)

    return JSONResponse(
        status_code=201,
        content={"success": True, "data": deserialize_snapshot(ref.get())},
    )


# ─── GET /snapshots/{date} ────────────────────────────────────────────────────

@router.get("/{date}")
async def get_by_date(date: str):
    db = get_db()
    doc = db.collection("daily_snapshots").document(date).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail=f"快照不存在：{date}")
    return {"success": True, "data": deserialize_snapshot(doc)}


# ─── PUT /snapshots/{date} ────────────────────────────────────────────────────

@router.put("/{date}")
async def update_snapshot(date: str, body: dict):
    cash_balance = body.get("cashBalance")
    note         = body.get("note")

    if cash_balance is None and note is None:
        raise HTTPException(status_code=400, detail="至少需提供 cashBalance 或 note 其中一個欄位")

    db = get_db()
    ref = db.collection("daily_snapshots").document(date)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail=f"快照不存在：{date}")

    patch = {}
    if cash_balance is not None: patch["cash_balance"] = float(cash_balance)
    if note         is not None: patch["note"]         = str(note)
    ref.update(patch)

    return {"success": True, "data": deserialize_snapshot(ref.get())}
