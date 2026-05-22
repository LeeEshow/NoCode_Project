import os
import time
from typing import Callable, Awaitable, TypeVar

from utils.market_hours import is_market_open

T = TypeVar("T")

# Circuit Breaker 參數（與 Node.js 一致）
_FAILURE_THRESHOLD = 3
_COOL_DOWN_SECONDS = 60


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
                raise RuntimeError(f"Circuit breaker OPEN，冷卻剩餘 {remaining}s")

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


circuit_breaker = CircuitBreaker()


def shioaji_enabled() -> bool:
    """SJ_API_KEY 有設定才啟用 Shioaji（空白時為 Yahoo-only 模式）"""
    return bool(os.getenv("SJ_API_KEY"))


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
    enabled = shioaji_enabled()
    cb = circuit_breaker.get_status()
    market_open = is_market_open()
    source = "shioaji" if (enabled and market_open and cb["state"] != "OPEN") else "yahoo"
    return {
        "source": source,
        "circuit": cb,
        "marketOpen": market_open,
        "shioajiEnabled": enabled,
    }
