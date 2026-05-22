from __future__ import annotations

import asyncio
import logging
import re
import subprocess
from datetime import datetime, timezone
from typing import Optional

import httpx
import yfinance as yf

from services.firestore import db

logger = logging.getLogger(__name__)

# ── 代號對照表 ─────────────────────────────────────────────────────────────────

_INDEX_SYMBOLS = [
    {"id": "twii",   "name": "台股大盤",   "symbol": "^TWII"},
    {"id": "nasdaq", "name": "NASDAQ",     "symbol": "^IXIC"},
    {"id": "sp500",  "name": "S&P 500",    "symbol": "^GSPC"},
    {"id": "dji",    "name": "道瓊工業",   "symbol": "^DJI"},
    {"id": "sox",    "name": "費城半導體", "symbol": "^SOX"},
]

_FOREX_SYMBOLS = [
    {"code": "USD", "name": "美元",       "symbol": "USDTWD=X"},
    {"code": "JPY", "name": "日圓",       "symbol": "JPYTWD=X"},
    {"code": "EUR", "name": "歐元",       "symbol": "EURTWD=X"},
    {"code": "CNY", "name": "人民幣",     "symbol": "CNYTWD=X"},
    {"code": "HKD", "name": "港幣",       "symbol": "HKDTWD=X"},
    {"code": "GBP", "name": "英鎊",       "symbol": "GBPTWD=X"},
    {"code": "AUD", "name": "澳幣",       "symbol": "AUDTWD=X"},
    {"code": "SGD", "name": "新加坡幣",   "symbol": "SGDTWD=X"},
]


# ── 工具 ───────────────────────────────────────────────────────────────────────

def _days_to_period(days: int) -> str:
    if days <= 5:   return "5d"
    if days <= 30:  return "1mo"
    if days <= 90:  return "3mo"
    if days <= 180: return "6mo"
    return "1y"


def _fast_price(symbol: str) -> Optional[float]:
    try:
        fi = yf.Ticker(symbol).fast_info
        return getattr(fi, "last_price", None) or getattr(fi, "regular_market_price", None)
    except Exception:
        return None


def _resolve_symbol_sync(stock_id: str) -> str:
    """從 Firestore stock_list 判斷 TSE/OTC，決定 .TW/.TWO 後綴"""
    try:
        doc = db.collection("stock_list").document("data").get()
        if doc.exists:
            stocks = doc.to_dict().get("stocks", [])
            for s in stocks:
                if s.get("code") == stock_id:
                    return f"{stock_id}.TWO" if s.get("market") == "OTC" else f"{stock_id}.TW"
    except Exception:
        pass
    return f"{stock_id}.TW"


async def resolve_symbol(stock_id: str) -> str:
    return await asyncio.to_thread(_resolve_symbol_sync, stock_id)


# ── 個股報價 ───────────────────────────────────────────────────────────────────

async def get_quote(stock_id: str) -> dict:
    symbol = await resolve_symbol(stock_id)

    def _fetch():
        ticker = yf.Ticker(symbol)
        fi = ticker.fast_info
        price = getattr(fi, "last_price", None) or getattr(fi, "regular_market_price", 0)
        prev  = getattr(fi, "previous_close", None) or price
        change      = round(price - prev, 2) if prev else 0.0
        change_pct  = round(change / prev * 100, 2) if prev else 0.0
        return {
            "stockId":      stock_id,
            "name":         getattr(fi, "shortName", stock_id) if hasattr(fi, "shortName") else stock_id,
            "price":        round(float(price), 2),
            "change":       change,
            "changePercent": change_pct,
            "high":         getattr(fi, "day_high", 0) or 0,
            "low":          getattr(fi, "day_low", 0) or 0,
            "volume":       getattr(fi, "three_month_average_volume", 0) or 0,
            "marketStatus": "OPEN" if getattr(fi, "market_state", "") == "REGULAR" else "CLOSED",
            "updatedAt":    int(datetime.now(timezone.utc).timestamp()),
        }

    return await asyncio.to_thread(_fetch)


# ── 歷史 K 線 ──────────────────────────────────────────────────────────────────

async def get_history(stock_id: str, days: int = 90) -> list:
    symbol  = await resolve_symbol(stock_id)
    period  = _days_to_period(days)

    def _fetch():
        data = yf.download(symbol, period=period, interval="1d", progress=False, auto_adjust=True)
        if data.empty:
            return []
        result = []
        for ts, row in data.iterrows():
            close = float(row["Close"].iloc[0]) if hasattr(row["Close"], "iloc") else float(row["Close"])
            if close <= 0:
                continue
            result.append({
                "timestamp": int(ts.timestamp()),
                "open":   round(float(row["Open"].iloc[0])   if hasattr(row["Open"],   "iloc") else float(row["Open"]),   2),
                "high":   round(float(row["High"].iloc[0])   if hasattr(row["High"],   "iloc") else float(row["High"]),   2),
                "low":    round(float(row["Low"].iloc[0])    if hasattr(row["Low"],    "iloc") else float(row["Low"]),    2),
                "close":  round(close, 2),
                "volume": int(row["Volume"].iloc[0] if hasattr(row["Volume"], "iloc") else row["Volume"]),
            })
        return result

    return await asyncio.to_thread(_fetch)


