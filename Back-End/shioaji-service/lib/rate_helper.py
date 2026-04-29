import asyncio
from lib.cache import get_or_set_async
from lib.yahoo_finance import yf_chart

_FOREX_SYMBOLS = [
    ("USD", "USDTWD=X"),
    ("JPY", "JPYTWD=X"),
    ("EUR", "EURTWD=X"),
    ("CNY", "CNYTWD=X"),
    ("HKD", "HKDTWD=X"),
    ("GBP", "GBPTWD=X"),
    ("AUD", "AUDTWD=X"),
    ("SGD", "SGDTWD=X"),
]


async def _fetch_rates() -> dict[str, float | None]:
    tasks = [yf_chart(sym, {"interval": "1d", "range": "1d"}) for _, sym in _FOREX_SYMBOLS]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    rate_map: dict[str, float | None] = {"TWD": 1.0}
    for (code, _), result in zip(_FOREX_SYMBOLS, results):
        if isinstance(result, Exception):
            rate_map[code] = None
        else:
            price = result.get("meta", {}).get("regularMarketPrice")
            rate_map[code] = round(float(price), 4) if price is not None else None
    return rate_map


async def get_live_rate_map() -> dict[str, float | None]:
    return await get_or_set_async("market:forex-rates", _fetch_rates, 300)
