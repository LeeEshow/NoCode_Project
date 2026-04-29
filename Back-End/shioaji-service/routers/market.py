import asyncio
import httpx
from fastapi import APIRouter
from lib.shioaji_state import get_api
from lib.cache import get_or_set_async
from lib.yahoo_finance import yf_chart
from lib.rate_helper import get_live_rate_map, _FOREX_SYMBOLS
import lib.api_response as R

router = APIRouter()

_US_INDEX_SYMBOLS = [
    {"id": "nasdaq", "name": "NASDAQ",     "symbol": "^IXIC"},
    {"id": "sp500",  "name": "S&P 500",    "symbol": "^GSPC"},
    {"id": "dji",    "name": "道瓊工業",   "symbol": "^DJI"},
    {"id": "sox",    "name": "費城半導體", "symbol": "^SOX"},
]


async def _fetch_twii() -> dict:
    api = get_api()
    try:
        snaps = api.snapshots([api.Contracts.Indexs.TSE["001"]])
        if not snaps:
            raise ValueError("empty")
        snap = snaps[0]
        return {
            "id": "twii",
            "name": "台股大盤",
            "price": snap.close,
            "change": round(snap.change_price, 2),
            "changePercent": round(snap.change_rate, 2),
        }
    except Exception:
        pass

    # Fallback: Yahoo Finance ^TWII（休市 / Shioaji 無資料時）
    try:
        result = await yf_chart("^TWII", {"interval": "1d", "range": "1d"})
        meta   = result.get("meta", {})
        price  = meta.get("regularMarketPrice")
        prev   = meta.get("chartPreviousClose")
        change  = round(price - prev, 2) if price is not None and prev else None
        chg_pct = round((price - prev) / prev * 100, 2) if price is not None and prev else None
        return {"id": "twii", "name": "台股大盤", "price": price, "change": change, "changePercent": chg_pct}
    except Exception as exc:
        print(f"[market] ❌ get_twii YF fallback error: {exc}")
        return {"id": "twii", "name": "台股大盤", "price": None, "change": None, "changePercent": None}


async def _fetch_futures() -> dict:
    api = get_api()
    try:
        txf_contracts = list(api.Contracts.Futures.TXF)
        if not txf_contracts:
            raise ValueError("no TXF contracts")
        near_month = min(txf_contracts, key=lambda c: c.symbol)
        snaps = api.snapshots([near_month])
        if not snaps:
            raise ValueError("empty snapshot")
        snap = snaps[0]
        return {
            "id": "futures",
            "name": "台指期",
            "price": snap.close,
            "change": round(snap.change_price, 2),
            "changePercent": round(snap.change_rate, 2),
        }
    except Exception as exc:
        print(f"[market] ❌ get_futures error: {exc}")
        # 台指期無通用 YF 替代，回傳 null（前端顯示 —）
        return {"id": "futures", "name": "台指期", "price": None, "change": None, "changePercent": None}


async def _fetch_indices() -> list[dict]:
    twii_task    = _fetch_twii()
    futures_task = _fetch_futures()
    us_tasks     = [yf_chart(s["symbol"], {"interval": "1d", "range": "1d"}) for s in _US_INDEX_SYMBOLS]

    twii_card, futures_card, *us_results = await asyncio.gather(
        twii_task, futures_task, *us_tasks, return_exceptions=True
    )

    us_cards = []
    for idx_info, result in zip(_US_INDEX_SYMBOLS, us_results):
        if isinstance(result, Exception):
            us_cards.append({**idx_info, "price": None, "change": None, "changePercent": None})
        else:
            meta  = result.get("meta", {})
            price = meta.get("regularMarketPrice")
            prev  = meta.get("chartPreviousClose")
            change = round(price - prev, 2) if price is not None and prev else None
            chg_pct = round((price - prev) / prev * 100, 2) if price is not None and prev else None
            us_cards.append({"id": idx_info["id"], "name": idx_info["name"],
                              "price": price, "change": change, "changePercent": chg_pct})

    return [twii_card, futures_card, *us_cards]


# ── GET /api/v1/market/indices ──────────────────────────────────────────────

@router.get("/indices")
async def get_indices():
    data = await get_or_set_async("market:indices", _fetch_indices, 60)
    return R.success(data)