# ── 個股基礎數據 ───────────────────────────────────────────────────────────────

async def get_profile(stock_id: str) -> dict:
    symbol = await resolve_symbol(stock_id)

    def _fetch():
        ticker = yf.Ticker(symbol)
        fi     = ticker.fast_info
        info   = {}
        try:
            info = ticker.info or {}
        except Exception:
            pass

        price = getattr(fi, "last_price", None) or 0

        gross_margin = info.get("grossMargins")
        roe          = info.get("returnOnEquity")
        roa          = info.get("returnOnAssets")
        revenue_raw  = info.get("totalRevenue")

        return {
            "stockId":            stock_id,
            "name":               info.get("longName") or info.get("shortName") or stock_id,
            "market":             info.get("exchange", ""),
            "peRatio":            info.get("trailingPE"),
            "dividendYield":      round(info["dividendYield"] * 100, 2) if info.get("dividendYield") else None,
            "fiftyTwoWeekHigh":   getattr(fi, "year_high", 0) or info.get("fiftyTwoWeekHigh", 0),
            "fiftyTwoWeekLow":    getattr(fi, "year_low",  0) or info.get("fiftyTwoWeekLow",  0),
            "marketCap":          getattr(fi, "market_cap", None) or info.get("marketCap"),
            "discountPremiumRate": None,
            "revenue":            round(revenue_raw / 1e8, 2) if revenue_raw else None,
            "grossMargin":        round(gross_margin * 100, 2) if gross_margin is not None else None,
            "roe":                round(roe * 100, 2) if roe is not None else None,
            "roa":                round(roa * 100, 2) if roa is not None else None,
        }

    return await asyncio.to_thread(_fetch)


# ── 市場指數 ───────────────────────────────────────────────────────────────────

def _fetch_index_card_sync(entry: dict) -> dict:
    try:
        fi = yf.Ticker(entry["symbol"]).fast_info
        price = getattr(fi, "last_price", None) or getattr(fi, "regular_market_price", None)
        prev  = getattr(fi, "previous_close", None)
        if price and prev:
            change     = round(price - prev, 2)
            change_pct = round(change / prev * 100, 2)
        else:
            change = change_pct = None
        return {"id": entry["id"], "name": entry["name"], "price": price, "change": change, "changePercent": change_pct}
    except Exception:
        return {"id": entry["id"], "name": entry["name"], "price": None, "change": None, "changePercent": None}


async def _fetch_taiwan_futures() -> dict:
    """爬取 Yahoo Finance TW 頁面取得台指期即時報價"""
    fallback = {"id": "futures", "name": "台指期", "price": None, "change": None, "changePercent": None}
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "zh-TW,zh;q=0.9",
        }
        async with httpx.AsyncClient(timeout=10, verify=False) as client:
            resp = await client.get("https://tw.stock.yahoo.com/future/WTX%26", headers=headers)
        html = resp.text
        section_idx = html.find("main-1-FutureHeader-Proxy")
        if section_idx == -1:
            return fallback
        section = html[section_idx: section_idx + 2000]
        is_down = "c-trend-down" in section
        price_m = re.search(r"Fz\(32px\)[^>]+?>([\d,]+\.?\d*)<", section)
        if not price_m:
            return fallback
        price = float(price_m.group(1).replace(",", ""))
        pct_m = re.search(r"\(([\d.]+)%\)", section)
        pct_abs = float(pct_m.group(1)) if pct_m else None
        change_pct = (-pct_abs if is_down else pct_abs) if pct_abs is not None else None
        chg_m = re.search(r'style="border-color:[^"]+"><\/span>([\d,]+\.?\d*)<', section)
        chg_abs = float(chg_m.group(1).replace(",", "")) if chg_m else None
        change = (-chg_abs if is_down else chg_abs) if chg_abs is not None else None
        return {"id": "futures", "name": "台指期", "price": price, "change": change, "changePercent": change_pct}
    except Exception as e:
        logger.debug("Taiwan futures scrape failed: %s", e)
        return fallback


