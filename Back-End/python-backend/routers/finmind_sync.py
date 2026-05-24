"""FinMind 每日同步端點 — 同步基本面與法人籌碼至 Firestore。

路由：POST /api/v1/finmind/sync
觸發：GitHub Actions（收盤後）+ X-Cron-Token；或手動 curl。
"""
import asyncio
import logging
import time
from datetime import date, timedelta, datetime, timezone

from fastapi import APIRouter
from services.firestore import get_db
from services.finmind import fetch_chip, build_stock_fundamental

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
    loop = asyncio.get_event_loop()

    def _sync():
        db = get_db()
        holdings = db.collection("holdings").get()
        stock_ids = [doc.id for doc in holdings if doc.exists]

        chip_start = (date.today() - timedelta(days=45)).strftime("%Y-%m-%d")
        synced = 0
        errors: list[dict] = []

        for sid in stock_ids:
            try:
                # 1. 基本面 → stock_fundamentals/{stockId}
                fund = build_stock_fundamental(sid)
                db.collection("stock_fundamentals").document(sid).set(fund, merge=False)

                # 2. 籌碼 → stock_chip/{stockId}/records/{date}（整批覆蓋 45 日）
                chip_rows = fetch_chip(sid, chip_start)
                chip_ref = (
                    db.collection("stock_chip")
                    .document(sid)
                    .collection("records")
                )
                for row in chip_rows:
                    chip_ref.document(row["date"]).set(
                        {
                            "date":       row["date"],
                            "foreign":    row["foreign"],
                            "trust":      row["trust"],
                            "dealer":     row["dealer"],
                            "updated_at": datetime.now(tz=timezone.utc).isoformat(),
                        },
                        merge=True,
                    )

                synced += 1
                time.sleep(0.2)
            except Exception as exc:
                logger.error("FinMind sync 失敗 %s: %s", sid, exc)
                errors.append({"stockId": sid, "error": str(exc)})

        return {"synced": synced, "errors": errors}

    result = await loop.run_in_executor(None, _sync)
    return {"success": True, "data": result}
