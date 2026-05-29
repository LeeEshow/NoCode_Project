import asyncio
import logging
import time
from typing import Optional
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

_TICK_MAX_AGE_SECONDS = 120  # 盤中 TXF futures tick 有效期（秒）
_TAIEX_SNAP_TTL = 5          # TAIEX snapshot 內部快取 TTL（秒）


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
        self._futures_cache: dict[str, dict] = {}
        self._txf_reference: Optional[float] = None
        # TAIEX snapshot 快取（Index 合約不支援 Tick，改用 api.snapshots()）
        self._taiex_snap_data: Optional[dict] = None
        self._taiex_snap_ts: float = 0.0
        # Snapshot 併發限流：防止 asyncio.wait_for timeout 後底層 thread 持續堆積
        # batch：同時只允許 1 個批次呼叫；若已在飛行中，回 all-None 直接走 fallback
        # single：最多 3 個並行單股呼叫；超出時回 None 走 fallback，不計 CB failure
        self._snap_batch_sem = asyncio.Semaphore(1)
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
        from shioaji import Exchange, TickFOPv1

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
                self._taiex_snap_ts = 0.0
                self._futures_cache.clear()
                logger.warning("Shioaji disconnected, cache cleared")
            elif event_code == 4:
                self._connected = True
                logger.info("Shioaji reconnected, resubscribing...")
                asyncio.create_task(self._resubscribe_startup())

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

    async def _resubscribe_startup(self) -> None:
        """斷線重連後重訂閱 TXF（個股與 TAIEX 改用 snapshot API，不需重訂閱）。"""
        await asyncio.to_thread(self._subscribe_startup_contracts)

    def get_cached_futures(self) -> Optional[dict]:
        for code, data in self._futures_cache.items():
            if "TXF" in code and _is_fresh(data):
                return data
        return None

    async def get_taiex_snapshot(self) -> Optional[dict]:
        """
        透過 api.snapshots() 取得加權指數即時資料（_TAIEX_SNAP_TTL 秒內部快取）。
        Index 合約不支援 Tick 訂閱，改用 HTTP snapshot 查詢。
        回傳 snake_case dict，供 market.py 的 _sj_to_index_card() 使用。
        """
        if self._taiex_snap_data and (time.time() - self._taiex_snap_ts) < _TAIEX_SNAP_TTL:
            return self._taiex_snap_data

        def _snap() -> Optional[dict]:
            try:
                contract = self._api.Contracts.Indexs["TSE001"]
                snaps = self._api.snapshots([contract])
                if not snaps:
                    return None
                snap = snaps[0]
                if float(snap.close) <= 0:
                    return None
                return {
                    "price":          float(snap.close),
                    "change":         float(snap.change_price),
                    "change_percent": float(snap.change_rate),
                }
            except Exception as e:
                logger.warning("get_taiex_snapshot error: %s", e)
                return None

        try:
            result = await asyncio.wait_for(asyncio.to_thread(_snap), timeout=5)
        except asyncio.TimeoutError:
            logger.warning("get_taiex_snapshot timeout after 5s, fallback to Yahoo")
            return None
        if result is not None:
            self._taiex_snap_data = result
            self._taiex_snap_ts = time.time()
        return result

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

    # ─── Snapshot API（取代 tick 作為個股報價來源）──────────────────────────────

    @staticmethod
    def _normalize_ts(ts) -> int:
        """
        將 snap.ts 正規化為 epoch seconds（int）。
        Shioaji tick/snapshot ts 為 nanosecond int（約 1.7e18）；
        若已是 seconds（< 1e12）則直接使用；datetime 物件取 .timestamp()。
        """
        import time as _time
        if ts is None:
            return int(_time.time())
        if hasattr(ts, "timestamp"):          # datetime object
            return int(ts.timestamp())
        ts_int = int(ts)
        if ts_int > 1_000_000_000_000:        # nanoseconds → seconds
            return ts_int // 1_000_000_000
        return ts_int

    def _snap_to_dict(self, snap) -> dict:
        """將 Shioaji Snapshot 物件轉為標準報價 dict。updatedAt 統一為 epoch seconds。"""
        return {
            "price":         float(snap.close),
            "change":        float(snap.change_price),
            "changePercent": float(snap.change_rate),
            "high":          float(snap.high),
            "low":           float(snap.low),
            "volume":        int(snap.total_volume),
            "updatedAt":     self._normalize_ts(snap.ts),
        }

    async def get_stock_snapshot(self, stock_id: str) -> Optional[dict]:
        """
        單股 snapshot 查詢。
        - 成功且 close > 0：回傳標準報價 dict
        - 合約不存在（KeyError）或 close <= 0：回傳 None（不計入 CB failure）
        - API exception：raise（由 quote_service 的 CB 層處理）
        - Semaphore 滿（3 個並行呼叫已在執行中）：回 None，不計 CB failure
        """
        if self._snap_single_sem.locked():
            logger.debug("Shioaji single snapshot semaphore full, skip: %s", stock_id)
            return None

        def _snap() -> Optional[dict]:
            try:
                contract = self._api.Contracts.Stocks[stock_id]
            except KeyError:
                logger.debug("Shioaji contract not found: %s", stock_id)
                return None
            snaps = self._api.snapshots([contract])
            if not snaps:
                return None
            snap = snaps[0]
            if float(snap.close) <= 0:
                return None
            return self._snap_to_dict(snap)

        async with self._snap_single_sem:
            try:
                return await asyncio.wait_for(asyncio.to_thread(_snap), timeout=5)
            except asyncio.TimeoutError:
                logger.warning("get_stock_snapshot timeout after 5s: %s, fallback to Yahoo", stock_id)
                return None

    async def get_stock_snapshots(self, stock_ids: list[str]) -> dict[str, Optional[dict]]:
        """
        批次 snapshot 查詢（最多 500 支，單次 API 呼叫）。
        回傳 {stock_id: snap_dict | None}：
        - snap_dict：有效報價
        - None：合約不存在或 close <= 0
        - API exception：raise
        - Semaphore 鎖定（前一批次仍在執行中）：回 all-None，讓 fallback 補齊，不計 CB failure
        """
        if self._snap_batch_sem.locked():
            logger.debug(
                "Shioaji batch snapshot semaphore locked (%d stocks), skip to fallback",
                len(stock_ids),
            )
            return {sid: None for sid in stock_ids}

        def _snap() -> dict[str, Optional[dict]]:
            results: dict[str, Optional[dict]] = {}
            contracts = []
            valid_ids: list[str] = []

            for sid in stock_ids:
                try:
                    contract = self._api.Contracts.Stocks[sid]
                    contracts.append(contract)
                    valid_ids.append(sid)
                except KeyError:
                    logger.debug("Shioaji contract not found: %s", sid)
                    results[sid] = None

            if contracts:
                snaps = self._api.snapshots(contracts)
                for sid, snap in zip(valid_ids, snaps):
                    if float(snap.close) > 0:
                        results[sid] = self._snap_to_dict(snap)
                    else:
                        results[sid] = None

            return results

        async with self._snap_batch_sem:
            try:
                return await asyncio.wait_for(asyncio.to_thread(_snap), timeout=8)
            except asyncio.TimeoutError:
                logger.warning("get_stock_snapshots timeout after 8s (%d stocks), fallback to Yahoo", len(stock_ids))
                return {sid: None for sid in stock_ids}

    def get_status(self) -> dict:
        return {
            "connected":   self._connected,
            "initialized": self._initialized,
        }

    async def shutdown(self) -> None:
        if self._api and self._connected:
            await asyncio.to_thread(self._api.logout)
            self._connected = False
            logger.info("Shioaji logged out")


shioaji_manager = ShioajiManager()
