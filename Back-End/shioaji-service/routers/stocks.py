import asyncio
from datetime import datetime, timedelta, timezone, time as dt_time
from fastapi import APIRouter, HTTPException, Query
from lib.shioaji_state import get_api
from lib.cache import get_or_set_async
from lib.yahoo_finance import yf_chart, yf_quote_summary
import lib.api_response as R
import httpx

router = APIRouter()

_TZ_TW = timezone(timedelta(hours=8))


def _market_status() -> str:
    now = datetime.now(tz=_TZ_TW)
    if now.weekday() >= 5:
        return "CLOSED"
    t = now.time()
    return "OPEN" if dt_time(9, 0) <= t <= dt_time(13, 30) else "CLOSED"


# ── 股票清單（Shioaji，TTL 3600s） ──────────────────────────────────────────────

async def _fetch_all_stocks():
    api = get_api()
    return [
        {"stockId": c.code, "name": c.name, "market": c.exchange}
        for c in api.Contracts.Stocks
    ]


# ── GET /api/v1/stocks/search?q= ────────────────────────────────────────────

@router.get("/search")
async def search(q: str = Query(default="")):
    q = q.strip()
    if not q:
        raise HTTPException(400, "請提供搜尋關鍵字 ?q=")
    all_stocks = await get_or_set_async(
        "stocks:all-list",
        _fetch_all_stocks,
        3600,
        valid=lambda lst: len(lst) > 0,
    )
    keyword = q.lower()
    results = [
        s for s in all_stocks
        if s["stockId"].startswith(keyword) or keyword in s["name"].lower()
    ]
    return R.success(results[:20])


# ── GET /api/v1/stocks/:id/quote ────────────────────────────────────────────

async def _fetch_snapshot(stock_id: str) -> dict:
    api = get_api()
    try:
        contract = api.Contracts.Stocks[stock_id]
    except (KeyError, TypeError):
        raise HTTPException(404, f"Stock {stock_id} not found")

    snaps = api.snapshots([contract])
    if snaps:
        snap = snaps[0]
        return {
            "stockId": stock_id,
            "name": contract.name,
            "price": snap.close,
            "change": round(snap.change_price, 2),
            "changePercent": round(snap.change_rate, 2),
            "open": snap.open,
            "high": snap.high,
            "low": snap.low,
            "volume": snap.total_volume,
            "marketStatus": _market_status(),
            "updatedAt": snap.ts // 1_000_000_000,
        }

    # Fallback: Yahoo Finance（Shioaji 休市 / 無快照時）
    yf_symbol = f"{stock_id}.TWO" if getattr(contract, "exchange", "") == "OTC" else f"{stock_id}.TW"
    result = await yf_chart(yf_symbol, {"interval": "1d", "range": "5d"})
    meta   = result.get("meta", {})
    price  = meta.get("regularMarketPrice")
    prev   = meta.get("chartPreviousClose")
    change  = round(price - prev, 2) if price is not None and prev else None
    chg_pct = round((price - prev) / prev * 100, 2) if price is not None and prev else None
    return {
        "stockId": stock_id,
        "name": contract.name,
        "price": price,
        "change": change,
        "changePercent": chg_pct,
        "open": meta.get("regularMarketOpen"),
        "high": meta.get("regularMarketDayHigh"),
        "low": meta.get("regularMarketDayLow"),
        "volume": meta.get("regularMarketVolume"),
        "marketStatus": _market_status(),
        "updatedAt": None,
    }


@router.get("/{stock_id}/quote")
async def get_quote(stock_id: str):
    data = await get_or_set_async(
        f"stock:quote:{stock_id}",
        lambda: _fetch_snapshot(stock_id),
        60,
    )
    return R.success(data)


# ── GET /api/v1/stocks/:id/history?days= ────────────────────────────────────

@router.get("/{stock_id}/history")
async def get_history(stock_id: str, days: int = Query(default=90, ge=1, le=365)):
    api = get_api()
    try:
        contract = api.Contracts.Stocks[stock_id]
    except (KeyError, TypeError):
        raise HTTPException(404, f"Stock {stock_id} not found")

    end_dt   = datetime.now(tz=_TZ_TW)
    start_dt = end_dt - timedelta(days=int(days * 1.5) + 10)
    kbars    = api.kbars(
        contract=contract,
        start=start_dt.strftime("%Y-%m-%d"),
        end=end_dt.strftime("%Y-%m-%d"),
    )

    daily: dict[str, dict] = {}
    for i in range(len(kbars.ts)):
        dt  = datetime.fromtimestamp(kbars.ts[i] / 1e9, tz=_TZ_TW)
        key = dt.strftime("%Y-%m-%d")
        if key not in daily:
            day_start = dt.replace(hour=0, minute=0, second=0, microsecond=0)
            daily[key] = {
                "timestamp": int(day_start.timestamp()),
                "open": kbars.Open[i],
                "high": kbars.High[i],
                "low": kbars.Low[i],
                "close": kbars.Close[i],
                "volume": kbars.Volume[i],
            }
        else:
            d = daily[key]
            d["high"]   = max(d["high"], kbars.High[i])
            d["low"]    = min(d["low"],  kbars.Low[i])
            d["close"]  = kbars.Close[i]
            d["volume"] += kbars.Volume[i]

    sorted_bars = [daily[k] for k in sorted(daily.keys())]
    result = sorted_bars[-days:] if len(sorted_bars) > days else sorted_bars
    return R.success(result)


