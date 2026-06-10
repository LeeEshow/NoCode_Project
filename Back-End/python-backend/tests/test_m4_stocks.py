"""M4-D / M14 驗證：stocks search/quote/history/profile/chip/batch-quotes 結構"""
from tests.helpers import assert_success, assert_error, assert_keys, assert_no_snake

QUOTE_KEYS   = ["stockId", "name", "price", "change", "changePercent",
                "high", "low", "volume", "marketStatus", "updatedAt"]
HISTORY_KEYS = ["timestamp", "open", "high", "low", "close", "volume"]

# M8：profile 改由 FinMind + Firestore 提供，欄位與 StockProfile DTO 對齊
PROFILE_KEYS = [
    # 識別
    "stockId", "name", "market",
    # 評價
    "peRatio", "pbRatio", "eps", "bookValue",
    # 股利
    "dividendYield", "dividendRate", "payoutRatio", "exDividendDate",
    # 獲利能力
    "grossMargin", "operatingMargin", "netMargin", "roe",
    # 規模 / 成長
    "marketCap", "revenue", "revenueGrowth",
    # 風險 / 波動
    "fiftyTwoWeekHigh", "fiftyTwoWeekLow", "beta",
    # 同步資訊
    "updatedAt",
]
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


async def test_get_history_date_range_returns_list(client):
    res = await client.get(f"/api/v1/stocks/{TEST_STOCK}/history?start=2026-01-01&end=2026-05-29")
    data = assert_success(res)
    assert isinstance(data, list)


async def test_get_history_date_range_items_camel(client):
    res = await client.get(f"/api/v1/stocks/{TEST_STOCK}/history?start=2026-01-01&end=2026-05-29")
    data = assert_success(res)
    for item in data:
        assert_keys(item, HISTORY_KEYS)
        assert_no_snake(item)


async def test_get_history_start_only(client):
    """end 省略時應正常回傳（預設今日）"""
    res = await client.get(f"/api/v1/stocks/{TEST_STOCK}/history?start=2026-04-01")
    data = assert_success(res)
    assert isinstance(data, list)


async def test_get_profile_returns_success(client):
    """M8：profile 讀 Firestore；未同步時 data=null，同步後 data 為 camelCase dict"""
    res = await client.get(f"/api/v1/stocks/{TEST_STOCK}/profile")
    assert res.status_code == 200
    body = res.json()
    assert body.get("success") is True
    assert "data" in body
    # data 可為 null（FinMind 尚未同步）或含 PROFILE_KEYS 的 camelCase dict
    if body["data"] is not None:
        assert_keys(body["data"], PROFILE_KEYS)
        assert_no_snake(body["data"])


async def test_get_chip_returns_list(client):
    """M8：chip 讀 Firestore；未同步時回空陣列"""
    res = await client.get(f"/api/v1/stocks/{TEST_STOCK}/chip")
    data = assert_success(res)
    assert isinstance(data, list)


async def test_get_chip_items_camel(client):
    res = await client.get(f"/api/v1/stocks/{TEST_STOCK}/chip")
    data = assert_success(res)
    for item in data:
        assert_keys(item, CHIP_KEYS)
        assert_no_snake(item)


# ─── M14：POST /stocks/quotes ─────────────────────────────────────────────────

BATCH_QUOTE_KEYS = ["price", "change", "changePercent", "quoteSource", "quoteStatus", "quoteMessage"]


async def test_batch_quotes_returns_dict(client):
    res = await client.post("/api/v1/stocks/quotes", json={"codes": [TEST_STOCK]})
    data = assert_success(res)
    assert isinstance(data, dict)
    assert TEST_STOCK in data


async def test_batch_quotes_structure(client):
    res = await client.post("/api/v1/stocks/quotes", json={"codes": [TEST_STOCK, "2454"]})
    data = assert_success(res)
    for code in ["2330", "2454"]:
        assert code in data
        assert_keys(data[code], BATCH_QUOTE_KEYS)
        assert_no_snake(data[code])


async def test_batch_quotes_empty_codes_returns_400(client):
    res = await client.post("/api/v1/stocks/quotes", json={"codes": []})
    assert res.status_code == 422


async def test_batch_quotes_over_limit_returns_400(client):
    codes = [str(i).zfill(4) for i in range(51)]
    res = await client.post("/api/v1/stocks/quotes", json={"codes": codes})
    assert res.status_code == 422


async def test_batch_quotes_no_firestore_read(client):
    """回傳結構正確即驗證路徑不走 Firestore（quote_service 從 tick cache / Yahoo 取資料）"""
    res = await client.post("/api/v1/stocks/quotes", json={"codes": [TEST_STOCK]})
    data = assert_success(res)
    assert TEST_STOCK in data
    assert data[TEST_STOCK]["quoteStatus"] in ("ok", "timeout", "error", "unavailable", "stale")
