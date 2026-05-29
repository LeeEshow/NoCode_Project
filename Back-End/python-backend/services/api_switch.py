import time
from typing import Callable, Awaitable, TypeVar

from core.settings import get_settings
from utils.market_hours import is_market_open

T = TypeVar("T")

# Circuit Breaker 共用參數
_FAILURE_THRESHOLD = 3
_COOL_DOWN_SECONDS = 60


# ─── 自訂例外（CB OPEN 專用，與 API 本身的 RuntimeError 區分）────────────────

class CircuitOpenError(RuntimeError):
    """Circuit Breaker OPEN 時拋出；與 Shioaji API 自身 RuntimeError 區分診斷用。"""


# ─── Async Circuit Breaker（Shioaji primary）──────────────────────────────────

class CircuitBreaker:
    def __init__(self) -> None:
        self._state: str = "CLOSED"   # CLOSED | OPEN | HALF_OPEN
        self._failure_count: int = 0
        self._opened_at: float | None = None

    async def call(self, fn: Callable[[], Awaitable[T]]) -> T:
        if self._state == "OPEN":
            elapsed = time.time() - (self._opened_at or 0)
            if elapsed >= _COOL_DOWN_SECONDS:
                self._state = "HALF_OPEN"
            else:
                remaining = int(_COOL_DOWN_SECONDS - elapsed)
                raise CircuitOpenError(f"Circuit breaker OPEN，冷卻剩餘 {remaining}s")

        try:
            result = await fn()
            self._reset()
            return result
        except Exception:
            self._record_failure()
            raise

    def _reset(self) -> None:
        self._state = "CLOSED"
        self._failure_count = 0
        self._opened_at = None

    def _record_failure(self) -> None:
        self._failure_count += 1
        if self._failure_count >= _FAILURE_THRESHOLD:
            self._state = "OPEN"
            self._opened_at = time.time()

    def get_status(self) -> dict:
        return {
            "state": self._state,
            "failureCount": self._failure_count,
        }


# ─── Sync Circuit Breaker（Yahoo / TWSE / NDC）───────────────────────────────

class SyncCircuitBreaker:
    """同步版 Circuit Breaker，供 yahoo_finance.py 等同步函式使用。"""

    def __init__(self, failure_threshold: int = _FAILURE_THRESHOLD,
                 cooldown: int = _COOL_DOWN_SECONDS) -> None:
        self._state: str = "CLOSED"
        self._failure_count: int = 0
        self._opened_at: float | None = None
        self._failure_threshold = failure_threshold
        self._cooldown = cooldown

    def call(self, fn: Callable[[], T]) -> T:
        if self._state == "OPEN":
            elapsed = time.time() - (self._opened_at or 0)
            if elapsed >= self._cooldown:
                self._state = "HALF_OPEN"
            else:
                raise RuntimeError("Circuit breaker OPEN")
        try:
            result = fn()
            self._reset()
            return result
        except Exception:
            self._record_failure()
            raise

    def _reset(self) -> None:
        self._state = "CLOSED"
        self._failure_count = 0
        self._opened_at = None

    def _record_failure(self) -> None:
        self._failure_count += 1
        if self._failure_count >= self._failure_threshold:
            self._state = "OPEN"
            self._opened_at = time.time()

    def get_status(self) -> dict:
        return {"state": self._state, "failureCount": self._failure_count}


# ─── CB 單例 ──────────────────────────────────────────────────────────────────

circuit_breaker = CircuitBreaker()   # Shioaji primary（原有）
yahoo_cb  = SyncCircuitBreaker()     # Yahoo Finance
twse_cb   = SyncCircuitBreaker()     # TWSE T86
ndc_cb    = SyncCircuitBreaker()     # NDC 國發會


# ─── api_switch_call ──────────────────────────────────────────────────────────

def shioaji_enabled() -> bool:
    """SJ_API_KEY 有設定才啟用 Shioaji（空白時為 Yahoo-only 模式）"""
    s = get_settings()
    return bool(s.sj_api_key and s.sj_secret_key)


async def api_switch_call(
    primary: Callable[[], Awaitable[T]],
    fallback: Callable[[], Awaitable[T]],
) -> T:
    """
    primary  = Shioaji 報價（盤中優先）
    fallback = Yahoo Finance v8（盤外 / 任何失敗時使用）
    """
    if not shioaji_enabled() or not is_market_open():
        return await fallback()
    try:
        return await circuit_breaker.call(primary)
    except Exception:
        return await fallback()


def get_switch_status() -> dict:
    """
    回傳系統開關、Circuit Breaker 與 Shioaji Manager 狀態。
    `source` 依當前 Shioaji 連線狀態推導：
      - shioaji enabled + connected → "shioaji"
      - 其他 → "yahoo"
    """
    enabled     = shioaji_enabled()
    cb          = circuit_breaker.get_status()
    market_open = is_market_open()

    sj_status: dict = {
        "enabled":          enabled,
        "initialized":      False,
        "connected":        False,
        "reinitializing":   False,
        "subscribedStocks": 0,
        "cachedStocks":     0,
    }
    try:
        from services.shioaji_manager import shioaji_manager
        sm = shioaji_manager.get_status()
        sj_status.update({
            "initialized":      sm["initialized"],
            "connected":        sm["connected"],
            "reinitializing":   sm.get("reinitializing", False),
            "subscribedStocks": sm.get("subscribedStocks", 0),
            "cachedStocks":     sm.get("cachedStocks", 0),
        })
    except Exception:
        pass

    active = enabled and sj_status["connected"]
    source = "shioaji" if active else "yahoo"

    return {
        "source":         source,
        "circuit":        cb,
        "marketOpen":     market_open,
        "shioajiEnabled": enabled,
        "providers": {
            "shioaji": sj_status,
        },
    }
