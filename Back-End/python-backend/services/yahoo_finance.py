import math
import time
import requests
from services.firestore import get_db
from services.cache import cache_get, cache_set
from core.executors import get_executor, yahoo_sem
from services.api_switch import yahoo_cb


def _f(v, default=None):
    """安全轉 float：None / NaN / Inf 一律回傳 default"""
    if v is None:
        return default
    try:
        f = float(v)
        return default if (math.isnan(f) or math.isinf(f)) else f
    except Exception:
        return default


def _i(v, default=0) -> int:
    f = _f(v)
    return int(f) if f is not None else default


FOREX_SYMBOLS = [
    {"code": "USD", "name": "美元",     "symbol": "USDTWD=X"},
    {"code": "JPY", "name": "日圓",     "symbol": "JPYTWD=X"},
    {"code": "EUR", "name": "歐元",     "symbol": "EURTWD=X"},
    {"code": "CNY", "name": "人民幣",   "symbol": "CNYTWD=X"},
    {"code": "HKD", "name": "港幣",     "symbol": "HKDTWD=X"},
    {"code": "GBP", "name": "英鎊",     "symbol": "GBPTWD=X"},
    {"code": "AUD", "name": "澳幣",     "symbol": "AUDTWD=X"},
    {"code": "SGD", "name": "新加坡幣", "symbol": "SGDTWD=X"},
]


def get_all_stocks() -> list[dict]:
    """從 Firestore stock_list/data 取得全股清單，快取 3600s"""
    cached = cache_get("stocks:all-list")
    if cached is not None:
        return cached
    db = get_db()
    doc = db.collection("stock_list").document("data").get()
    if not doc.exists:
        return []
    stocks = doc.to_dict().get("stocks", [])
    if isinstance(stocks, list) and len(stocks) > 0:
        cache_set("stocks:all-list", stocks, 3600)
    return stocks if isinstance(stocks, list) else []


def resolve_symbol(stock_id: str) -> str:
    """判斷 TSE/OTC 後綴，回傳 Yahoo Finance 代號"""
    if stock_id.startswith("^"):
        return stock_id
    all_stocks = get_all_stocks()
    found = next((s for s in all_stocks if s.get("code") == stock_id), None)
    if found and found.get("market") == "OTC":
        return f"{stock_id}.TWO"
    return f"{stock_id}.TW"


_YF_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
}

def _yf_chart(symbol: str, interval: str = "1d", range_: str = "1d") -> dict:
    """Yahoo Finance v8 Chart API — 透過 yahoo_cb + yahoo_sem 保護"""
    def _call():
        with yahoo_sem:
            res = requests.get(
                f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}",
                params={"interval": interval, "range": range_},
                timeout=10,
                headers=_YF_HEADERS,
            )
            res.raise_for_status()
            result = res.json().get("chart", {}).get("result") or []
            if not result:
                raise ValueError(f"Yahoo v8: 無資料 {symbol}")
            return result[0]
    return yahoo_cb.call(_call)


def get_quote(stock_id: str) -> dict:
    """取得個股即時報價（與 Node.js StockQuote 結構一致）。

    盤後（13:30 以後）優先從 TWSE 官方 API 取得收盤價，
    避免 Azure 雲端 IP 被 Yahoo Finance 封鎖造成 Timeout。
    TSE 上市股票走 TWSE；OTC 上櫃股票或 TWSE 失敗時 fallback Yahoo。
    """
    from utils.market_hours import is_market_open
    from services.twse_finance import get_twse_closing_price

    # ── 盤後：優先走 TWSE（TSE 上市股票）──────────────────────────────────────
    if not is_market_open():
        symbol = resolve_symbol(stock_id)
        is_otc = symbol.endswith(".TWO")
        if not is_otc:
            twse = get_twse_closing_price(stock_id)
            if twse is not None:
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
                }
        # OTC 或 TWSE 失敗 → fallthrough 至 Yahoo Finance

    # ── 盤中 or TWSE fallback：Yahoo Finance ──────────────────────────────────
    symbol = resolve_symbol(stock_id)
    data = _yf_chart(symbol, "1d", "1d")
    meta = data["meta"]

    price = _f(meta.get("regularMarketPrice"), 0.0)
    prev  = _f(meta.get("chartPreviousClose"), price)
    change     = round(price - prev, 2) if price and prev else 0.0
    change_pct = round((price - prev) / prev * 100, 2) if price and prev else 0.0

    return {
        "stockId":       stock_id,
        "name":          stock_id,
        "price":         price,
        "change":        change,
        "changePercent": change_pct,
        "high":          _f(meta.get("regularMarketDayHigh"), 0.0),
        "low":           _f(meta.get("regularMarketDayLow"),  0.0),
        "volume":        _i(meta.get("regularMarketVolume")),
        "marketStatus":  meta.get("marketState", "CLOSED"),
        "updatedAt":     int(meta.get("regularMarketTime") or time.time()),
    }


