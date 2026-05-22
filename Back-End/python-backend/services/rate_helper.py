from services.yahoo_finance import get_forex_rates


def get_live_rate_map() -> dict[str, float | None]:
    """回傳 {幣別代碼: 台幣匯率} dict，TWD 固定為 1"""
    rates = get_forex_rates()
    rate_map: dict[str, float | None] = {"TWD": 1.0}
    for r in rates:
        rate_map[r["code"]] = r["rate"]
    return rate_map
