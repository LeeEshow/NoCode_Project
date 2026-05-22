import math
import time
import requests
from concurrent.futures import ThreadPoolExecutor
import yfinance as yf
from services.firestore import get_db
from services.cache import cache_get, cache_set


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
    all_stocks = get_all_stocks()
    found = next((s for s in all_stocks if s.get("code") == stock_id), None)
    if found and found.get("market") == "OTC":
        return f"{stock_id}.TWO"
    return f"{stock_id}.TW"


def get_quote(stock_id: str) -> dict:
    """取得個股即時報價（與 Node.js StockQuote 結構一致）"""
    all_stocks = get_all_stocks()
    found = next((s for s in all_stocks if s.get("code") == stock_id), None)
    name = found.get("name", stock_id) if found else stock_id

    symbol = resolve_symbol(stock_id)
    ticker = yf.Ticker(symbol)

    price = prev = high = low = 0.0
    volume = 0

    # 優先嘗試 fast_info（盤中有效），盤外 currentTradingPeriod 可能缺失
    try:
        fi = ticker.fast_info
        price  = _f(fi.last_price, 0.0)
        prev   = _f(fi.previous_close, 0.0)
        high   = _f(getattr(fi, "day_high",    None), 0.0)
        low    = _f(getattr(fi, "day_low",     None), 0.0)
        volume = _i(getattr(fi, "last_volume", None))
    except Exception:
        pass

    # fast_info 失敗或 price=0 時 fallback 用近 5 日收盤
    if not price:
        try:
            hist = ticker.history(period="5d")
            if not hist.empty:
                closes = hist["Close"].dropna()
                if len(closes) >= 1:
                    price = _f(closes.iloc[-1], 0.0)
                if len(closes) >= 2:
                    prev = _f(closes.iloc[-2], 0.0)
        except Exception:
            pass

    change     = round(price - prev, 2) if price and prev else 0.0
    change_pct = round((price - prev) / prev * 100, 2) if price and prev else 0.0

    return {
        "stockId":       stock_id,
        "name":          name,
        "price":         price,
        "change":        change,
        "changePercent": change_pct,
        "high":          high,
        "low":           low,
        "volume":        volume,
        "marketStatus":  "CLOSED",
        "updatedAt":     int(time.time()),
    }


def get_history_closes(stock_id: str, days: int = 90) -> list[float]:
    """取得個股 N 日收盤價序列（用於動態風險計算）"""
    symbol = resolve_symbol(stock_id)
    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period="3mo")
        if hist.empty:
            return []
        return [float(v) for v in hist["Close"].dropna().tolist()]
    except Exception:
        return []


def get_forex_rates() -> list[dict]:
    """取得 8 幣別對台幣即時匯率，快取 300s"""
    cached = cache_get("market:forex-rates")
    if cached is not None:
        return cached
    results = []
    for item in FOREX_SYMBOLS:
        try:
            fi = yf.Ticker(item["symbol"]).fast_info
            rate = fi.last_price
            results.append({
                "code": item["code"],
                "name": item["name"],
                "rate": round(float(rate), 4) if rate else None,
            })
        except Exception:
            results.append({"code": item["code"], "name": item["name"], "rate": None})
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


def _fetch_all_indices_batch() -> list[dict]:
    """單一批量請求取得所有指數資料（替代 5 次獨立請求）"""
    symbols = [item["symbol"] for item in INDEX_SYMBOLS]
    try:
        data = yf.download(
            tickers=symbols,
            period="5d",
            auto_adjust=True,
            progress=False,
        )
        if data.empty:
            raise ValueError("empty data")
        results = []
        for item in INDEX_SYMBOLS:
            sym = item["symbol"]
            try:
                # MultiIndex columns: ("Close", sym)
                if hasattr(data.columns, "levels"):
                    closes = data["Close"][sym].dropna()
                else:
                    closes = data["Close"].dropna()
                if len(closes) < 1:
                    raise ValueError("no data")
                price = _f(closes.iloc[-1])
                prev  = _f(closes.iloc[-2]) if len(closes) >= 2 else None
                change     = round(price - prev, 2) if price is not None and prev is not None else None
                change_pct = round((price - prev) / prev * 100, 2) if price is not None and prev else None
                results.append({"id": item["id"], "name": item["name"],
                                "price": price, "change": change, "changePercent": change_pct})
            except Exception:
                results.append({"id": item["id"], "name": item["name"],
                                "price": None, "change": None, "changePercent": None})
        return results
    except Exception:
        return [{"id": item["id"], "name": item["name"],
                 "price": None, "change": None, "changePercent": None}
                for item in INDEX_SYMBOLS]


