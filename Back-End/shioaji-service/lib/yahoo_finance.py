import httpx
from typing import Any, Optional

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
}
_BASE = "https://query1.finance.yahoo.com"


async def yf_chart(symbol: str, params: dict = {}) -> dict:
    async with httpx.AsyncClient(timeout=10.0) as client:
        url = f"{_BASE}/v8/finance/chart/{symbol}"
        res = await client.get(url, params=params, headers=_HEADERS)
        res.raise_for_status()
        result = res.json().get("chart", {}).get("result", [None])[0]
        if not result:
            raise ValueError(f"Yahoo Finance: 無法取得 {symbol} 資料")
        return result


async def yf_quote_summary(symbol: str, modules: str) -> Optional[dict]:
    async with httpx.AsyncClient(timeout=10.0) as client:
        url = f"{_BASE}/v10/finance/quoteSummary/{symbol}"
        res = await client.get(url, params={"modules": modules}, headers=_HEADERS)
        res.raise_for_status()
        results = res.json().get("quoteSummary", {}).get("result", [])
        return results[0] if results else None
