import asyncio
import logging
import time
from fastapi import APIRouter, HTTPException, Query
from services.api_switch import get_switch_status, shioaji_enabled
from utils.market_hours import is_market_open

logger = logging.getLogger(__name__)
router = APIRouter()


# ─── Shioaji 重新初始化（背景工作）────────────────────────────────────────────────

async def _bg_reinitialize() -> None:
    from services.shioaji_manager import shioaji_manager
    from core.settings import get_settings
    from services.firestore import get_db

    try:
        await shioaji_manager.cleanup()

        s = get_settings()
        await asyncio.wait_for(
            shioaji_manager.initialize(s.sj_api_key, s.sj_secret_key),
            timeout=15,
        )
        # initialize() 內部設了 _initialized=True，但 warmup 尚未完成。
        # 暫時拉回 False，等 warmup 完成後才對前端揭露 initialized=true。
        shioaji_manager._initialized = False

        loop = asyncio.get_running_loop()

        def _read_stock_ids() -> list[str]:
            db = get_db()
            holdings  = db.collection("holdings").get()
            watchlist = db.collection("watchlist").get()
            return list({doc.id for doc in list(holdings) + list(watchlist) if doc.exists})

        stock_ids = await asyncio.wait_for(
            loop.run_in_executor(None, _read_stock_ids),
            timeout=10,
        )
        await asyncio.wait_for(
            shioaji_manager.warmup_stocks(stock_ids),
            timeout=35,
        )
        shioaji_manager._initialized = True  # warmup 完成，前端可偵測到 initialized=true
        logger.info("Shioaji reinitialized, %d stocks warmed up", len(stock_ids))
    except Exception as e:
        logger.error("Shioaji reinit failed: %s", e)
    finally:
        shioaji_manager._reinitializing = False


# ─── POST /system/shioaji/reinitialize ───────────────────────────────────────

@router.post("/shioaji/reinitialize", status_code=202)
async def shioaji_reinitialize():
    """
    觸發 Shioaji 重新初始化（非同步，立即回傳 202）。
    前端輪詢 GET /system/status 的 data.apiSwitch.providers.shioaji.initialized 確認結果。
    """
    if not shioaji_enabled():
        raise HTTPException(status_code=400, detail="Shioaji 未啟用（SJ_API_KEY 未設定）")

    from services.shioaji_manager import shioaji_manager
    if shioaji_manager._reinitializing:
        raise HTTPException(status_code=409, detail="正在初始化中，請稍後再試")

    # 先標記再 create_task，防止並發（asyncio 單執行緒，await 前不會切換）
    shioaji_manager._reinitializing = True
    asyncio.create_task(_bg_reinitialize())
    return {"success": True, "data": {"message": "重新初始化已觸發"}}


# ─── GET /system/status ───────────────────────────────────────────────────────

@router.get("/status")
async def system_status():
    switch = get_switch_status()
    return {
        "success": True,
        "data": {
            "apiSwitch": switch,
        },
    }


# ─── GET /system/shioaji-test ─────────────────────────────────────────────────

@router.get("/shioaji-test")
async def shioaji_test(stockId: str = Query(default="2330")):
    """
    直接測試 Shioaji api.snapshots()，不經 Yahoo fallback，供前端 SettingsModal 診斷使用。
    永遠回傳 200；Shioaji 未啟用或未初始化時回傳對應狀態。
    不回傳 API key / secret / auth header。
    """
    enabled     = shioaji_enabled()
    market_open = is_market_open()
    t0          = time.monotonic()

    # Shioaji 未啟用
    if not enabled:
        return {
            "success": True,
            "data": {
                "enabled":    False,
                "marketOpen": market_open,
                "manager":    {"initialized": False, "connected": False},
                "snapshot":   None,
                "quote":      None,
                "elapsedMs":  int((time.monotonic() - t0) * 1000),
            },
        }

    from services.shioaji_manager import shioaji_manager

    manager_status = shioaji_manager.get_status()

    # Shioaji 未初始化
    if not shioaji_manager.initialized:
        return {
            "success": True,
            "data": {
                "enabled":    True,
                "marketOpen": market_open,
                "manager":    manager_status,
                "snapshot":   None,
                "quote":      None,
                "elapsedMs":  int((time.monotonic() - t0) * 1000),
            },
        }

    # 直接呼叫 get_stock_snapshot，timeout 5s
    snap_raw  = None
    snap_info = None
    quote     = None

    try:
        result = await asyncio.wait_for(
            shioaji_manager.get_stock_snapshot(stockId),
            timeout=5.0,
        )
        if result is not None:
            snap_info = {
                "stockId":       stockId,
                "contractFound": True,
                "rawClose":      result["price"],
                "rawChangePrice": result["change"],
                "rawChangeRate":  result["changePercent"],
            }
            quote = {
                "price":         result["price"],
                "change":        result["change"],
                "changePercent": result["changePercent"],
                "source":        "shioaji",
                "status":        "ok",
            }
        else:
            snap_info = {
                "stockId":       stockId,
                "contractFound": False,
                "rawClose":      0,
                "rawChangePrice": 0,
                "rawChangeRate":  0,
            }
            quote = {
                "price":         0,
                "change":        0,
                "changePercent": 0,
                "source":        "shioaji",
                "status":        "unavailable",
            }
    except asyncio.TimeoutError:
        snap_info = {"stockId": stockId, "contractFound": None, "error": "timeout"}
        quote     = {"price": 0, "change": 0, "changePercent": 0,
                     "source": "shioaji", "status": "timeout"}
    except Exception as e:
        snap_info = {"stockId": stockId, "contractFound": None, "error": str(e)}
        quote     = {"price": 0, "change": 0, "changePercent": 0,
                     "source": "shioaji", "status": "error"}

    return {
        "success": True,
        "data": {
            "enabled":    True,
            "marketOpen": market_open,
            "manager":    manager_status,
            "snapshot":   snap_info,
            "quote":      quote,
            "elapsedMs":  int((time.monotonic() - t0) * 1000),
        },
    }
