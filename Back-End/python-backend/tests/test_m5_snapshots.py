"""M5-B 驗證：snapshots CRUD + holdings 子欄位 camelCase"""
from tests.helpers import assert_success, assert_keys, assert_no_snake

SNAPSHOT_KEYS = ["date", "execCapital", "reinvest", "stockValue", "cashBalance",
                 "forexValue", "unrealizedProfit", "note", "holdings",
                 "vix", "marketStateAuto", "recordedAt"]

HOLDING_KEYS = ["stockCode", "stockName", "shares", "costAvg",
                "currentPrice", "currentValue", "unrealizedProfit"]


async def test_get_snapshots_returns_list(client):
    res = await client.get("/api/v1/snapshots/")
    data = assert_success(res)
    assert isinstance(data, list)


async def test_get_snapshots_items_camel(client):
    res = await client.get("/api/v1/snapshots/")
    data = assert_success(res)
    for item in data:
        assert_keys(item, SNAPSHOT_KEYS)
        assert_no_snake(item)


async def test_get_snapshots_holdings_camel(client):
    res = await client.get("/api/v1/snapshots/")
    data = assert_success(res)
    for snap in data:
        for holding in snap["holdings"]:
            assert_keys(holding, HOLDING_KEYS)
            assert_no_snake(holding)


async def test_get_snapshot_by_date_nonexistent_404(client):
    res = await client.get("/api/v1/snapshots/1900-01-01")
    assert res.status_code == 404


async def test_create_snapshot_validates_date_required(client):
    res = await client.post("/api/v1/snapshots/", json={
        "stockValue": 100, "cashBalance": 0,
        "forexValue": 0, "unrealizedProfit": 0,
    })
    assert res.status_code == 400


async def test_create_snapshot_validates_date_format(client):
    res = await client.post("/api/v1/snapshots/", json={
        "date": "invalid", "stockValue": 100, "cashBalance": 0,
        "forexValue": 0, "unrealizedProfit": 0,
    })
    assert res.status_code == 400


async def test_update_snapshot_validates_fields(client):
    res = await client.put("/api/v1/snapshots/2000-01-01", json={})
    assert res.status_code == 400


async def test_update_nonexistent_snapshot_404(client):
    res = await client.put("/api/v1/snapshots/1900-01-01", json={"cashBalance": 1000})
    assert res.status_code == 404