def _fetch_taiwan_futures() -> dict:
    """爬取 Yahoo Finance 台灣版取得台指期報價"""
    try:
        res = requests.get(
            "https://tw.stock.yahoo.com/future/WTX%26",
            timeout=10,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "zh-TW,zh;q=0.9",
            },
            verify=False,
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
    """取得 6 個市場指數，快取 5s"""
    cached = cache_get("market:indices")
    if cached is not None:
        return cached

    _no_data = lambda item: {"id": item["id"], "name": item["name"],
                              "price": None, "change": None, "changePercent": None}

    # 不使用 with（context manager 的 shutdown(wait=True) 會等所有 future 結束才返回）
    pool = ThreadPoolExecutor(max_workers=2)
    fut_tw  = pool.submit(_fetch_taiwan_futures)
    fut_idx = pool.submit(_fetch_all_indices_batch)
    try:
        futures_card = fut_tw.result(timeout=12)
    except Exception:
        futures_card = {"id": "futures", "name": "台指期",
                        "price": None, "change": None, "changePercent": None}
    try:
        cards = fut_idx.result(timeout=12)
    except Exception:
        cards = [_no_data(item) for item in INDEX_SYMBOLS]
    pool.shutdown(wait=False)  # 不阻塞；未完成的 future 在背景繼續

    # 台指期插入第二位（twii 之後）
    cards.insert(1, futures_card)
    cache_set("market:indices", cards, 5)
    return cards


# ─── 股票歷史 K 線 ─────────────────────────────────────────────────────────────

def get_full_history(stock_id: str, days: int = 90) -> list[dict]:
    """取得個股 N 日 OHLCV 資料（與 Node.js StockHistoryPoint 結構一致）"""
    symbol = resolve_symbol(stock_id)
    try:
        period = "1mo" if days <= 35 else ("3mo" if days <= 95 else "1y")
        hist = yf.Ticker(symbol).history(period=period)
        if hist.empty:
            return []
        result = []
        for ts, row in hist.iterrows():
            close = float(row["Close"]) if row["Close"] == row["Close"] else 0
            if close <= 0:
                continue
            result.append({
                "timestamp": int(ts.timestamp()),
                "open":   float(row["Open"]   or 0),
                "high":   float(row["High"]   or 0),
                "low":    float(row["Low"]    or 0),
                "close":  close,
                "volume": int(row["Volume"]   or 0),
            })
        return result[-days:] if len(result) > days else result
    except Exception:
        return []


# ─── 股票基本面 ────────────────────────────────────────────────────────────────

def get_profile(stock_id: str) -> dict:
    """取得個股基本面資料（與 Node.js StockProfile 結構一致）"""
    symbol = resolve_symbol(stock_id)
    try:
        ticker = yf.Ticker(symbol)
        fi = ticker.fast_info
        info = ticker.info or {}

        name   = info.get("longName") or info.get("shortName") or stock_id
        market = info.get("exchange") or info.get("market") or ""

        pe_ratio = info.get("trailingPE")
        div_yield_raw = info.get("dividendYield")
        div_yield = round(div_yield_raw * 100, 2) if div_yield_raw else None
        market_cap = info.get("marketCap")

        gross_margin_raw = info.get("grossMargins")
        roe_raw          = info.get("returnOnEquity")
        roa_raw          = info.get("returnOnAssets")

        return {
            "stockId":            stock_id,
            "name":               name,
            "market":             market,
            "peRatio":            pe_ratio,
            "dividendYield":      div_yield,
            "fiftyTwoWeekHigh":   float(getattr(fi, "year_high", None) or info.get("fiftyTwoWeekHigh") or 0),
            "fiftyTwoWeekLow":    float(getattr(fi, "year_low",  None) or info.get("fiftyTwoWeekLow")  or 0),
            "marketCap":          market_cap,
            "discountPremiumRate": None,
            "revenue":            None,
            "grossMargin":        round(gross_margin_raw * 100, 2) if gross_margin_raw else None,
            "roe":                round(roe_raw * 100, 2) if roe_raw else None,
            "roa":                round(roa_raw * 100, 2) if roa_raw else None,
        }
    except Exception:
        return {
            "stockId": stock_id, "name": stock_id, "market": "",
            "peRatio": None, "dividendYield": None,
            "fiftyTwoWeekHigh": 0, "fiftyTwoWeekLow": 0,
            "marketCap": None, "discountPremiumRate": None,
            "revenue": None, "grossMargin": None, "roe": None, "roa": None,
        }


