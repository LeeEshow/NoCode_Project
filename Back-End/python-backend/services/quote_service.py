"""
Quote Service — 集中報價取得邏輯

Provider 順位：
  盤中：Shioaji tick cache（記憶體，無 HTTP）→ Yahoo
  盤後：Shioaji tick cache（記憶體）→ TWSE（TSE only，4s）→ Yahoo（5s）

個股報價完全不走 HTTP REST；Shioaji 資料由 WebSocket tick push 填入 memory cache。
未訂閱股票會即時訂閱 WebSocket（快速），首次訂閱後 tick 尚未到達時直接走 fallback。
TAIEX 大盤指數由 Yahoo Finance ^TWII 提供（Index 不支援 Tick 訂閱）。
"""

import asyncio
import logging
import time
from typing import Literal

from services.api_switch import shioaji_enabled
from utils.market_hours import is_market_open

logger = logging.getLogger(__name__)

QuoteSource = Literal["shioaji", "twse", "yahoo", "unknown"]
QuoteStatus = Literal["ok", "stale", "timeout", "error", "unavailable"]

_TWSE_TIMEOUT      = 4.0   # TWSE API timeout（有 cache，通常命中後幾乎 0ms）
_YAHOO_TIMEOUT     = 5.0   # Yahoo Finance timeout
_FALLBACK_DEADLINE = 9.0   # 批次 fallback 並行總 deadline


# ─── DTO 建構工具 ──────────────────────────────────────────────────────────────

def _market_status() -> str:
    return "TRADING" if is_market_open() else "CLOSED"


def _placeholder(
    stock_id: str,
    source: QuoteSource,
    status: QuoteStatus,
    message: str = "",
) -> dict:
    """所有 provider 失敗時的占位資料；UI 層需搭配 quoteStatus 判斷，不可解讀 price=0 為真實股價。"""
    return {
        "stockId":       stock_id,
        "name":          stock_id,
        "price":         0,
        "change":        0,
        "changePercent": 0,
        "high":          0,
        "low":           0,
        "volume":        0,
        "marketStatus":  _market_status(),
        "updatedAt":     int(time.time()),
        "quoteSource":   source,
        "quoteStatus":   status,
        "quoteMessage":  message,
    }


def _from_snap(stock_id: str, snap: dict) -> dict:
    """從 Shioaji tick cache dict 建構 quote DTO（camelCase 欄位，與 snapshot 版相容）"""
    return {
        "stockId":       stock_id,
        "name":          stock_id,
        "price":         snap["price"],
        "change":        snap["change"],
        "changePercent": snap["changePercent"],
        "high":          snap["high"],
        "low":           snap["low"],
        "volume":        snap["volume"],
        "marketStatus":  _market_status(),
        "updatedAt":     snap.get("updatedAt") or int(time.time()),
        "quoteSource":   "shioaji",
        "quoteStatus":   "ok",
        "quoteMessage":  "",
    }


def _from_twse(stock_id: str, twse: dict) -> dict:
    return {
        "stockId":       stock_id,
        "name":          stock_id,
        "price":         twse["price"],
        "change":        twse["change"],
        "changePercent": twse["changePercent"],
        "high":          twse["high"],
        "low":           twse["low"],
        "volume":        twse["volume"],
        "marketStatus":  "CLOSED",
        "updatedAt":     int(time.time()),
        "quoteSource":   "twse",
        "quoteStatus":   "ok",
        "quoteMessage":  "",
    }


def _from_yahoo(stock_id: str, yahoo: dict) -> dict:
    return {
        **yahoo,
        "quoteSource":  "yahoo",
        "quoteStatus":  "ok",
        "quoteMessage": "",
    }


def _is_tse(stock_id: str) -> bool:
    """回傳 True 代表 TSE 上市；False 為 OTC 上櫃。resolve_symbol() 有 3600s cache。"""
    from services.yahoo_finance import resolve_symbol
    return not resolve_symbol(stock_id).endswith(".TWO")


# ─── Public API ────────────────────────────────────────────────────────────────