def get_yahoo_quote(stock_id: str) -> dict:
    """Yahoo Finance 直接查詢，不走 TWSE fallback。
    供 quote_service 使用，確保 quoteSource 能正確標記為 "yahoo"。
    """
    symbol = resolve_symbol(stock_id)
    data = _yf_chart(symbol, "1d", "1d")
    meta = data["meta"]

    price = _f(meta.get("regularMarketPrice"), 0.0)
    prev  = _f(meta.get("chartPreviousClose"), price)
    change     = round(price - prev, 2) if price and prev else 0.0
    change_pct = round((price - prev) / prev * 100, 2) if price and prev else 0.0

    return {
        "stockId":       stock_id,
        "name":          stock_id,
        "price":         price,
        "change":        change,
        "changePercent": change_pct,
        "high":          _f(meta.get("regularMarketDayHigh"), 0.0),
        "low":           _f(meta.get("regularMarketDayLow"),  0.0),
        "volume":        _i(meta.get("regularMarketVolume")),
        "marketStatus":  meta.get("marketState", "CLOSED"),
        "updatedAt":     int(meta.get("regularMarketTime") or time.time()),
    }


def get_history_closes(stock_id: str, days: int = 90) -> list[float]:
    """取得個股 N 日收盤價序列（用於動態風險計算）"""
    symbol = resolve_symbol(stock_id)
    try:
        data = _yf_chart(symbol, "1d", "3mo")
        closes = data.get("indicators", {}).get("quote", [{}])[0].get("close", [])
        return [float(c) for c in closes if c is not None]
    except Exception:
        return []


def _fetch_forex_rate(item: dict) -> dict:
    """Yahoo v8 Chart API 取得單一幣別匯率"""
    try:
        data = _yf_chart(item["symbol"], "1d", "1d")
        rate = _f(data["meta"].get("regularMarketPrice"))
        return {"code": item["code"], "name": item["name"],
                "rate": round(rate, 4) if rate is not None else None}
    except Exception:
        return {"code": item["code"], "name": item["name"], "rate": None}


def get_forex_rates() -> list[dict]:
    """取得 8 幣別對台幣即時匯率，快取 300s"""
    cached = cache_get("market:forex-rates")
    if cached is not None:
        return cached
    executor = get_executor()
    futs = [executor.submit(_fetch_forex_rate, item) for item in FOREX_SYMBOLS]
    results = [f.result() for f in futs]
    cache_set("market:forex-rates", results, 300)
    return results


# ─── 市場指數 ──────────────────────────────────────────────────────────────────

INDEX_SYMBOLS = [
    {"id": "twii",   "name": "台股大盤",   "symbol": "^TWII"},
    {"id": "nasdaq", "name": "NASDAQ",     "symbol": "^IXIC"},
    {"id": "sp500",  "name": "S&P 500",    "symbol": "^GSPC"},
    {"id": "dji",    "name": "道瓊工業",   "symbol": "^DJI"},
    {"id": "sox",    "name": "費城半導體", "symbol": "^SOX"},
]


def _fetch_index_card(item: dict) -> dict:
    """Yahoo v8 Chart API 取得單一指數報價"""
    try:
        data = _yf_chart(item["symbol"], "1d", "1d")
        meta = data["meta"]
        price = _f(meta.get("regularMarketPrice"))
        prev  = _f(meta.get("chartPreviousClose"))
        change     = round(price - prev, 2) if price is not None and prev is not None else None
        change_pct = round((price - prev) / prev * 100, 2) if price is not None and prev else None
        return {"id": item["id"], "name": item["name"],
                "price": price, "change": change, "changePercent": change_pct}
    except Exception:
        return {"id": item["id"], "name": item["name"],
                "price": None, "change": None, "changePercent": None}


def _fetch_taiwan_futures() -> dict:
    """爬取 Yahoo Finance 台灣版取得台指期報價"""
    try:
        with yahoo_sem:
            res = requests.get(
                "https://tw.stock.yahoo.com/future/WTX%26",
                timeout=10,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "zh-TW,zh;q=0.9",
                },
            )
        html = res.text
        idx = html.find("main-1-FutureHeader-Proxy")
        if idx == -1:
            raise ValueError("找不到 FutureHeader-Proxy")
        section = html[idx: idx + 2000]
        is_down = "c-trend-down" in section

        import re
        price_m = re.search(r'Fz\(32px\)[^>]+?>([\d,]+\.?\d*)<', section)
        if not price_m:
            raise ValueError("無法解析台指期價格")
        price = float(price_m.group(1).replace(",", ""))

        pct_m = re.search(r'\(([\d.]+)%\)', section)
        pct_abs = float(pct_m.group(1)) if pct_m else None
        change_pct = (-pct_abs if is_down else pct_abs) if pct_abs is not None else None

        chg_m = re.search(r'style="border-color:[^"]+"><\/span>([\d,]+\.?\d*)<', section)
        chg_abs = float(chg_m.group(1).replace(",", "")) if chg_m else None
        change = (-chg_abs if is_down else chg_abs) if chg_abs is not None else None

        return {"id": "futures", "name": "台指期",
                "price": price, "change": change, "changePercent": change_pct}
    except Exception:
        return {"id": "futures", "name": "台指期",
                "price": None, "change": None, "changePercent": None}


