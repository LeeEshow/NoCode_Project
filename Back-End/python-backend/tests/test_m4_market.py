"""M4-C 驗證：indices/forex-rates 結構"""
from tests.helpers import assert_success, assert_keys, assert_no_snake

INDEX_KEYS = ["id", "name", "price", "change", "changePercent"]
FOREX_KEYS = ["code", "name", "rate"]

INDEX_IDS = {"twii", "futures", "nasdaq", "sp500", "dji", "sox"}


async def test_get_indices_returns_success(client):
    res = await client.get("/api/v1/market/indices")
    data = assert_success(res)
    assert isinstance(data, list)


async def test_get_indices_has_six_cards(client):
    res = await client.get("/api/v1/market/indices")
    data = assert_success(res)
    assert len(data) == 6, f"市場指數應為 6 筆，實際：{len(data)}"


async def test_get_indices_items_camel(client):
    res = await client.get("/api/v1/market/indices")
    data = assert_success(res)
    for item in data:
        assert_keys(item, INDEX_KEYS)
        assert_no_snake(item)


async def test_get_indices_ids_correct(client):
    res = await client.get("/api/v1/market/indices")
    data = assert_success(res)
    ids = {item["id"] for item in data}
    assert ids == INDEX_IDS, f"指數 ID 不符：{ids}"


async def test_get_indices_futures_at_position_1(client):
    res = await client.get("/api/v1/market/indices")
    data = assert_success(res)
    assert data[0]["id"] == "twii"
    assert data[1]["id"] == "futures"


async def test_get_forex_rates_returns_success(client):
    res = await client.get("/api/v1/market/forex-rates")
    data = assert_success(res)
    assert isinstance(data, list)


async def test_get_forex_rates_has_eight_items(client):
    res = await client.get("/api/v1/market/forex-rates")
    data = assert_success(res)
    assert len(data) == 8, f"匯率應為 8 筆，實際：{len(data)}"


async def test_get_forex_rates_items_camel(client):
    res = await client.get("/api/v1/market/forex-rates")
    data = assert_success(res)
    for item in data:
        assert_keys(item, FOREX_KEYS)
        assert_no_snake(item)


async def test_get_forex_rates_order(client):
    res = await client.get("/api/v1/market/forex-rates")
    data = assert_success(res)
    codes = [item["code"] for item in data]
    assert codes == ["USD", "JPY", "EUR", "CNY", "HKD", "GBP", "AUD", "SGD"]
