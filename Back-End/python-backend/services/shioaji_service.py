from __future__ import annotations

import asyncio
import logging
import os
from datetime import date, datetime, timedelta, timezone
from typing import Optional

logger = logging.getLogger(__name__)

# ── 啟用判斷 ───────────────────────────────────────────────────────────────────

def is_shioaji_enabled() -> bool:
    return bool(os.getenv("SJ_API_KEY") and os.getenv("SJ_SECRET_KEY"))


# ── ShioajiManager（移植自 finance-shioaji，簡化版） ──────────────────────────

class ShioajiManager:
    def __init__(self) -> None:
        self._api = None
        self._connected = False
        self._initialized = False
        self._quote_cache: dict[str, dict] = {}
        self._futures_cache: dict[str, dict] = {}
        self._subscribed_stocks: set[str] = set()
        self._txf_reference: Optional[float] = None

    @property
    def initialized(self) -> bool:
        return self._initialized

    @property
    def connected(self) -> bool:
        return self._connected

    async def initialize(self) -> None:
        import shioaji as sj
        from shioaji import Exchange, TickFOPv1, TickSTKv1

        api_key    = os.environ["SJ_API_KEY"]
        secret_key = os.environ["SJ_SECRET_KEY"]

        def _login():
            self._api = sj.Shioaji()
            self._api.login(api_key=api_key, secret_key=secret_key)
            self._connected = True

        await asyncio.to_thread(_login)
        self._setup_callbacks()
        await asyncio.to_thread(self._subscribe_startup)
        self._initialized = True
        logger.info("ShioajiManager initialized")

    def _setup_callbacks(self) -> None:
        import shioaji as sj
        from shioaji import Exchange, TickFOPv1, TickSTKv1

        @self._api.on_tick_stk_v1()
        def on_stk(exchange: Exchange, tick: TickSTKv1) -> None:
            self._quote_cache[tick.code] = {
                "code": tick.code, "price": float(tick.close),
                "change": float(tick.price_chg), "changePercent": float(tick.pct_chg),
                "high": float(tick.high), "low": float(tick.low),
                "volume": tick.total_volume,
                "timestamp": tick.datetime.isoformat(), "source": "tick",
            }

        @self._api.on_tick_fop_v1()
        def on_fop(exchange: Exchange, tick: TickFOPv1) -> None:
            price = float(tick.close)
            ref = self._txf_reference
            self._futures_cache[tick.code] = {
                "price": price,
                "change":        round(price - ref, 0) if ref else None,
                "changePercent": round((price - ref) / ref * 100, 2) if ref else None,
                "timestamp": tick.datetime.isoformat(), "source": "tick",
            }

        @self._api.quote.on_event
        def on_event(resp_code: int, event_code: int, info: str, event: str) -> None:
            if event_code == 2:
                self._connected = False
                self._quote_cache.clear()
                self._futures_cache.clear()
                logger.warning("Shioaji disconnected, cache cleared")
            elif event_code == 4:
                self._connected = True
                asyncio.create_task(self._resubscribe())

    def _subscribe_startup(self) -> None:
        import shioaji as sj
        try:
            txf_group = self._api.Contracts.Futures.TXF
            candidates = sorted(
                [c for c in txf_group if hasattr(c, "code") and not str(getattr(c, "code", "")).startswith("TXFR")],
                key=lambda c: str(getattr(c, "delivery_date", ""))
            )
            if candidates:
                self._txf_reference = float(candidates[0].reference)
                self._api.quote.subscribe(candidates[0], quote_type=sj.constant.QuoteType.Tick)
        except Exception as e:
            logger.warning("TXF subscribe failed: %s", e)

    async def _resubscribe(self) -> None:
        await asyncio.to_thread(self._subscribe_startup)
        for stock_id in list(self._subscribed_stocks):
            try:
                await self.subscribe_stock(stock_id)
            except Exception:
                pass

    async def subscribe_stock(self, stock_id: str) -> None:
        if stock_id in self._subscribed_stocks:
            return
        import shioaji as sj
        def _sub():
            contract = self._api.Contracts.Stocks[stock_id]
            self._api.quote.subscribe(contract, quote_type=sj.constant.QuoteType.Tick)
        await asyncio.to_thread(_sub)
        self._subscribed_stocks.add(stock_id)

    # ── 報價 ───────────────────────────────────────────────────────────────────

    async def get_quote(self, stock_id: str) -> dict:
        _TICK_MAX_AGE = 120
        try:
            await self.subscribe_stock(stock_id)
        except Exception:
            pass
        cached = self._quote_cache.get(stock_id)
        if cached:
            try:
                ts = datetime.fromisoformat(cached["timestamp"])
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)
                if (datetime.now(timezone.utc) - ts).total_seconds() < _TICK_MAX_AGE:
                    return {**cached, "stockId": stock_id}
            except Exception:
                pass

        def _snap():
            contract = self._api.Contracts.Stocks[stock_id]
            snaps = self._api.snapshots([contract])
            if not snaps:
                raise RuntimeError("no snapshot")
            s = snaps[0]
            return {
                "stockId": stock_id, "name": stock_id,
                "price": float(s.close), "change": float(s.change_price),
                "changePercent": float(s.change_rate),
                "high": float(s.high), "low": float(s.low),
                "volume": s.total_volume,
                "marketStatus": "OPEN",
                "updatedAt": int(s.ts / 1e9),
            }

        return await asyncio.to_thread(_snap)

    # ── K 線 ───────────────────────────────────────────────────────────────────

    async def get_history(self, stock_id: str, days: int = 90) -> list:
        def _fetch():
            contract = self._api.Contracts.Stocks[stock_id]
            end   = date.today()
            start = end - timedelta(days=days)
            kbars = self._api.kbars(contract=contract, start=str(start), end=str(end))
            # 聚合成日線
            daily: dict[str, dict] = {}
            for ts, o, h, l, c, v in zip(kbars.ts, kbars.Open, kbars.High, kbars.Low, kbars.Close, kbars.Volume):
                day = datetime.fromtimestamp(ts / 1e9).strftime("%Y-%m-%d")
                if day not in daily:
                    daily[day] = {"timestamp": int(ts / 1e9), "open": float(o), "high": float(h), "low": float(l), "close": float(c), "volume": int(v)}
                else:
                    daily[day]["high"] = max(daily[day]["high"], float(h))
                    daily[day]["low"]  = min(daily[day]["low"],  float(l))
                    daily[day]["close"] = float(c)
                    daily[day]["volume"] += int(v)
            return sorted(daily.values(), key=lambda x: x["timestamp"])

        return await asyncio.to_thread(_fetch)

    # ── 全股清單 ───────────────────────────────────────────────────────────────

    async def get_all_stocks(self) -> list:
        def _fetch():
            result = []
            for c in self._api.Contracts.Stocks.TSE:
                if not hasattr(c, "code") or not hasattr(c, "name"):
                    continue
                code = c.code
                if re.match(r"^\d{4}$", code) or code.startswith("00"):
                    result.append({"code": code, "name": c.name, "market": "TSE"})
            for c in self._api.Contracts.Stocks.OTC:
                if not hasattr(c, "code") or not hasattr(c, "name"):
                    continue
                code = c.code
                if re.match(r"^\d{4}$", code) or code.startswith("00"):
                    result.append({"code": code, "name": c.name, "market": "OTC"})
            return result

        import re
        return await asyncio.to_thread(_fetch)

    # ── 台股大盤 + 台指期（供 market router 使用） ────────────────────────────

    async def get_tw_indices(self) -> tuple[dict, dict]:
        def _fetch():
            twii_fallback  = {"id": "twii",    "name": "台股大盤", "price": None, "change": None, "changePercent": None}
            fut_fallback   = {"id": "futures", "name": "台指期",   "price": None, "change": None, "changePercent": None}
            twii  = self._quote_cache.get("001")
            if twii:
                twii_card = {"id": "twii", "name": "台股大盤", "price": twii.get("price"), "change": twii.get("change"), "changePercent": twii.get("changePercent")}
            else:
                twii_card = twii_fallback
            fut = next((v for k, v in self._futures_cache.items() if "TXF" in k), None)
            if fut:
                fut_card = {"id": "futures", "name": "台指期", "price": fut.get("price"), "change": fut.get("change"), "changePercent": fut.get("changePercent")}
            else:
                fut_card = fut_fallback
            return twii_card, fut_card

        return await asyncio.to_thread(_fetch)

    async def shutdown(self) -> None:
        if self._api and self._connected:
            await asyncio.to_thread(self._api.logout)
            self._connected = False
            logger.info("Shioaji logged out")


# ── 單例 ───────────────────────────────────────────────────────────────────────

manager = ShioajiManager()
