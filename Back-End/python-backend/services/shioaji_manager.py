import asyncio
import logging
from typing import Optional
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

_TICK_MAX_AGE_SECONDS = 120


def _is_fresh(cached: dict) -> bool:
    try:
        ts = datetime.fromisoformat(cached["timestamp"])
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - ts).total_seconds() < _TICK_MAX_AGE_SECONDS
    except Exception:
        return True


class ShioajiManager:
    def __init__(self) -> None:
        self._api = None
        self._connected = False
        self._initialized = False
        self._api_key = ""
        self._secret_key = ""
        self._quote_cache: dict[str, dict] = {}
        self._futures_cache: dict[str, dict] = {}
        self._subscribed_stocks: set[str] = set()
        self._txf_reference: Optional[float] = None

    @property
    def api(self):
        if self._api is None:
            raise RuntimeError("ShioajiManager not initialized")
        return self._api

    @property
    def connected(self) -> bool:
        return self._connected

    @property
    def initialized(self) -> bool:
        return self._initialized

    async def initialize(self, api_key: str, secret_key: str) -> None:
        self._api_key = api_key
        self._secret_key = secret_key
        await asyncio.to_thread(self._login)
        self._setup_callbacks()
        await asyncio.to_thread(self._subscribe_startup_contracts)
        self._initialized = True
        logger.info("ShioajiManager initialized successfully")

    def _login(self) -> None:
        import shioaji as sj
        self._api = sj.Shioaji()
        self._api.login(api_key=self._api_key, secret_key=self._secret_key)
        self._connected = True
        logger.info("Shioaji login successful")

    def _setup_callbacks(self) -> None:
        import shioaji as sj
        from shioaji import Exchange, TickFOPv1, TickSTKv1

        @self._api.on_tick_stk_v1()
        def on_stk_tick(exchange: Exchange, tick: TickSTKv1) -> None:
            self._quote_cache[tick.code] = {
                "code": tick.code,
                "price": float(tick.close),
                "open": float(tick.open),
                "high": float(tick.high),
                "low": float(tick.low),
                "volume": tick.total_volume,
                "change": float(tick.price_chg),
                "change_percent": float(tick.pct_chg),
                "timestamp": tick.datetime.isoformat(),
                "source": "tick",
            }

        @self._api.on_tick_fop_v1()
        def on_fop_tick(exchange: Exchange, tick: TickFOPv1) -> None:
            price = float(tick.close)
            ref = self._txf_reference
            change = round(price - ref, 0) if ref else None
            change_pct = round((price - ref) / ref * 100, 2) if ref else None
            self._futures_cache[tick.code] = {
                "code": tick.code,
                "price": price,
                "open": float(tick.open),
                "high": float(tick.high),
                "low": float(tick.low),
                "volume": tick.total_volume,
                "change": change,
                "change_percent": change_pct,
                "timestamp": tick.datetime.isoformat(),
                "source": "tick",
            }

        @self._api.quote.on_event
        def on_event(resp_code: int, event_code: int, info: str, event: str) -> None:
            logger.info(f"Shioaji event [{event_code}]: {info}")
            if event_code == 2:
                self._connected = False
                self._quote_cache.clear()
                self._futures_cache.clear()
                logger.warning("Shioaji disconnected, cache cleared")
            elif event_code == 4:
                self._connected = True
                logger.info("Shioaji reconnected, resubscribing...")
                asyncio.create_task(self._resubscribe_all())

    def _get_nearest_txf(self):
        try:
            txf_group = self._api.Contracts.Futures.TXF
            candidates = [
                c for c in txf_group
                if hasattr(c, "code") and not str(c.code).startswith("TXFR")
            ]
            if not candidates:
                return None
            candidates.sort(key=lambda c: str(getattr(c, "delivery_date", "")))
            return candidates[0]
        except Exception as e:
            logger.warning(f"_get_nearest_txf error: {e}")
            return None

    def _subscribe_startup_contracts(self) -> None:
        import shioaji as sj
        # TXF 近月期貨
        try:
            contract = self._get_nearest_txf()
            if contract is None:
                raise ValueError("找不到有效的 TXF 近月合約")
            self._txf_reference = float(contract.reference)
            self._api.quote.subscribe(contract, quote_type=sj.constant.QuoteType.Tick)
            logger.info(f"Subscribed TXF: {contract.code}, ref: {self._txf_reference}")
        except Exception as e:
            logger.warning(f"TXF subscribe failed: {e}")

        # 加權指數
        try:
            contract = self._api.Contracts.Indexs["TSE001"]
            self._api.quote.subscribe(contract, quote_type=sj.constant.QuoteType.Tick)
            logger.info("Subscribed TAIEX TSE001")
        except Exception as e:
            logger.warning(f"TAIEX subscribe failed: {e}")

    async def _resubscribe_all(self) -> None:
        await asyncio.to_thread(self._subscribe_startup_contracts)
        for stock_id in list(self._subscribed_stocks):
            try:
                await self.subscribe_stock(stock_id)
            except Exception as e:
                logger.warning(f"Resubscribe failed {stock_id}: {e}")

    async def subscribe_stock(self, stock_id: str) -> None:
        if stock_id in self._subscribed_stocks:
            return
        import shioaji as sj

        def _sub() -> None:
            contract = self._api.Contracts.Stocks[stock_id]
            self._api.quote.subscribe(contract, quote_type=sj.constant.QuoteType.Tick)

        await asyncio.to_thread(_sub)
        self._subscribed_stocks.add(stock_id)

    def get_cached_quote(self, stock_id: str) -> Optional[dict]:
        return self._quote_cache.get(stock_id)

    def get_fresh_quote(self, stock_id: str) -> Optional[dict]:
        cached = self._quote_cache.get(stock_id)
        return cached if (cached and _is_fresh(cached)) else None

    def get_cached_taiex(self) -> Optional[dict]:
        cached = self._quote_cache.get("001")
        return cached if (cached and _is_fresh(cached)) else None

    def get_cached_futures(self) -> Optional[dict]:
        for code, data in self._futures_cache.items():
            if "TXF" in code and _is_fresh(data):
                return data
        return None

    def get_nearest_txf_contract(self):
        return self._get_nearest_txf()

    def get_taiex_contract(self):
        try:
            c = self._api.Contracts.Indexs.TSE["001"]
            if c is not None:
                return c
        except Exception:
            pass
        try:
            for c in self._api.Contracts.Indexs.TSE:
                if hasattr(c, "code") and c.code == "001":
                    return c
        except Exception as e:
            logger.warning(f"get_taiex_contract error: {e}")
        return None

    async def get_snapshot(self, contracts: list) -> list:
        def _snap() -> list:
            return self._api.snapshots(contracts)
        return await asyncio.to_thread(_snap)

    def get_status(self) -> dict:
        return {
            "connected": self._connected,
            "initialized": self._initialized,
            "subscribedStocks": len(self._subscribed_stocks),
            "cachedQuotes": len(self._quote_cache),
            "cachedFutures": len(self._futures_cache),
        }

    async def shutdown(self) -> None:
        if self._api and self._connected:
            await asyncio.to_thread(self._api.logout)
            self._connected = False
            logger.info("Shioaji logged out")


shioaji_manager = ShioajiManager()
