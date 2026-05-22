"""M4-D 驗證：stocks search/quote/history/profile/chip 結構"""
from tests.helpers import assert_success, assert_keys, assert_no_snake

QUOTE_KEYS   = ["stockId", "name", "price", "change", "changePercent",
                "high", "low", "volume", "marketStatus", "updatedAt"]
HISTORY_KEYS = ["timestamp", "open", "high", "low", "close", "volume"]
PROFILE_KEYS = ["stockId", "name", "market", "peRatio", "dividendYield",
                "fiftyTwoWeekHigh", "fiftyTwoWeekLow", "marketCap",
                "discountPremiumRate", "revenue", "grossMargin", "roe", "roa"]
CHIP_KEYS    = ["date", "foreign", "trust", "dealer"]
SEARCH_KEYS  = ["stockId", "name", "market"]
META_KEYS    = ["count", "updatedAt"]

TEST_STOCK = "2330"  # 台積電，穩定存在的股票


async def test_search_requires_keyword(client):
    res = await client.get("/api/v1/stocks/search")
    assert res.status_code == 400


async def test_search_returns_list(client):
    res = await client.get(f"/api/v1/stocks/search?q={TEST_STOCK}")
    data = assert_success(res)
    assert isinstance(data, list)


async def test_search_items_camel(client):
    res = await client.get("/api/v1/stocks/search?q=台積")
    data = assert_success(res)
    for item in data:
        assert_keys(item, SEARCH_KEYS)
        assert_no_snake(item)


async def test_list_meta_returns_success(client):
    res = await client.get("/api/v1/stocks/list/meta")
    data = assert_success(res)
    assert_keys(data, META_KEYS)
    assert isinstance(data["count"], int)


async def test_get_quote_returns_success(client):
    res = await client.get(f"/api/v1/stocks/{TEST_STOCK}/quote")
    data = assert_success(res)
    assert_keys(data, QUOTE_KEYS)
    assert_no_snake(data)


async def test_get_quote_no_snake(client):
    res = await client.get(f"/api/v1/stocks/{TEST_STOCK}/quote")
    data = assert_success(res)
    assert_no_snake(data)


async def test_get_history_returns_list(client):
    res = await client.get(f"/api/v1/stocks/{TEST_STOCK}/history")
    data = assert_success(res)
    assert isinstance(data, list)


async def test_get_history_items_camel(client):
    res = await client.get(f"/api/v1/stocks/{TEST_STOCK}/history?days=10")
    data = assert_success(res)
    for item in data:
        assert_keys(item, HISTORY_KEYS)
        assert_no_snake(item)


async def test_get_profile_returns_success(client):
    res = await client.get(f"/api/v1/stocks/{TEST_STOCK}/profile")
    data = assert_success(res)
    assert_keys(data, PROFILE_KEYS)
    assert_no_snake(data)


async def test_get_chip_returns_list(client):
    res = await client.get(f"/api/v1/stocks/{TEST_STOCK}/chip")
    data = assert_success(res)
    assert isinstance(data, list)


async def test_get_chip_items_camel(client):
    res = await client.get(f"/api/v1/stocks/{TEST_STOCK}/chip")
    data = assert_success(res)
    for item in data:
        assert_keys(item, CHIP_KEYS)
        assert_no_snake(item)
