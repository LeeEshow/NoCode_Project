"""
tests/test_quote_service.py

用 monkeypatch 直接測 quote_service 的 provider 邏輯。
不打真實 Yahoo / TWSE / Shioaji；所有外部依賴全部 mock。

覆蓋場景：
  - SJ_API_KEY 未設定 → 走 TWSE/Yahoo fallback
  - Shioaji ok → source=shioaji，不打 TWSE/Yahoo
  - Shioaji unavailable（None）→ fallback
  - Shioaji exception → CB failure++，繼續 fallback
  - CB OPEN → skip Shioaji，走 fallback
  - 批次 Shioaji timeout → all placeholder，不等 fallback
  - 盤中 TSE unavailable → 跳過 TWSE，直接 Yahoo
  - 盤後 TSE unavailable → 走 TWSE
  - 批次 fallback deadline 超時 → 未完成股票回占位
  - quoteSource / quoteStatus 欄位正確
"""

import asyncio
import time
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

import services.quote_service as qs
from services.api_switch import CircuitOpenError, circuit_breaker


# ─── helpers ──────────────────────────────────────────────────────────────────

def _snap_dict(price: float = 980.0) -> dict:
    return {
        "price": price, "change": 5.0, "changePercent": 0.51,
        "high": 985.0, "low": 975.0, "volume": 10000,
        "updatedAt": int(time.time()),
    }

def _twse_dict(price: float = 960.0) -> dict:
    return {
        "price": price, "change": -5.0, "changePercent": -0.52,
        "high": 965.0, "low": 955.0, "volume": 8000,
    }

def _yahoo_dict(stock_id: str = "2330", price: float = 950.0) -> dict:
    return {
        "stockId": stock_id, "name": stock_id,
        "price": price, "change": 3.0, "changePercent": 0.32,
        "high": 955.0, "low": 945.0, "volume": 7000,
        "marketStatus": "CLOSED", "updatedAt": int(time.time()),
    }

def _reset_cb():
    """在測試間重置 circuit_breaker 狀態。"""
    circuit_breaker._state = "CLOSED"
    circuit_breaker._failure_count = 0
    circuit_breaker._opened_at = None


# ─── get_quote 單股 ────────────────────────────────────────────────────────────