def get_indices() -> list[dict]:
    """取得 6 個市場指數（twii / 台指期 / nasdaq / sp500 / dji / sox），快取 5s"""
    cached = cache_get("market:indices")
    if cached is not None:
        return cached

    executor = get_executor()
    fut_futures = executor.submit(_fetch_taiwan_futures)
    futs = {item["id"]: executor.submit(_fetch_index_card, item) for item in INDEX_SYMBOLS}

    cards: dict[str, dict] = {}
    for item_id, fut in futs.items():
        try:
            cards[item_id] = fut.result(timeout=12)
        except Exception:
            item = next(i for i in INDEX_SYMBOLS if i["id"] == item_id)
            cards[item_id] = {"id": item_id, "name": item["name"],
                              "price": None, "change": None, "changePercent": None}
    try:
        futures_card = fut_futures.result(timeout=12)
    except Exception:
        futures_card = {"id": "futures", "name": "台指期",
                        "price": None, "change": None, "changePercent": None}

    # 固定順序：twii → 台指期 → nasdaq → sp500 → dji → sox
    ordered = [cards[item["id"]] for item in INDEX_SYMBOLS]
    ordered.insert(1, futures_card)
    cache_set("market:indices", ordered, 5)
    return ordered


# ─── 股票歷史 K 線 ─────────────────────────────────────────────────────────────

def get_history_range(stock_id: str, start_date: str | None = None,
                      end_date: str | None = None, interval: str = "1d") -> list[dict]:
    """取得個股指定日期範圍的 OHLCV（period1/period2 方式呼叫 Yahoo v8）"""
    from datetime import datetime, timezone, timedelta

    symbol = resolve_symbol(stock_id)
    now = datetime.now(tz=timezone.utc)
    end_dt   = (datetime.strptime(end_date,   "%Y-%m-%d").replace(tzinfo=timezone.utc) + timedelta(days=1)) if end_date   else (now + timedelta(days=1))
    start_dt = (datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc))                     if start_date else (end_dt - timedelta(days=180))

    try:
        def _call():
            with yahoo_sem:
                res = requests.get(
                    f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}",
                    params={"interval": interval, "period1": int(start_dt.timestamp()),
                            "period2": int(end_dt.timestamp())},
                    timeout=10,
                    headers=_YF_HEADERS,
                )
                res.raise_for_status()
                return (res.json().get("chart", {}).get("result") or [{}])[0]
        data = yahoo_cb.call(_call)
        timestamps = data.get("timestamp", [])
        q = data.get("indicators", {}).get("quote", [{}])[0]
        opens, highs, lows, closes, volumes = (q.get(k, []) for k in ("open", "high", "low", "close", "volume"))
        result = []
        for i, ts in enumerate(timestamps):
            close = _f(closes[i] if i < len(closes) else None, 0.0)
            if not close or close <= 0:
                continue
            result.append({
                "timestamp": int(ts),
                "open":   _f(opens[i]   if i < len(opens)   else None, 0.0),
                "high":   _f(highs[i]   if i < len(highs)   else None, 0.0),
                "low":    _f(lows[i]    if i < len(lows)    else None, 0.0),
                "close":  close,
                "volume": _i(volumes[i] if i < len(volumes) else None),
            })
        return result
    except Exception:
        return []


def get_full_history(stock_id: str, days: int = 90) -> list[dict]:
    """取得個股 N 日 OHLCV 資料（與 Node.js StockHistoryPoint 結構一致）"""
    symbol = resolve_symbol(stock_id)
    try:
        range_ = "1mo" if days <= 35 else ("3mo" if days <= 95 else "1y")
        data = _yf_chart(symbol, "1d", range_)
        timestamps = data.get("timestamp", [])
        q = data.get("indicators", {}).get("quote", [{}])[0]
        opens   = q.get("open",   [])
        highs   = q.get("high",   [])
        lows    = q.get("low",    [])
        closes  = q.get("close",  [])
        volumes = q.get("volume", [])
        result = []
        for i, ts in enumerate(timestamps):
            close = _f(closes[i] if i < len(closes) else None, 0.0)
            if not close or close <= 0:
                continue
            result.append({
                "timestamp": int(ts),
                "open":   _f(opens[i]   if i < len(opens)   else None, 0.0),
                "high":   _f(highs[i]   if i < len(highs)   else None, 0.0),
                "low":    _f(lows[i]    if i < len(lows)    else None, 0.0),
                "close":  close,
                "volume": _i(volumes[i] if i < len(volumes) else None),
            })
        return result[-days:] if len(result) > days else result
    except Exception:
        return []