# ── GET /api/v1/market/forex-rates ─────────────────────────────────────────

async def _fetch_forex_rates() -> list[dict]:
    tasks = [yf_chart(sym, {"interval": "1d", "range": "1d"}) for _, sym in _FOREX_SYMBOLS]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    output = []
    for (code, _), result in zip(_FOREX_SYMBOLS, results):
        name_map = {
            "USD": "美元", "JPY": "日圓", "EUR": "歐元", "CNY": "人民幣",
            "HKD": "港幣", "GBP": "英鎊", "AUD": "澳幣", "SGD": "新加坡幣",
        }
        if isinstance(result, Exception):
            output.append({"code": code, "name": name_map.get(code, code), "rate": None})
        else:
            price = result.get("meta", {}).get("regularMarketPrice")
            rate  = round(float(price), 4) if price is not None else None
            output.append({"code": code, "name": name_map.get(code, code), "rate": rate})
    return output


@router.get("/forex-rates")
async def get_forex_rates():
    data = await get_or_set_async("market:forex-rates-list", _fetch_forex_rates, 300)
    return R.success(data)


# ── GET /api/v1/market/export-indicator ────────────────────────────────────

def _ndc_sync_fetch() -> dict | None:
    import cloudscraper
    import re
    scraper = cloudscraper.create_scraper(
        browser={"browser": "chrome", "platform": "windows", "mobile": False}
    )
    r = scraper.get(
        "https://index.ndc.gov.tw/n/zh_tw/data/eco/indicators_table1",
        timeout=20,
    )
    m = re.search(r'csrf-token"\s+content="([^"]+)"', r.text)
    if not m:
        print(f"[market] NDC 無法取得 CSRF token，HTTP {r.status_code}")
        return None
    csrf_token = m.group(1)
    r2 = scraper.post(
        "https://index.ndc.gov.tw/n/json/data/eco/indicators",
        json={},
        headers={
            "X-CSRF-TOKEN": csrf_token,
            "Content-Type": "application/json",
            "Referer": "https://index.ndc.gov.tw/n/zh_tw/data/eco/indicators_table1",
        },
        timeout=20,
    )
    return r2.json()


async def _fetch_export_indicator() -> dict:
    try:
        payload = await asyncio.to_thread(_ndc_sync_fetch)
        if payload is None:
            return {"period": "-", "score": None, "light": None, "lightLabel": None}

        line_obj = payload.get("line")
        if not line_obj:
            print("[market] NDC API 回傳無 line 資料")
            return {"period": "-", "score": None, "light": None, "lightLabel": None}

        line_items = list(line_obj.values())
        sr5 = next((item for item in line_items if item.get("code") == "SR0005"), None)
        if not sr5:
            print("[market] NDC API 找不到 SR0005")
            return {"period": "-", "score": None, "light": None, "lightLabel": None}

        valid_data = [d for d in sr5.get("data", []) if d.get("y") is not None]
        if not valid_data:
            return {"period": "-", "score": None, "light": None, "lightLabel": None}

        latest = valid_data[-1]
        raw_x  = str(latest["x"])
        period = f"{raw_x[:4]}-{raw_x[4:6]}" if len(raw_x) == 6 else raw_x
        score  = float(latest["y"])
        light  = _score_to_light(score)
        return {"period": period, "score": score, "light": light, "lightLabel": _light_to_label(light)}

    except Exception as exc:
        print(f"[market] NDC 景氣燈號 API 失敗: {exc}")
        return {"period": "-", "score": None, "light": None, "lightLabel": None}


def _score_to_light(score: float) -> str:
    if score >= 38: return "red"
    if score >= 32: return "yellow-red"
    if score >= 23: return "green"
    if score >= 17: return "yellow-blue"
    return "blue"


def _light_to_label(light: str) -> str:
    return {"red": "紅燈", "yellow-red": "黃紅燈", "green": "綠燈",
            "yellow-blue": "黃藍燈", "blue": "藍燈"}.get(light, "-")


@router.get("/export-indicator")
async def get_export_indicator():
    data = await get_or_set_async("market:export-indicator", _fetch_export_indicator, 3600)
    return R.success(data)