class TestGetQuote:

    @pytest.fixture(autouse=True)
    def reset_cb(self):
        _reset_cb()
        yield
        _reset_cb()

    async def test_sj_disabled_goes_to_yahoo(self, monkeypatch):
        """SJ_API_KEY 未設定 + 盤中 → 不呼叫 Shioaji，直接走 Yahoo（TWSE 盤中跳過）。"""
        monkeypatch.setattr(qs, "shioaji_enabled", lambda: False)
        monkeypatch.setattr(qs, "is_market_open", lambda: True)   # 盤中 → TWSE 跳過

        yahoo_mock = MagicMock(return_value=_yahoo_dict())
        with patch("services.yahoo_finance.get_yahoo_quote", yahoo_mock):
            result = await qs.get_quote("2330")

        assert result["quoteSource"] == "yahoo"
        assert result["quoteStatus"] == "ok"
        assert result["price"] == 950.0

    async def test_sj_ok_returns_shioaji_source(self, monkeypatch):
        """Shioaji ok → source=shioaji，不打 TWSE/Yahoo。"""
        monkeypatch.setattr(qs, "shioaji_enabled", lambda: True)

        manager_mock = MagicMock()
        manager_mock.initialized = True
        manager_mock.get_stock_snapshot = AsyncMock(return_value=_snap_dict())

        with patch("services.shioaji_manager.shioaji_manager", manager_mock):
            twse_mock = MagicMock(side_effect=AssertionError("不應呼叫 TWSE"))
            yahoo_mock = MagicMock(side_effect=AssertionError("不應呼叫 Yahoo"))
            with patch("services.twse_finance.get_twse_closing_price", twse_mock):
                with patch("services.yahoo_finance.get_yahoo_quote", yahoo_mock):
                    result = await qs.get_quote("2330")

        assert result["quoteSource"] == "shioaji"
        assert result["quoteStatus"] == "ok"
        assert result["price"] == 980.0

    async def test_sj_unavailable_falls_back_to_yahoo_during_market(self, monkeypatch):
        """盤中 Shioaji unavailable → 跳過 TWSE，直接走 Yahoo。"""
        monkeypatch.setattr(qs, "shioaji_enabled", lambda: True)
        monkeypatch.setattr(qs, "is_market_open", lambda: True)

        manager_mock = MagicMock()
        manager_mock.initialized = True
        manager_mock.get_stock_snapshot = AsyncMock(return_value=None)

        with patch("services.shioaji_manager.shioaji_manager", manager_mock):
            twse_mock = MagicMock(side_effect=AssertionError("盤中不應呼叫 TWSE"))
            yahoo_mock = MagicMock(return_value=_yahoo_dict())
            with patch("services.twse_finance.get_twse_closing_price", twse_mock):
                with patch("services.yahoo_finance.get_yahoo_quote", yahoo_mock):
                    result = await qs.get_quote("2330")

        assert result["quoteSource"] == "yahoo"

    async def test_sj_unavailable_falls_back_to_twse_after_hours(self, monkeypatch):
        """盤後 TSE Shioaji unavailable → 走 TWSE。"""
        monkeypatch.setattr(qs, "shioaji_enabled", lambda: True)
        monkeypatch.setattr(qs, "is_market_open", lambda: False)
        monkeypatch.setattr(qs, "_is_tse", lambda sid: True)

        manager_mock = MagicMock()
        manager_mock.initialized = True
        manager_mock.get_stock_snapshot = AsyncMock(return_value=None)

        with patch("services.shioaji_manager.shioaji_manager", manager_mock):
            twse_mock = MagicMock(return_value=_twse_dict())
            with patch("services.twse_finance.get_twse_closing_price", twse_mock):
                result = await qs.get_quote("2330")

        assert result["quoteSource"] == "twse"
        assert result["quoteStatus"] == "ok"
        assert result["price"] == 960.0

    async def test_sj_exception_records_cb_failure(self, monkeypatch):
        """Shioaji API exception → CB failure 計數增加，繼續走 Yahoo fallback。"""
        monkeypatch.setattr(qs, "shioaji_enabled", lambda: True)
        monkeypatch.setattr(qs, "is_market_open", lambda: True)   # 盤中 → TWSE 跳過

        manager_mock = MagicMock()
        manager_mock.initialized = True
        manager_mock.get_stock_snapshot = AsyncMock(side_effect=RuntimeError("API連線中斷"))

        cb_before = circuit_breaker._failure_count

        with patch("services.shioaji_manager.shioaji_manager", manager_mock):
            yahoo_mock = MagicMock(return_value=_yahoo_dict())
            with patch("services.yahoo_finance.get_yahoo_quote", yahoo_mock):
                result = await qs.get_quote("2330")

        assert circuit_breaker._failure_count > cb_before
        assert result["quoteSource"] == "yahoo"

    async def test_cb_open_skips_shioaji(self, monkeypatch):
        """CB OPEN → skip Shioaji，直接走 fallback。"""
        monkeypatch.setattr(qs, "shioaji_enabled", lambda: True)
        monkeypatch.setattr(qs, "is_market_open", lambda: True)   # 盤中 → TWSE 跳過

        # 強制 CB OPEN
        circuit_breaker._state = "OPEN"
        circuit_breaker._opened_at = time.time()

        manager_mock = MagicMock()
        manager_mock.initialized = True
        manager_mock.get_stock_snapshot = AsyncMock(
            side_effect=AssertionError("CB OPEN 時不應呼叫 Shioaji")
        )

        with patch("services.shioaji_manager.shioaji_manager", manager_mock):
            yahoo_mock = MagicMock(return_value=_yahoo_dict())
            with patch("services.yahoo_finance.get_yahoo_quote", yahoo_mock):
                result = await qs.get_quote("2330")

        assert result["quoteSource"] == "yahoo"

    async def test_all_providers_fail_returns_error_placeholder(self, monkeypatch):
        """全部 provider 失敗 → 回 quoteStatus: error，不拋例外。"""
        monkeypatch.setattr(qs, "shioaji_enabled", lambda: False)
        monkeypatch.setattr(qs, "is_market_open", lambda: True)   # 盤中 → TWSE 跳過，只需 Yahoo 失敗

        with patch("services.yahoo_finance.get_yahoo_quote", side_effect=Exception("Yahoo down")):
            result = await qs.get_quote("2330")

        assert result["quoteStatus"] == "error"
        assert result["quoteSource"] == "unknown"
        assert result["price"] == 0