# ─── 三大法人籌碼 ──────────────────────────────────────────────────────────────

def _fetch_t86_rows(stock_id: str, date_obj) -> list[dict]:
    """從 TWSE T86 API 取得單月三大法人資料"""
    date_str = f"{date_obj.year}{str(date_obj.month).zfill(2)}01"
    try:
        res = requests.get(
            "https://www.twse.com.tw/rwd/zh/fund/T86",
            params={"date": date_str, "stockNo": stock_id, "response": "json"},
            timeout=10,
            headers={"User-Agent": "Mozilla/5.0"},
        )
        data = res.json()
        if data.get("stat") != "OK" or not isinstance(data.get("data"), list):
            return []

        def parse_int(s: str) -> int:
            try:
                return int(s.replace(",", "")) if s else 0
            except Exception:
                return 0

        rows = []
        for row in data["data"]:
            parts = (row[0] or "").split("/")
            if len(parts) < 3:
                continue
            iso_date = f"{int(parts[0]) + 1911}-{parts[1]}-{parts[2]}"
            rows.append({
                "date":    iso_date,
                "foreign": round((parse_int(row[1]) + parse_int(row[2])) / 1000),
                "trust":   round(parse_int(row[3]) / 1000),
                "dealer":  round((parse_int(row[4]) + parse_int(row[5])) / 1000),
            })
        return rows
    except Exception:
        return []


def get_chip(stock_id: str) -> list[dict]:
    """取得近 20 個交易日三大法人買賣超（單位：張）"""
    from datetime import date, timedelta
    today = date.today()
    rows = _fetch_t86_rows(stock_id, today)
    if len(rows) < 20:
        prev_month = date(today.year if today.month > 1 else today.year - 1,
                          today.month - 1 if today.month > 1 else 12, 1)
        prev_rows = _fetch_t86_rows(stock_id, prev_month)
        rows = prev_rows + rows
    return rows[-20:]


# ─── 出口景氣燈號 ──────────────────────────────────────────────────────────────

def get_export_indicator() -> dict:
    """取得台灣出口景氣燈號（NDC 國發會），快取 3600s"""
    cached = cache_get("market:export-indicator")
    if cached is not None:
        return cached

    fallback = {"period": "-", "score": None, "light": None, "lightLabel": None}

    try:
        session = requests.Session()
        page = session.get(
            "https://index.ndc.gov.tw/n/zh_tw/data/eco/indicators_table1",
            timeout=15,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "zh-TW,zh;q=0.9",
            },
            verify=False,
        )
        import re
        csrf_m = re.search(r'csrf-token"\s+content="([^"]+)"', page.text)
        if not csrf_m:
            cache_set("market:export-indicator", fallback, 3600)
            return fallback
        csrf = csrf_m.group(1)

        api_res = session.post(
            "https://index.ndc.gov.tw/n/json/data/eco/indicators",
            timeout=15,
            headers={
                "Content-Type": "application/json",
                "X-CSRF-TOKEN": csrf,
                "Referer": "https://index.ndc.gov.tw/n/zh_tw/data/eco/indicators_table1",
                "Accept-Language": "zh-TW,zh;q=0.9",
            },
            json={},
            verify=False,
        )
        payload = api_res.json()
        line_obj = payload.get("line", {})
        sr5 = next((v for v in line_obj.values() if v.get("code") == "SR0005"), None)
        if not sr5:
            cache_set("market:export-indicator", fallback, 3600)
            return fallback

        valid_data = [d for d in sr5.get("data", []) if d.get("y") is not None]
        if not valid_data:
            cache_set("market:export-indicator", fallback, 3600)
            return fallback

        latest = valid_data[-1]
        raw_x = str(latest["x"])
        period = f"{raw_x[:4]}-{raw_x[4:6]}" if len(raw_x) == 6 else raw_x
        score = float(latest["y"]) if latest["y"] is not None else None

        def score_to_light(s: float) -> str:
            if s >= 38: return "red"
            if s >= 32: return "yellow-red"
            if s >= 23: return "green"
            if s >= 17: return "yellow-blue"
            return "blue"

        light_label_map = {
            "red": "紅燈", "yellow-red": "黃紅燈", "green": "綠燈",
            "yellow-blue": "黃藍燈", "blue": "藍燈",
        }
        light = score_to_light(score) if score is not None else None
        result = {"period": period, "score": score, "light": light,
                  "lightLabel": light_label_map.get(light) if light else None}
        cache_set("market:export-indicator", result, 3600)
        return result
    except Exception:
        cache_set("market:export-indicator", fallback, 300)
        return fallback
