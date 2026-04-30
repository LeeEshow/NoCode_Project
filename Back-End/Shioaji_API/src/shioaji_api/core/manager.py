import asyncio
import logging
from typing import Optional

import shioaji as sj
from shioaji import Exchange, TickFOPv1, TickSTKv1

logger = logging.getLogger(__name__)


class ShioajiManager:
    def __init__(self) -> None:
        self._api: Optional[sj.Shioaji] = None
        self._connected = False
        self._initialized = False
        self._api_key = ""
        self._secret_key = ""
        self._quote_cache: dict[str, dict] = {}
        self._futures_cache: dict[str, dict] = {}
        self._subscribed_stocks: set[str] = set()

    @property
    def api(self) -> sj.Shioaji:
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
        self._api = sj.Shioaji()
        self._api.login(api_key=self._api_key, secret_key=self._secret_key)
        self._connected = True
        logger.info("Shioaji login successful")

    def _setup_callbacks(self) -> None:
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
            self._futures_cache[tick.code] = {
                "code": tick.code,
                "price": float(tick.close),
                "open": float(tick.open),
                "high": float(tick.high),
                "low": float(tick.low),
                "volume": tick.total_volume,
                "timestamp": tick.datetime.isoformat(),
                "source": "tick",
            }

        @self._api.quote.on_event
        def on_event(resp_code: int, event_code: int, info: str, event: str) -> None:
            logger.info(f"Shioaji event [{event_code}]: {info}")
            if event_code == 2:
                self._connected = False
                logger.warning("Shioaji disconnected")
            elif event_code == 4:
                self._connected = True
                logger.info("Shioaji reconnected, resubscribing...")
                asyncio.create_task(self._resubscribe_all())

    def _subscribe_startup_contracts(self) -> None:
        # TXF 近月期貨（盤中最即時的台指期資料）
        try:
            contract = self._api.Contracts.Futures["TXFC0"]
            self._api.quote.subscribe(contract, quote_type=sj.constant.QuoteType.Tick)
            logger.info(f"Subscribed TXF futures: {contract.code}")
        except Exception as e:
            logger.warning(f"TXF futures subscribe failed: {e}")

        # 加權指數（部分環境支援，失敗則以 snapshot 為主）
        try:
            contract = self._api.Contracts.Indexs["TSE001"]
            self._api.quote.subscribe(contract, quote_type=sj.constant.QuoteType.Tick)
            logger.info("Subscribed TAIEX index TSE001")
        except Exception as e:
            logger.warning(f"TAIEX index subscribe failed (will use snapshot): {e}")

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

        def _sub() -> None:
            contract = self._api.Contracts.Stocks[stock_id]
            self._api.quote.subscribe(contract, quote_type=sj.constant.QuoteType.Tick)

        await asyncio.to_thread(_sub)
        self._subscribed_stocks.add(stock_id)

    def get_cached_quote(self, stock_id: str) -> Optional[dict]:
        return self._quote_cache.get(stock_id)

    def get_cached_taiex(self) -> Optional[dict]:
        # TSE001 tick 進入 STK callback
        return self._quote_cache.get("001")

    def get_cached_futures(self) -> Optional[dict]:
        # 找最新的 TXF 合約快取
        for code, data in self._futures_cache.items():
            if "TXF" in code:
                return data
        return None

    async def get_snapshot(self, contracts: list) -> list:
        def _snap() -> list:
            return self._api.snapshots(contracts)

        return await asyncio.to_thread(_snap)

    def get_status(self) -> dict:
        return {
            "connected": self._connected,
            "initialized": self._initialized,
            "subscribed_stocks": len(self._subscribed_stocks),
            "cached_quotes": len(self._quote_cache),
            "cached_futures": len(self._futures_cache),
        }

    async def shutdown(self) -> None:
        if self._api and self._connected:
            await asyncio.to_thread(self._api.logout)
            self._connected = False
            logger.info("Shioaji logged out")


manager = ShioajiManager()