# ─── get_quotes 批次 ───────────────────────────────────────────────────────────

class TestGetQuotes:

    @pytest.fixture(autouse=True)
    def reset_cb(self):
        _reset_cb()
        yield
        _reset_cb()

    async def test_empty_returns_empty(self):
        result = await qs.get_quotes([])
        assert result == {}

    async def test_batch_sj_ok_fills_all(self, monkeypatch):
        """Shioaji 批次成功 → 全部 source=shioaji，不打 fallback。"""
        monkeypatch.setattr(qs, "shioaji_enabled", lambda: True)

        snaps = {"2330": _snap_dict(980.0), "2317": _snap_dict(60.0)}

        manager_mock = MagicMock()
        manager_mock.initialized = True
        manager_mock.get_stock_snapshots = AsyncMock(return_value=snaps)

        with patch("services.shioaji_manager.shioaji_manager", manager_mock):
            twse_mock = MagicMock(side_effect=AssertionError("不應呼叫 TWSE"))
            yahoo_mock = MagicMock(side_effect=AssertionError("不應呼叫 Yahoo"))
            with patch("services.twse_finance.get_twse_closing_price", twse_mock):
                with patch("services.yahoo_finance.get_yahoo_quote", yahoo_mock):
                    result = await qs.get_quotes(["2330", "2317"])

        assert result["2330"]["quoteSource"] == "shioaji"
        assert result["2317"]["quoteSource"] == "shioaji"

    async def test_batch_sj_timeout_returns_all_placeholder(self, monkeypatch):
        """Shioaji 整批 timeout → 所有股票回占位，不等 fallback。"""
        monkeypatch.setattr(qs, "shioaji_enabled", lambda: True)

        async def _slow(*_):
            await asyncio.sleep(100)

        manager_mock = MagicMock()
        manager_mock.initialized = True
        manager_mock.get_stock_snapshots = _slow

        original_timeout = qs._SJ_BATCH_TIMEOUT
        qs._SJ_BATCH_TIMEOUT = 0.05   # 縮短以加快測試

        try:
            with patch("services.shioaji_manager.shioaji_manager", manager_mock):
                yahoo_mock = MagicMock(side_effect=AssertionError("timeout 後不應呼叫 Yahoo"))
                with patch("services.yahoo_finance.get_yahoo_quote", yahoo_mock):
                    result = await qs.get_quotes(["2330", "2317"])
        finally:
            qs._SJ_BATCH_TIMEOUT = original_timeout

        assert result["2330"]["quoteStatus"] == "timeout"
        assert result["2330"]["quoteSource"] == "unknown"
        assert result["2317"]["quoteStatus"] == "timeout"

    async def test_batch_sj_partial_fills_fallback_for_gaps(self, monkeypatch):
        """Shioaji 部分成功（2330 ok，2317 None）→ 2330=shioaji，2317 走 Yahoo fallback。"""
        monkeypatch.setattr(qs, "shioaji_enabled", lambda: True)
        monkeypatch.setattr(qs, "is_market_open", lambda: True)  # 盤中，跳過 TWSE

        snaps = {"2330": _snap_dict(980.0), "2317": None}

        manager_mock = MagicMock()
        manager_mock.initialized = True
        manager_mock.get_stock_snapshots = AsyncMock(return_value=snaps)

        with patch("services.shioaji_manager.shioaji_manager", manager_mock):
            yahoo_mock = MagicMock(return_value=_yahoo_dict("2317", 60.0))
            with patch("services.yahoo_finance.get_yahoo_quote", yahoo_mock):
                result = await qs.get_quotes(["2330", "2317"])

        assert result["2330"]["quoteSource"] == "shioaji"
        assert result["2317"]["quoteSource"] == "yahoo"

    async def test_batch_market_open_skips_twse_fallback(self, monkeypatch):
        """盤中 Shioaji all-None → 缺口股票跳過 TWSE，直接走 Yahoo。"""
        monkeypatch.setattr(qs, "shioaji_enabled", lambda: True)
        monkeypatch.setattr(qs, "is_market_open", lambda: True)

        manager_mock = MagicMock()
        manager_mock.initialized = True
        manager_mock.get_stock_snapshots = AsyncMock(return_value={"2330": None})

        with patch("services.shioaji_manager.shioaji_manager", manager_mock):
            twse_mock = MagicMock(side_effect=AssertionError("盤中不應呼叫 TWSE"))
            yahoo_mock = MagicMock(return_value=_yahoo_dict("2330"))
            with patch("services.twse_finance.get_twse_closing_price", twse_mock):
                with patch("services.yahoo_finance.get_yahoo_quote", yahoo_mock):
                    result = await qs.get_quotes(["2330"])

        assert result["2330"]["quoteSource"] == "yahoo"

    async def test_batch_after_hours_tse_uses_twse(self, monkeypatch):
        """盤後 TSE Shioaji None → TWSE 補齊。"""
        monkeypatch.setattr(qs, "shioaji_enabled", lambda: True)
        monkeypatch.setattr(qs, "is_market_open", lambda: False)
        monkeypatch.setattr(qs, "_is_tse", lambda sid: True)

        manager_mock = MagicMock()
        manager_mock.initialized = True
        manager_mock.get_stock_snapshots = AsyncMock(return_value={"2330": None})

        with patch("services.shioaji_manager.shioaji_manager", manager_mock):
            twse_mock = MagicMock(return_value=_twse_dict(960.0))
            with patch("services.twse_finance.get_twse_closing_price", twse_mock):
                result = await qs.get_quotes(["2330"])

        assert result["2330"]["quoteSource"] == "twse"
        assert result["2330"]["price"] == 960.0

    async def test_batch_cb_open_skips_shioaji(self, monkeypatch):
        """CB OPEN → 整批跳過 Shioaji，走 fallback。"""
        monkeypatch.setattr(qs, "shioaji_enabled", lambda: True)
        monkeypatch.setattr(qs, "is_market_open", lambda: True)

        circuit_breaker._state = "OPEN"
        circuit_breaker._opened_at = time.time()

        manager_mock = MagicMock()
        manager_mock.initialized = True
        manager_mock.get_stock_snapshots = AsyncMock(
            side_effect=AssertionError("CB OPEN 時不應呼叫 Shioaji batch")
        )

        with patch("services.shioaji_manager.shioaji_manager", manager_mock):
            yahoo_mock = MagicMock(return_value=_yahoo_dict("2330"))
            with patch("services.yahoo_finance.get_yahoo_quote", yahoo_mock):
                result = await qs.get_quotes(["2330"])

        assert result["2330"]["quoteSource"] == "yahoo"

    async def test_sj_disabled_batch_goes_to_fallback(self, monkeypatch):
        """SJ_API_KEY 未設定 → 批次直接走 fallback。"""
        monkeypatch.setattr(qs, "shioaji_enabled", lambda: False)
        monkeypatch.setattr(qs, "is_market_open", lambda: True)

        yahoo_mock = MagicMock(return_value=_yahoo_dict("2330"))
        with patch("services.yahoo_finance.get_yahoo_quote", yahoo_mock):
            result = await qs.get_quotes(["2330"])

        assert result["2330"]["quoteSource"] == "yahoo"
        assert result["2330"]["quoteStatus"] == "ok"
