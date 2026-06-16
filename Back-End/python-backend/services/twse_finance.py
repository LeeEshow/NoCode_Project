"""
TWSE 官方收盤價服務

盤後（13:30 之後）從 TWSE STOCK_DAY API 取得當日收盤資料，
取代 Yahoo Finance，避免 Azure 雲端 IP 被 Yahoo 封鎖造成 Timeout。

僅支援 TSE 上市股票（含 ETF）。
OTC 上櫃股票回傳 None，由呼叫方 fallback 至 Yahoo Finance。
"""

import logging
import requests
from datetime import datetime, timezone, timedelta

from services.cache import cache_get, cache_set
from services.api_switch import twse_cb
from core.executors import twse_sem

logger = logging.getLogger(__name__)

_TW_TZ = timezone(timedelta(hours=8))

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
}

# 收盤價快取 30 分鐘（當日收盤後不再變動）
_CACHE_TTL = 1800


def _parse_num(s) -> float | None:
    """安全解析 TWSE 數字字串（含千分位逗號與正負號）。"""
    try:
        cleaned = str(s).replace(",", "").strip()
        if cleaned in ("--", "", "除息", "除權", "X"):
            return None
        return float(cleaned)   # float() 原生支援 "+55.00" / "-10.00"
    except Exception:
        return None


def get_twse_closing_price(stock_id: str) -> dict | None:
    """
    從 TWSE STOCK_DAY API 取得當日收盤報價（僅限 TSE 上市股票）。

    回傳格式：
        {price, change, changePercent, high, low, volume}
    查無資料（非交易日、停牌、API 失敗）→ 回傳 None。
    """
    cache_key = f"twse:closing:{stock_id}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    tw_now = datetime.now(_TW_TZ)
    date_str = tw_now.strftime("%Y%m%d")

    result = _fetch_twse(stock_id, date_str)
    if result is not None:
        cache_set(cache_key, result, _CACHE_TTL)
    return result


def _fetch_twse(stock_id: str, date_str: str) -> dict | None:
    """
    呼叫 TWSE exchangeReport/STOCK_DAY，解析最後一筆收盤資料。

    API fields 順序（官方固定）：
      [0] 日期  [1] 成交股數  [2] 成交金額  [3] 開盤價
      [4] 最高價 [5] 最低價   [6] 收盤價    [7] 漲跌價差  [8] 成交筆數
    """
    def _call():
        with twse_sem:
            res = requests.get(
                "https://www.twse.com.tw/exchangeReport/STOCK_DAY",
                params={"response": "json", "date": date_str, "stockNo": stock_id},
                timeout=10,
                headers=_HEADERS,
            )
            res.raise_for_status()
            return res.json()

    try:
        data = twse_cb.call(_call)

        if data.get("stat") != "OK":
            logger.debug("TWSE STOCK_DAY stat != OK: %s %s", stock_id, data.get("stat"))
            return None

        rows = data.get("data") or []
        if not rows:
            logger.debug("TWSE STOCK_DAY 無資料: %s", stock_id)
            return None

        last = rows[-1]
        close = _parse_num(last[6])
        if close is None or close <= 0:
            # 停牌或無成交（收盤價欄位為 "--"）
            return None

        change = _parse_num(last[7]) or 0.0

        # 前一日收盤 = 今日收盤 - 今日漲跌價差（避免額外 API 呼叫）
        prev_close = close - change
        change_pct = round(change / prev_close * 100, 2) if prev_close else 0.0

        return {
            "price":         close,
            "change":        change,
            "changePercent": change_pct,
            "high":          _parse_num(last[4]) or 0.0,
            "low":           _parse_num(last[5]) or 0.0,
            "volume":        int(_parse_num(last[1]) or 0),
        }

    except Exception as e:
        logger.warning("TWSE API 查詢失敗 %s: %s", stock_id, e)
        return None