async def get_quote(stock_id: str) -> dict:
    """
    取得單一個股報價。

    Provider 順位：
      Shioaji tick cache（記憶體）→ TWSE（盤後 TSE only，4s）→ Yahoo（5s）

    Shioaji 報價從 WebSocket tick memory cache 讀取，不走 HTTP REST。
    未訂閱則即時訂閱 WebSocket（快速），但首次訂閱後 tick 尚未到達時直接 fallback Yahoo。
    永遠回傳 dict，不拋例外。
    """
    loop = asyncio.get_running_loop()

    # ── 1. Shioaji tick cache（記憶體讀取，無 HTTP）────────────────────────────
    if shioaji_enabled():
        from services.shioaji_manager import shioaji_manager
        if shioaji_manager.initialized:
            cached = shioaji_manager.get_cached_stock(stock_id)
            if cached is not None:
                return _from_snap(stock_id, cached)

            # 尚未訂閱 → 背景訂閱 WebSocket tick，本次請求直接 fallback（不阻塞熱路徑）
            if not shioaji_manager.is_subscribed(stock_id):
                t = asyncio.ensure_future(shioaji_manager.subscribe_stock(stock_id))
                t.add_done_callback(
                    lambda f: logger.warning("subscribe_stock bg error: %s", f.exception())
                    if not f.cancelled() and f.exception() else None
                )

    # ── 2. TWSE（盤後 TSE only；盤中 TWSE 只有昨收，跳過）─────────────────────
    if not is_market_open() and _is_tse(stock_id):
        try:
            from services.twse_finance import get_twse_closing_price
            twse = await asyncio.wait_for(
                loop.run_in_executor(None, get_twse_closing_price, stock_id),
                timeout=_TWSE_TIMEOUT,
            )
            if twse is not None:
                return _from_twse(stock_id, twse)
        except asyncio.TimeoutError:
            logger.warning("TWSE timeout: %s", stock_id)
        except Exception as e:
            logger.warning("TWSE error %s: %s", stock_id, e)

    # ── 3. Yahoo Finance ──────────────────────────────────────────────────────
    try:
        from services.yahoo_finance import get_yahoo_quote
        q = await asyncio.wait_for(
            loop.run_in_executor(None, get_yahoo_quote, stock_id),
            timeout=_YAHOO_TIMEOUT,
        )
        return _from_yahoo(stock_id, q)
    except asyncio.TimeoutError:
        logger.warning("Yahoo timeout: %s", stock_id)
        return _placeholder(stock_id, "unknown", "timeout", "本輪報價逾時")
    except Exception as e:
        logger.warning("Yahoo error %s: %s", stock_id, e)
        return _placeholder(stock_id, "unknown", "error", str(e))


async def get_quotes(stock_ids: list[str]) -> dict[str, dict]:
    """
    批次取得個股報價。

    流程：
      1. Shioaji tick cache 批次讀取（記憶體，即時，無 HTTP）
         - 有新鮮 cache（< 120s）→ Shioaji 資料
         - 尚未訂閱的股票 → 批次訂閱 WebSocket（一次性）
         - 首次訂閱後 tick 尚未到達 → 進入 fallback
      2. 缺口股票並行（總 deadline 9s，asyncio.wait 保留部分結果）：
         - 盤後 TSE：TWSE（4s）→ Yahoo（5s）
         - 盤中或 OTC：直接 Yahoo（5s）

    永遠回傳完整 {stock_id: dict}，單股失敗不影響其他股票。
    """
    if not stock_ids:
        return {}

    loop = asyncio.get_running_loop()
    results: dict[str, dict] = {}
    pending: list[str] = list(stock_ids)

    # ── 1. Shioaji tick cache ─────────────────────────────────────────────────
    if shioaji_enabled():
        from services.shioaji_manager import shioaji_manager
        if shioaji_manager.initialized:
            # 尚未訂閱的股票 → 背景訂閱，本次請求直接 fallback（不阻塞熱路徑）
            unsubscribed = [sid for sid in pending if not shioaji_manager.is_subscribed(sid)]
            if unsubscribed:
                t = asyncio.ensure_future(shioaji_manager.subscribe_stocks(unsubscribed))
                t.add_done_callback(
                    lambda f: logger.warning("subscribe_stocks bg error: %s", f.exception())
                    if not f.cancelled() and f.exception() else None
                )

            # 批次讀 tick cache
            cached_all = shioaji_manager.get_cached_stocks(pending)
            for sid, snap in cached_all.items():
                if snap is not None:
                    results[sid] = _from_snap(sid, snap)
            pending = [sid for sid in pending if sid not in results]

    if not pending:
        return results

    # ── 2. 缺口：TWSE / Yahoo 並行（總 deadline _FALLBACK_DEADLINE）────────────

    _market_open = is_market_open()

    async def _fallback_one(sid: str) -> tuple[str, dict]:
        """盤後 TSE：TWSE → Yahoo；盤中或 OTC：直接 Yahoo。永遠 return，不 raise。"""
        if not _market_open and _is_tse(sid):
            try:
                from services.twse_finance import get_twse_closing_price
                twse = await asyncio.wait_for(
                    loop.run_in_executor(None, get_twse_closing_price, sid),
                    timeout=_TWSE_TIMEOUT,
                )
                if twse is not None:
                    return sid, _from_twse(sid, twse)
            except asyncio.TimeoutError:
                logger.warning("TWSE timeout: %s", sid)
            except Exception as e:
                logger.warning("TWSE error %s: %s", sid, e)

        try:
            from services.yahoo_finance import get_yahoo_quote
            q = await asyncio.wait_for(
                loop.run_in_executor(None, get_yahoo_quote, sid),
                timeout=_YAHOO_TIMEOUT,
            )
            return sid, _from_yahoo(sid, q)
        except asyncio.TimeoutError:
            return sid, _placeholder(sid, "unknown", "timeout", "本輪報價逾時")
        except Exception as e:
            return sid, _placeholder(sid, "unknown", "error", str(e))

    tasks = {asyncio.ensure_future(_fallback_one(sid)): sid for sid in pending}
    done, not_done = await asyncio.wait(tasks.keys(), timeout=_FALLBACK_DEADLINE)

    for task in not_done:
        task.cancel()
        sid = tasks[task]
        results[sid] = _placeholder(sid, "unknown", "timeout", "批次報價逾時")

    for task in done:
        sid_result, q = task.result()
        results[sid_result] = q

    return results