# ── GET /api/v1/stocks/:id/profile ──────────────────────────────────────────

async def _resolve_symbol(stock_id: str) -> str:
    all_stocks = await get_or_set_async(
        "stocks:all-list",
        _fetch_all_stocks,
        3600,
        valid=lambda lst: len(lst) > 0,
    )
    found = next((s for s in all_stocks if s["stockId"] == stock_id), None)
    if found:
        return f"{stock_id}.TWO" if found["market"] == "OTC" else f"{stock_id}.TW"
    return f"{stock_id}.TW"


async def _fetch_profile(stock_id: str) -> dict:
    symbol      = await _resolve_symbol(stock_id)
    chart_result = await yf_chart(symbol, {"interval": "1d", "range": "1d"})
    meta         = chart_result.get("meta", {})

    pe_ratio       = None
    dividend_yield = None
    market_cap     = None
    revenue        = None
    gross_margin   = None
    roe            = None
    roa            = None

    try:
        summary = await yf_quote_summary(
            symbol,
            "summaryDetail,defaultKeyStatistics,price,financialData,incomeStatementHistoryQuarterly",
        )
        if summary:
            sd  = summary.get("summaryDetail", {})
            pr  = summary.get("price", {})
            fd  = summary.get("financialData", {})
            qis = (summary.get("incomeStatementHistoryQuarterly") or {}).get("incomeStatementHistory", [])

            pe_ratio = (sd.get("trailingPE") or {}).get("raw")
            dy_raw   = (sd.get("dividendYield") or {}).get("raw")
            dividend_yield = round(dy_raw * 100, 2) if dy_raw is not None else None
            mc_raw   = (pr.get("marketCap") or {}).get("raw") or (sd.get("marketCap") or {}).get("raw")
            market_cap = mc_raw

            gm_raw = (fd.get("grossMargins") or {}).get("raw")
            gross_margin = round(gm_raw * 100, 2) if gm_raw is not None else None
            roe_raw = (fd.get("returnOnEquity") or {}).get("raw")
            roe = round(roe_raw * 100, 2) if roe_raw is not None else None
            roa_raw = (fd.get("returnOnAssets") or {}).get("raw")
            roa = round(roa_raw * 100, 2) if roa_raw is not None else None

            if qis:
                latest_q = qis[0]
                rev_raw  = (latest_q.get("totalRevenue") or {}).get("raw")
                revenue  = round(rev_raw / 1e8, 2) if rev_raw is not None else None
    except Exception:
        pass

    return {
        "stockId": stock_id,
        "name": meta.get("longName") or meta.get("shortName") or stock_id,
        "market": meta.get("exchangeName", ""),
        "peRatio": pe_ratio,
        "dividendYield": dividend_yield,
        "fiftyTwoWeekHigh": meta.get("fiftyTwoWeekHigh"),
        "fiftyTwoWeekLow": meta.get("fiftyTwoWeekLow"),
        "marketCap": market_cap,
        "discountPremiumRate": None,
        "revenue": revenue,
        "grossMargin": gross_margin,
        "roe": roe,
        "roa": roa,
    }


@router.get("/{stock_id}/profile")
async def get_profile(stock_id: str):
    data = await get_or_set_async(
        f"stock:profile:{stock_id}",
        lambda: _fetch_profile(stock_id),
        300,
    )
    return R.success(data)


# ── GET /api/v1/stocks/:id/chip ─────────────────────────────────────────────

async def _fetch_t86_rows(stock_id: str, date: datetime) -> list[dict]:
    date_str = date.strftime("%Y%m01")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(
                "https://www.twse.com.tw/rwd/zh/fund/T86",
                params={"date": date_str, "stockNo": stock_id, "response": "json"},
                headers={"User-Agent": "Mozilla/5.0"},
            )
            data = res.json()
        if data.get("stat") != "OK" or not isinstance(data.get("data"), list):
            return []

        def parse(s: str) -> int:
            try:
                return int((s or "0").replace(",", ""))
            except ValueError:
                return 0

        rows = []
        for row in data["data"]:
            parts    = (row[0] or "").split("/")
            iso_date = f"{int(parts[0]) + 1911}-{parts[1]}-{parts[2]}"
            rows.append({
                "date":    iso_date,
                "foreign": round((parse(row[1]) + parse(row[2])) / 1000),
                "trust":   round(parse(row[3]) / 1000),
                "dealer":  round((parse(row[4]) + parse(row[5])) / 1000),
            })
        return rows
    except Exception:
        return []


async def _fetch_chip(stock_id: str) -> list[dict]:
    today = datetime.now(tz=_TZ_TW)
    rows  = await _fetch_t86_rows(stock_id, today)
    if len(rows) < 20:
        prev_month = today.replace(day=1) - timedelta(days=1)
        prev = await _fetch_t86_rows(stock_id, prev_month)
        rows = prev + rows
    return rows[-20:]


@router.get("/{stock_id}/chip")
async def get_chip(stock_id: str):
    data = await get_or_set_async(
        f"stock:chip:{stock_id}",
        lambda: _fetch_chip(stock_id),
        300,
    )
    return R.success(data)
