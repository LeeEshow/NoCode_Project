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

# 防止多個 /record 請求並發觸發同一快照（asyncio.Lock，process 內唯一）
_record_lock = asyncio.Lock()


def deserialize_snapshot(doc) -> dict:
    return _deserialize_snapshot_dict(doc.id, doc.to_dict())


# ─── GET /snapshots ───────────────────────────────────────────────────────────

@router.get("")
def get_snapshots(year: int | None = Query(default=None)):
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


def _bg_sync_watchlist_finmind() -> None:
    """背景任務：同步關注清單（不含持股）的三大法人 & 基本面至 Firestore。

    - 已在 holdings 的股票由 finmind/sync cron 負責，此處略過以節省 FinMind API 配額
    - 個別股票失敗不中斷整批（由 sync_stocks_finmind 內部處理）
    """
    try:
        from services.firestore import get_db as _get_db
        from services.finmind import sync_stocks_finmind
        _db = _get_db()

        watchlist_docs = _db.collection("watchlist").get()
        holdings_docs  = _db.collection("holdings").get()
        holdings_ids   = {doc.id for doc in holdings_docs if doc.exists}

        # 只同步「純關注、不在持股」的股票
        watchlist_ids = [
            doc.id for doc in watchlist_docs
            if doc.exists and doc.id not in holdings_ids
        ]
        if not watchlist_ids:
            logger.info("Watchlist FinMind sync: 無獨有關注股，略過")
            return

        result = sync_stocks_finmind(_db, watchlist_ids)
        logger.info("Watchlist FinMind sync 完成: %s", result)
    except Exception as e:
        logger.error("Background watchlist FinMind sync failed: %s", e)


@router.post("/record")
async def record(background_tasks: BackgroundTasks):
    if _record_lock.locked():
        raise HTTPException(status_code=409, detail="快照記錄正在進行中，請稍後再試")
    async with _record_lock:
        data = await record_snapshot()
    background_tasks.add_task(_bg_recalculate_risk)
    background_tasks.add_task(_bg_sync_watchlist_finmind)
    return {"success": True, "data": data}


# ─── POST /snapshots ──────────────────────────────────────────────────────────

@router.post("")
def create_snapshot(body: dict):
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
def get_by_date(date: str):
    db = get_db()
    doc = db.collection("daily_snapshots").document(date).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail=f"快照不存在：{date}")
    return {"success": True, "data": deserialize_snapshot(doc)}


# ─── PUT /snapshots/{date} ────────────────────────────────────────────────────

@router.put("/{date}")
def update_snapshot(date: str, body: dict):
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
