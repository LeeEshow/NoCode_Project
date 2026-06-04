import asyncio
import logging
import time
from typing import Optional
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

_TICK_MAX_AGE_SECONDS = 120  # tick 有效期（秒）


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
        self._reinitializing = False
        self._api_key = ""
        self._secret_key = ""
        self._loop = None  # 由 initialize() 設定，供 on_event callback 使用
        self._futures_cache: dict[str, dict] = {}
        self._stock_cache: dict[str, dict] = {}
        self._subscribed_stocks: set[str] = set()
        self._subscribing_stocks: set[str] = set()   # 訂閱進行中（防重複 ensure_future）
        self._txf_reference: Optional[float] = None
        # Snapshot API 限流（僅供啟動暖身 + /system/shioaji-test 診斷，不在報價熱路徑上）
        self._snap_single_sem = asyncio.Semaphore(3)

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
        self._loop = asyncio.get_running_loop()
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
        from shioaji import Exchange, TickFOPv1, TickSTKv1

        @self._api.on_tick_stk_v1()
        def on_stk_tick(exchange: Exchange, tick: TickSTKv1) -> None:
            """個股 tick push → 寫入 memory cache（不佔 thread pool）"""
            self._stock_cache[tick.code] = {
                "price":         float(tick.close),
                "change":        float(tick.price_chg),
                "changePercent": float(tick.pct_chg) / 100,
                "high":          float(tick.high),
                "low":           float(tick.low),
                "volume":        int(tick.total_volume),
                "updatedAt":     int(tick.datetime.timestamp()),
                "timestamp":     tick.datetime.isoformat(),
            }

        @self._api.on_tick_fop_v1()
        def on_fop_tick(exchange: Exchange, tick: TickFOPv1) -> None:
            """TXF 期貨 tick push → 寫入 memory cache"""
            price = float(tick.close)
            ref = self._txf_reference
            change = round(price - ref, 0) if ref else None
            change_pct = round((price - ref) / ref * 100, 2) if ref else None
            self._futures_cache[tick.code] = {
                "code":           tick.code,
                "price":          price,
                "open":           float(tick.open),
                "high":           float(tick.high),
                "low":            float(tick.low),
                "volume":         tick.total_volume,
                "change":         change,
                "change_percent": change_pct,
                "timestamp":      tick.datetime.isoformat(),
                "source":         "tick",
            }

        @self._api.quote.on_event
        def on_event(resp_code: int, event_code: int, info: str, event: str) -> None:
            logger.info(f"Shioaji event [{event_code}]: {info}")
            if event_code == 2:
                self._connected = False
                self._futures_cache.clear()
                self._stock_cache.clear()
                logger.warning("Shioaji disconnected, cache cleared")
            elif event_code == 4:
                self._connected = True
                logger.info("Shioaji reconnected, resubscribing...")
                if self._loop and not self._loop.is_closed():
                    asyncio.run_coroutine_threadsafe(self._resubscribe_startup(), self._loop)

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
        try:
            contract = self._get_nearest_txf()
            if contract is None:
                raise ValueError("找不到有效的 TXF 近月合約")
            self._txf_reference = float(contract.reference)
            self._api.quote.subscribe(contract, quote_type=sj.constant.QuoteType.Tick)
            logger.info(f"Subscribed TXF: {contract.code}, ref: {self._txf_reference}")
        except Exception as e:
            logger.warning(f"TXF subscribe failed: {e}")

    async def _resubscribe_startup(self) -> None:
        """斷線重連後重訂閱 TXF + 所有已訂閱個股"""
        await asyncio.to_thread(self._subscribe_startup_contracts)
        prev_stocks = list(self._subscribed_stocks)
        if prev_stocks:
            self._subscribed_stocks.clear()
            await self.subscribe_stocks(prev_stocks)
            logger.info("Resubscribed %d stocks after reconnect", len(prev_stocks))

    # ─── 個股 WebSocket Tick 訂閱 ──────────────────────────────────────────────

    def is_subscribed(self, stock_id: str) -> bool:
        return stock_id in self._subscribed_stocks

    async def subscribe_stock(self, stock_id: str) -> None:
        """訂閱單支個股 tick（WebSocket，已訂閱或訂閱進行中則立即返回）"""
        if stock_id in self._subscribed_stocks or stock_id in self._subscribing_stocks:
            return
        self._subscribing_stocks.add(stock_id)
        try:
            import shioaji as sj

            def _sub() -> None:
                contract = self._api.Contracts.Stocks[stock_id]
                self._api.quote.subscribe(contract, quote_type=sj.constant.QuoteType.Tick)

            await asyncio.to_thread(_sub)
            self._subscribed_stocks.add(stock_id)
            logger.debug("Subscribed stock tick: %s", stock_id)
        finally:
            self._subscribing_stocks.discard(stock_id)

    async def subscribe_stocks(self, stock_ids: list[str]) -> None:
        """批次訂閱個股 tick（略過已訂閱或訂閱進行中；在單一 thread 中依序執行）"""
        to_sub = [sid for sid in stock_ids
                  if sid not in self._subscribed_stocks and sid not in self._subscribing_stocks]
        if not to_sub:
            return
        # 先標記為訂閱中，防止 batch + single 或兩個 batch 同時重複訂閱
        self._subscribing_stocks.update(to_sub)
        import shioaji as sj
        succeeded: list[str] = []
        try:
            def _sub_all() -> None:
                for sid in to_sub:
                    try:
                        contract = self._api.Contracts.Stocks[sid]
                        self._api.quote.subscribe(contract, quote_type=sj.constant.QuoteType.Tick)
                        succeeded.append(sid)
                    except Exception as e:
                        logger.warning("subscribe_stock failed %s: %s", sid, e)

            await asyncio.to_thread(_sub_all)
            self._subscribed_stocks.update(succeeded)
            logger.info("Subscribed %d/%d stocks", len(succeeded), len(to_sub))
        finally:
            for sid in to_sub:
                self._subscribing_stocks.discard(sid)

    # ─── 個股 tick cache 讀取 ──────────────────────────────────────────────────

    def get_cached_stock(self, stock_id: str) -> Optional[dict]:
        """讀 tick cache；不存在或超過 120 秒則回 None"""
        cached = self._stock_cache.get(stock_id)
        if cached is None:
            return None
        return cached if _is_fresh(cached) else None

    def get_cached_stocks(self, stock_ids: list[str]) -> dict[str, Optional[dict]]:
        """批次讀 tick cache"""
        return {sid: self.get_cached_stock(sid) for sid in stock_ids}

    # ─── 啟動暖身 ──────────────────────────────────────────────────────────────

    async def warmup_stocks(self, stock_ids: list[str]) -> None:
        """
        啟動暖身：批次訂閱 WebSocket tick + 一次性 api.snapshots() 填充 cache。
        解決開盤前 tick 尚未到達的空窗期。
        snapshot 呼叫失敗不影響系統，cache 待第一筆 tick 到達後自動填充。
        """
        if not stock_ids:
            return

        # 1. 訂閱 WebSocket tick
        await self.subscribe_stocks(stock_ids)

        # 2. 一次性 HTTP snapshot 填充 cache
        #    啟動時連線池全新，不存在 Azure NAT 殭屍連線問題，風險低
        def _warmup_snap() -> int:
            now_iso = datetime.now(timezone.utc).isoformat()
            contracts = []
            valid_ids: list[str] = []
            for sid in stock_ids:
                try:
                    contracts.append(self._api.Contracts.Stocks[sid])
                    valid_ids.append(sid)
                except KeyError:
                    pass
            if not contracts:
                return 0
            snaps = self._api.snapshots(contracts)
            count = 0
            for sid, snap in zip(valid_ids, snaps):
                if float(snap.close) > 0:
                    self._stock_cache[sid] = {
                        "price":         float(snap.close),
                        "change":        float(snap.change_price),
                        "changePercent": float(snap.change_rate) / 100,
                        "high":          float(snap.high),
                        "low":           float(snap.low),
                        "volume":        int(snap.total_volume),
                        "updatedAt":     self._normalize_ts(snap.ts),
                        "timestamp":     now_iso,
                    }
                    count += 1
            return count

        try:
            filled = await asyncio.wait_for(asyncio.to_thread(_warmup_snap), timeout=20)
            logger.info("Warmup snapshot filled %d stocks into cache", filled)
        except asyncio.TimeoutError:
            logger.warning("Warmup snapshot timeout after 20s, cache will fill from ticks")
        except Exception as e:
            logger.warning("Warmup snapshot error: %s", e)

    # ─── 期貨 cache ────────────────────────────────────────────────────────────

    def get_cached_futures(self) -> Optional[dict]:
        for code, data in self._futures_cache.items():
            if "TXF" in code and _is_fresh(data):
                return data
        return None

    def get_nearest_txf_contract(self):
        return self._get_nearest_txf()

    # ─── Snapshot API（診斷測試專用，不在報價熱路徑上）──────────────────────────

    @staticmethod
    def _normalize_ts(ts) -> int:
        """snap.ts 正規化為 epoch seconds；nanoseconds（> 1e12）自動換算。"""
        import time as _time
        if ts is None:
            return int(_time.time())
        if hasattr(ts, "timestamp"):
            return int(ts.timestamp())
        ts_int = int(ts)
        if ts_int > 1_000_000_000_000:
            return ts_int // 1_000_000_000
        return ts_int

    def _snap_to_dict(self, snap) -> dict:
        return {
            "price":         float(snap.close),
            "change":        float(snap.change_price),
            "changePercent": float(snap.change_rate) / 100,
            "high":          float(snap.high),
            "low":           float(snap.low),
            "volume":        int(snap.total_volume),
            "updatedAt":     self._normalize_ts(snap.ts),
        }

    async def get_stock_snapshot(self, stock_id: str) -> Optional[dict]:
        """
        單股 HTTP snapshot（/system/shioaji-test 診斷端點專用）。
        Option B shield pattern 防止 timeout 後 thread 堆積。
        """
        if self._snap_single_sem.locked():
            return None

        def _snap() -> Optional[dict]:
            try:
                contract = self._api.Contracts.Stocks[stock_id]
            except KeyError:
                return None
            snaps = self._api.snapshots([contract])
            if not snaps:
                return None
            snap = snaps[0]
            if float(snap.close) <= 0:
                return None
            return self._snap_to_dict(snap)

        async def _run_single() -> Optional[dict]:
            async with self._snap_single_sem:
                return await asyncio.to_thread(_snap)

        task = asyncio.create_task(_run_single())
        try:
            return await asyncio.wait_for(asyncio.shield(task), timeout=5)
        except asyncio.TimeoutError:
            logger.warning("get_stock_snapshot timeout 5s: %s", stock_id)
            return None

    def get_status(self) -> dict:
        return {
            "connected":        self._connected,
            "initialized":      self._initialized,
            "reinitializing":   self._reinitializing,
            "subscribedStocks": len(self._subscribed_stocks),
            "cachedStocks":     len(self._stock_cache),
        }

    async def cleanup(self) -> None:
        """Logout + 清除所有狀態，供 reinitialize 使用。logout 失敗不中斷後續清理。"""
        self._initialized = False
        if self._api is not None and self._connected:
            try:
                await asyncio.wait_for(asyncio.to_thread(self._api.logout), timeout=10)
            except Exception as e:
                logger.warning("cleanup logout error (ignored): %s", e)
        self._connected = False
        self._api = None
        self._txf_reference = None
        self._subscribed_stocks.clear()
        self._subscribing_stocks.clear()
        self._stock_cache.clear()
        self._futures_cache.clear()
        logger.info("ShioajiManager cleanup complete")

    # ─── 加權指數日 K ──────────────────────────────────────────────────────────────

    async def get_index_kbars(self, start: str, end: str) -> list[dict]:
        """取得加權指數（TSE001）日 K，從 Shioaji 1 分鐘 K 棒聚合而來。"""
        def _fetch() -> list[dict]:
            from datetime import datetime, timezone, timedelta
            contract = self._api.Contracts.Indexs["TSE001"]
            kbars = self._api.kbars(contract=contract, start=start, end=end)
            if not kbars or not kbars.ts:
                return []

            tz_offset = timedelta(hours=8)
            daily: dict[str, dict] = {}

            for i, ts_raw in enumerate(kbars.ts):
                ts_sec = self._normalize_ts(ts_raw)
                dt_local = datetime.fromtimestamp(ts_sec, tz=timezone.utc) + tz_offset
                date_str = dt_local.strftime("%Y-%m-%d")

                o = float(kbars.Open[i])  if i < len(kbars.Open)   else 0.0
                h = float(kbars.High[i])  if i < len(kbars.High)   else 0.0
                l = float(kbars.Low[i])   if i < len(kbars.Low)    else 0.0
                c = float(kbars.Close[i]) if i < len(kbars.Close)  else 0.0
                v = int(kbars.Volume[i])  if i < len(kbars.Volume) else 0

                if c <= 0:
                    continue

                if date_str not in daily:
                    daily[date_str] = {"timestamp": ts_sec, "open": o, "high": h, "low": l, "close": c, "volume": v}
                else:
                    day = daily[date_str]
                    if h > day["high"]:        day["high"] = h
                    if 0 < l < day["low"]:     day["low"]  = l
                    day["close"]    = c
                    day["volume"]  += v
                    day["timestamp"] = ts_sec

            return sorted(daily.values(), key=lambda d: d["timestamp"])

        return await asyncio.wait_for(asyncio.to_thread(_fetch), timeout=30)

    async def shutdown(self) -> None:
        if self._api and self._connected:
            await asyncio.to_thread(self._api.logout)
            self._connected = False
            logger.info("Shioaji logged out")


shioaji_manager = ShioajiManager()
