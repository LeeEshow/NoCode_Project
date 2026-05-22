import math
import time
import requests
from concurrent.futures import ThreadPoolExecutor
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


_YF_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
}


def _yf_chart(symbol: str, interval: str = "1d", range_: str = "1d") -> dict:
    """Yahoo Finance v8 Chart API — 回傳 result[0]"""
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


def _yf_quote_summary(symbol: str, modules: str) -> dict:
    """Yahoo Finance v10 quoteSummary API — 回傳 result[0]"""
    res = requests.get(
        f"https://query1.finance.yahoo.com/v10/finance/quoteSummary/{symbol}",
        params={"modules": modules},
        timeout=10,
        headers=_YF_HEADERS,
    )
    res.raise_for_status()
    result = res.json().get("quoteSummary", {}).get("result") or []
    if not result:
        raise ValueError(f"Yahoo v10: 無資料 {symbol}")
    return result[0]


def get_quote(stock_id: str) -> dict:
    """取得個股即時報價（與 Node.js StockQuote 結構一致）"""
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
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(_fetch_forex_rate, FOREX_SYMBOLS))
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
    """Yahoo v8 Chart API 取得單一指數報價（timeout=10s）"""
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

    # 5 個 Yahoo 指數 + 台指期同時並發（6 workers）
    pool = ThreadPoolExecutor(max_workers=6)
    fut_futures = pool.submit(_fetch_taiwan_futures)
    futs = {item["id"]: pool.submit(_fetch_index_card, item) for item in INDEX_SYMBOLS}

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
    pool.shutdown(wait=False)

    # 固定順序：twii → 台指期 → nasdaq → sp500 → dji → sox
    ordered = [cards[item["id"]] for item in INDEX_SYMBOLS]
    ordered.insert(1, futures_card)
    cache_set("market:indices", ordered, 5)
    return ordered


# ─── 股票歷史 K 線 ─────────────────────────────────────────────────────────────

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


# ─── 股票基本面 ────────────────────────────────────────────────────────────────

def get_profile(stock_id: str) -> dict:
    """取得個股基本面資料（與 Node.js StockProfile 結構一致）"""
    _empty = {
        "stockId": stock_id, "name": stock_id, "market": "",
        "peRatio": None, "dividendYield": None,
        "fiftyTwoWeekHigh": 0, "fiftyTwoWeekLow": 0,
        "marketCap": None, "discountPremiumRate": None,
        "revenue": None, "grossMargin": None, "roe": None, "roa": None,
    }
    symbol = resolve_symbol(stock_id)
    try:
        summary = _yf_quote_summary(
            symbol, "summaryDetail,defaultKeyStatistics,financialData,price"
        )

        def _raw(d: dict, key: str):
            v = d.get(key)
            return v.get("raw") if isinstance(v, dict) else v

        price_mod = summary.get("price", {})
        detail    = summary.get("summaryDetail", {})
        fin       = summary.get("financialData", {})

        name      = price_mod.get("longName") or price_mod.get("shortName") or stock_id
        market    = price_mod.get("exchangeName") or ""
        pe_ratio  = _raw(detail, "trailingPE")
        div_raw   = _raw(detail, "dividendYield")
        div_yield = round(div_raw * 100, 2) if div_raw else None
        market_cap  = _raw(price_mod, "marketCap")
        week52_high = _f(_raw(detail, "fiftyTwoWeekHigh"), 0.0)
        week52_low  = _f(_raw(detail, "fiftyTwoWeekLow"),  0.0)
        gross_m = _raw(fin, "grossMargins")
        roe     = _raw(fin, "returnOnEquity")
        roa     = _raw(fin, "returnOnAssets")

        return {
            "stockId":             stock_id,
            "name":                name,
            "market":              market,
            "peRatio":             pe_ratio,
            "dividendYield":       div_yield,
            "fiftyTwoWeekHigh":    week52_high,
            "fiftyTwoWeekLow":     week52_low,
            "marketCap":           market_cap,
            "discountPremiumRate": None,
            "revenue":             None,
            "grossMargin":         round(gross_m * 100, 2) if gross_m else None,
            "roe":                 round(roe * 100, 2) if roe else None,
            "roa":                 round(roa * 100, 2) if roa else None,
        }
    except Exception:
        return _empty


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
