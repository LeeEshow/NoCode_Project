"""FinMind 每日同步端點 — 同步基本面與法人籌碼至 Firestore。

路由：POST /api/v1/finmind/sync
觸發：GitHub Actions（收盤後）+ X-Cron-Token；或手動 curl。
"""
import asyncio
import logging

from fastapi import APIRouter
from services.firestore import get_db
from services.finmind import sync_stocks_finmind

router = APIRouter()
logger = logging.getLogger(__name__)


# ─── 同步端點 ──────────────────────────────────────────────────────────────────

@router.post("/sync")
async def finmind_sync():
    """讀取 holdings，對每支持股依序同步基本面 + 法人籌碼至 Firestore。

    - 每股間隔 200ms 避免 FinMind rate limit
    - 個別股票失敗不中斷整批，記錄 errors 後繼續
    - 籌碼同步近 45 天歷史（首次執行可回補）
    """
    def _sync():
        db = get_db()
        holdings = db.collection("holdings").get()
        stock_ids = [doc.id for doc in holdings if doc.exists]
        return sync_stocks_finmind(db, stock_ids)

    result = await asyncio.to_thread(_sync)
    return {"success": True, "data": result}
