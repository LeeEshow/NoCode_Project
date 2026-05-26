"""
Quote Service — 集中報價取得邏輯

Provider 順位：
  盤中：Shioaji api.snapshots() → Yahoo
        （TWSE STOCK_DAY 盤中只有昨收，跳過）
  盤後：Shioaji api.snapshots() → TWSE（TSE only，4s）→ Yahoo（5s）

snap.close 語意：盤中 = 最新成交價；盤後 = 當日收盤價；同一欄位，不需分支。

Circuit Breaker 規則：
  - Shioaji API exception 或 timeout → 計入 circuit_breaker failure
  - 合約不存在（KeyError，回 None）或 close<=0 → 不計入
  - CB OPEN → 整批跳過 Shioaji，直接走 fallback

Timeout 規格（最壞總時間 < 前端 15s axios timeout）：
  - get_quote  : 3s + 4s + 5s = 12s 最壞
  - get_quotes : 5s Shioaji + 9s fallback deadline = 14s 最壞
"""

import asyncio
import logging
import time
from typing import Literal

from services.api_switch import CircuitOpenError, circuit_breaker, shioaji_enabled
from utils.market_hours import is_market_open

logger = logging.getLogger(__name__)

QuoteSource = Literal["shioaji", "twse", "yahoo", "unknown"]
QuoteStatus = Literal["ok", "stale", "timeout", "error", "unavailable"]

_SJ_SINGLE_TIMEOUT  = 3.0   # 單股 Shioaji snapshot timeout（秒）
_SJ_BATCH_TIMEOUT   = 5.0   # 批次 Shioaji snapshot timeout（秒）
_TWSE_TIMEOUT       = 4.0   # TWSE API timeout（有 cache，通常命中後幾乎 0ms）
_YAHOO_TIMEOUT      = 5.0   # Yahoo Finance timeout
_FALLBACK_DEADLINE  = 9.0   # 批次 fallback 並行總 deadline（確保 get_quotes ≤ 14s）


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
    """回傳 True 代表 TSE 上市；False 為 OTC 上櫃。resolve_symbol() 有 3600s cache，不打網路。"""
    from services.yahoo_finance import resolve_symbol
    return not resolve_symbol(stock_id).endswith(".TWO")


# ─── Public API ────────────────────────────────────────────────────────────────

async def get_quote(stock_id: str) -> dict:
    """
    取得單一個股報價。

    Provider 順位：
      Shioaji snapshot（3s）→ TWSE（盤後 TSE only，4s）→ Yahoo（5s）

    永遠回傳 dict，不拋例外。失敗時回 quoteStatus: timeout / error。
    Shioaji exception/timeout 計入 circuit_breaker failure；合約不存在（None）不計。
    """
    loop = asyncio.get_event_loop()

    # ── 1. Shioaji snapshot ────────────────────────────────────────────────────
    if shioaji_enabled():
        try:
            from services.shioaji_manager import shioaji_manager
            if shioaji_manager.initialized:
                async def _sj_call():
                    return await asyncio.wait_for(
                        shioaji_manager.get_stock_snapshot(stock_id),
                        timeout=_SJ_SINGLE_TIMEOUT,
                    )
                snap = await circuit_breaker.call(_sj_call)
                if snap is not None:
                    return _from_snap(stock_id, snap)
                # snap=None → 合約不存在或停牌；不計 CB failure，繼續 fallback
                logger.debug("Shioaji snapshot unavailable: %s", stock_id)
        except CircuitOpenError:
            # CB OPEN — 跳過 Shioaji，直接走 fallback
            logger.debug("Shioaji CB open, skip single: %s", stock_id)
        except (asyncio.TimeoutError, Exception) as e:
            # TimeoutError / API exception → 已計入 CB failure，繼續 fallback
            logger.warning("Shioaji snapshot error %s: %s", stock_id, e)

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
      1. Shioaji 一次批次呼叫（timeout 5s）
         - CB OPEN         → 跳過 Shioaji，走 fallback
         - 整批 timeout    → 所有股票回 quoteStatus:timeout，直接返回（不再等 fallback）
         - API exception   → 繼續走 fallback
      2. 缺口股票並行（總 deadline 9s，asyncio.wait 保留部分結果）：
         - 盤後 TSE：TWSE（4s）→ Yahoo（5s）
         - 盤中或 OTC：直接 Yahoo（5s）

    永遠回傳完整 {stock_id: dict}，單股失敗不影響其他股票。
    最壞總時間：5s（Shioaji）+ 9s（fallback deadline）= 14s < 15s axios timeout。
    """
    if not stock_ids:
        return {}

    loop = asyncio.get_event_loop()
    results: dict[str, dict] = {}
    pending: list[str] = list(stock_ids)

    # ── 1. Shioaji batch snapshot ─────────────────────────────────────────────
    if shioaji_enabled():
        try:
            from services.shioaji_manager import shioaji_manager
            if shioaji_manager.initialized:
                async def _sj_batch():
                    return await asyncio.wait_for(
                        shioaji_manager.get_stock_snapshots(pending),
                        timeout=_SJ_BATCH_TIMEOUT,
                    )
                snaps = await circuit_breaker.call(_sj_batch)
                for sid, snap in snaps.items():
                    if snap is not None:
                        results[sid] = _from_snap(sid, snap)
                pending = [sid for sid in pending if sid not in results]
        except CircuitOpenError:
            # CB OPEN — 跳過 Shioaji，直接走 fallback（不回占位，讓 fallback 補齊）
            logger.debug("Shioaji CB open, skipping batch (%d stocks)", len(pending))
        except asyncio.TimeoutError:
            # 整批 timeout → 全部回占位，直接返回，不再等 fallback
            logger.warning("Shioaji batch snapshot timeout (%d stocks)", len(pending))
            for sid in pending:
                results[sid] = _placeholder(sid, "unknown", "timeout", "本輪報價逾時")
            return results
        except Exception as e:
            # API exception → 繼續走 fallback
            logger.warning("Shioaji batch snapshot error: %s", e)

    if not pending:
        return results

    # ── 2. 缺口：TWSE / Yahoo 並行（總 deadline _FALLBACK_DEADLINE）────────────

    _market_open = is_market_open()   # 呼叫一次，對整批一致

    async def _fallback_one(sid: str) -> tuple[str, dict]:
        """盤後 TSE：TWSE → Yahoo；盤中或 OTC：直接 Yahoo。_fallback_one 永遠 return，不 raise。"""
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

        # Yahoo（盤後 TSE TWSE 失敗、盤中股票、或 OTC）
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

    # asyncio.wait 保留已完成任務的結果；超過 deadline 的未完成任務補占位
    tasks = {asyncio.ensure_future(_fallback_one(sid)): sid for sid in pending}
    done, not_done = await asyncio.wait(tasks.keys(), timeout=_FALLBACK_DEADLINE)

    for task in not_done:
        task.cancel()
        sid = tasks[task]
        results[sid] = _placeholder(sid, "unknown", "timeout", "批次報價逾時")

    for task in done:
        sid_result, q = task.result()   # _fallback_one 永遠 return (sid, dict)，不 raise
        results[sid_result] = q

    return results
