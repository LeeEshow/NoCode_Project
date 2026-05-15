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
        self._txf_reference: Optional[float] = None  # 台指期前日結算價，供漲跌計算用

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
            price = float(tick.close)
            ref   = self._txf_reference
            change     = round(price - ref, 0) if ref else None
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
                logger.warning("Shioaji disconnected, quote/futures cache cleared")
            elif event_code == 4:
                self._connected = True
                logger.info("Shioaji reconnected, resubscribing...")
                asyncio.create_task(self._resubscribe_all())

    def _get_nearest_txf(self):
        """動態找最近交割的 TXF 期貨合約"""
        try:
            # Contracts.Futures 是群組層，需先取 .TXF 再迭代個別合約
            txf_group = self._api.Contracts.Futures.TXF
            candidates = [
                c for c in txf_group
                if hasattr(c, "code") and not c.code.startswith("TXFR")
            ]
            if not candidates:
                logger.warning("TXF 合約清單為空")
                return None
            def delivery_key(c):
                d = getattr(c, "delivery_date", None)
                return str(d) if d else ""
            candidates.sort(key=delivery_key)
            logger.info(f"TXF near-month: {candidates[0].code}, delivery: {candidates[0].delivery_date}")
            return candidates[0]
        except Exception as e:
            logger.warning(f"_get_nearest_txf error: {e}")
            return None

    def _subscribe_startup_contracts(self) -> None:
        # TXF 近月期貨（動態找最近交割合約，同時儲存前日結算價供漲跌計算）
        try:
            contract = self._get_nearest_txf()
            if contract is None:
                raise ValueError("找不到有效的 TXF 近月合約")
            self._txf_reference = float(contract.reference)
            self._api.quote.subscribe(contract, quote_type=sj.constant.QuoteType.Tick)
            logger.info(f"Subscribed TXF futures: {contract.code}, reference: {self._txf_reference}")
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
        for code, data in self._futures_cache.items():
            if "TXF" in code:
                return data
        return None

    def get_nearest_txf_contract(self):
        """供 router 取得 TXF 近月合約物件（用於 snapshot）"""
        return self._get_nearest_txf()

    def get_taiex_contract(self):
        """取得加權指數合約（TSE 001）"""
        try:
            # 先嘗試直接存取
            c = self._api.Contracts.Indexs.TSE["001"]
            if c is not None:
                logger.info(f"TAIEX contract: {c.code}")
                return c
        except Exception:
            pass
        try:
            # 改為迭代 TSE 群組
            for c in self._api.Contracts.Indexs.TSE:
                if hasattr(c, "code") and c.code == "001":
                    logger.info("TAIEX contract found via iteration")
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