async def fetch_indices() -> list:
    cards_raw, futures_card = await asyncio.gather(
        asyncio.gather(*[asyncio.to_thread(_fetch_index_card_sync, e) for e in _INDEX_SYMBOLS]),
        _fetch_taiwan_futures(),
    )
    cards = list(cards_raw)
    cards.insert(1, futures_card)  # 台指期插入 twii 之後
    return cards


# ── 匯率 ───────────────────────────────────────────────────────────────────────

async def fetch_forex_rates() -> list:
    async def _one(entry):
        try:
            fi = yf.Ticker(entry["symbol"]).fast_info
            rate = getattr(fi, "last_price", None) or getattr(fi, "regular_market_price", None)
            return {"code": entry["code"], "name": entry["name"], "rate": round(float(rate), 4) if rate else None}
        except Exception:
            return {"code": entry["code"], "name": entry["name"], "rate": None}

    results = await asyncio.gather(*[asyncio.to_thread(lambda e=e: {
        "code": e["code"], "name": e["name"],
        "rate": round(float(r), 4) if (r := _fast_price(e["symbol"])) else None
    }) for e in _FOREX_SYMBOLS])
    return list(results)


# ── 出口景氣燈號（NDC） ────────────────────────────────────────────────────────

def _score_to_light(score: float) -> str:
    if score >= 38: return "red"
    if score >= 32: return "yellow-red"
    if score >= 23: return "green"
    if score >= 17: return "yellow-blue"
    return "blue"


_LIGHT_LABELS = {"red": "紅燈", "yellow-red": "黃紅燈", "green": "綠燈", "yellow-blue": "黃藍燈", "blue": "藍燈"}

_FALLBACK_INDICATOR = {"period": "-", "score": None, "light": None, "lightLabel": None}


async def fetch_export_indicator() -> dict:
    def _fetch():
        import tempfile, os, json as _json
        BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36"
        cookie_file = os.path.join(tempfile.gettempdir(), f"ndc_{os.urandom(4).hex()}.txt")
        try:
            page = subprocess.run(
                ["curl", "-s", "--compressed", "--max-time", "15",
                 "-c", cookie_file,
                 "-H", f"User-Agent: {BROWSER_UA}",
                 "-H", "Accept-Language: zh-TW,zh;q=0.9,en;q=0.8",
                 "https://index.ndc.gov.tw/n/zh_tw/data/eco/indicators_table1"],
                capture_output=True, text=True, timeout=20
            )
            csrf_m = re.search(r'csrf-token"\s+content="([^"]+)"', page.stdout)
            if not csrf_m:
                return _FALLBACK_INDICATOR
            csrf = csrf_m.group(1)
            api_resp = subprocess.run(
                ["curl", "-s", "--compressed", "--max-time", "15",
                 "-b", cookie_file,
                 "-X", "POST",
                 "-H", f"User-Agent: {BROWSER_UA}",
                 "-H", "Content-Type: application/json",
                 "-H", f"X-CSRF-TOKEN: {csrf}",
                 "-H", "Referer: https://index.ndc.gov.tw/n/zh_tw/data/eco/indicators_table1",
                 "https://index.ndc.gov.tw/n/json/data/eco/indicators"],
                capture_output=True, text=True, timeout=20
            )
            payload = _json.loads(api_resp.stdout)
            line_obj = payload.get("line", {})
            sr5 = next((v for v in line_obj.values() if isinstance(v, dict) and v.get("code") == "SR0005"), None)
            if not sr5:
                return _FALLBACK_INDICATOR
            valid = [d for d in sr5.get("data", []) if d.get("y") is not None]
            if not valid:
                return _FALLBACK_INDICATOR
            latest = valid[-1]
            raw_x = str(latest["x"])
            period = f"{raw_x[:4]}-{raw_x[4:6]}" if len(raw_x) == 6 else raw_x
            score = float(latest["y"])
            light = _score_to_light(score)
            return {"period": period, "score": score, "light": light, "lightLabel": _LIGHT_LABELS.get(light, "-")}
        except Exception as e:
            logger.debug("NDC export indicator failed: %s", e)
            return _FALLBACK_INDICATOR
        finally:
            try:
                os.unlink(cookie_file)
            except Exception:
                pass

    return await asyncio.to_thread(_fetch)


# ── VIX 收盤價（供 Snapshot 使用） ────────────────────────────────────────────

async def get_vix() -> Optional[float]:
    def _fetch():
        try:
            data = yf.download("^VIX", period="5d", interval="1d", progress=False, auto_adjust=True)
            if data.empty:
                return None
            close_col = data["Close"]
            last = close_col.dropna()
            if last.empty:
                return None
            val = last.iloc[-1]
            return float(val.iloc[0] if hasattr(val, "iloc") else val)
        except Exception:
            return None

    return await asyncio.to_thread(_fetch)
