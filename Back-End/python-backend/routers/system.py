import asyncio
import time
from fastapi import APIRouter, Query
from services.api_switch import get_switch_status, shioaji_enabled
from utils.market_hours import is_market_open

router = APIRouter()


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
