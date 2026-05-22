"""M2-A/B 驗證：holdings CRUD + /prices 欄位 + tags 嵌套"""
from tests.helpers import assert_success, assert_keys, assert_no_snake

HOLDING_KEYS = ["stockId", "sharesHeld", "avgCost", "totalCost",
                "realizedProfit", "costMethod", "updatedAt", "sortIndex", "tags"]


async def test_get_holdings_returns_success(client):
    res = await client.get("/api/v1/holdings/")
    data = assert_success(res)
    assert isinstance(data, list)


async def test_get_holdings_items_have_camel_keys(client):
    res = await client.get("/api/v1/holdings/")
    data = assert_success(res)
    for item in data:
        assert_keys(item, HOLDING_KEYS)
        assert_no_snake(item)


async def test_get_holdings_tags_is_list(client):
    res = await client.get("/api/v1/holdings/")
    data = assert_success(res)
    for item in data:
        assert isinstance(item["tags"], list)


async def test_get_holdings_tags_items_camel(client):
    res = await client.get("/api/v1/holdings/")
    data = assert_success(res)
    for item in data:
        for tag in item["tags"]:
            assert_keys(tag, ["id", "tagName", "weightRatio"])
            assert_no_snake(tag)


async def test_get_prices_returns_success(client):
    res = await client.get("/api/v1/holdings/prices")
    data = assert_success(res)
    assert isinstance(data, list)


async def test_get_prices_uses_changePct_not_changePercent(client):
    res = await client.get("/api/v1/holdings/prices")
    data = assert_success(res)
    for item in data:
        assert "changePct" in item,        "GET /holdings/prices 應有 changePct 欄位"
        assert "changePercent" not in item, "GET /holdings/prices 不應有 changePercent 欄位"


async def test_get_prices_items_have_required_keys(client):
    res = await client.get("/api/v1/holdings/prices")
    data = assert_success(res)
    for item in data:
        assert_keys(item, ["stockCode", "currentPrice", "change", "changePct", "unrealizedProfit"])
        assert_no_snake(item)


async def test_reorder_validates_order_field(client):
    res = await client.put("/api/v1/holdings/reorder", json={"order": []})
    assert res.status_code == 400
    body = res.json()
    assert body["success"] is False


async def test_recalculate_rejects_empty_body(client):
    res = await client.post("/api/v1/holdings/recalculate", json=[])
    assert res.status_code == 400
