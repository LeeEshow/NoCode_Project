"""M3-E 驗證：rebalance-rules + rebalance-snapshots"""
from tests.helpers import assert_success, assert_keys, assert_no_snake

RULE_KEYS     = ["baseThreshold", "volatilityFactor", "liquidityCapRatio",
                 "advLookbackDays", "concentrationLimit"]
SNAPSHOT_KEYS = ["id", "createdAt", "params", "suggestions"]
PARAMS_KEYS   = ["totalAsset", "baseThreshold", "liquidityCapRatio", "marketState"]


async def test_get_rules_returns_success(client):
    res = await client.get("/api/v1/rebalance-rules/")
    data = assert_success(res)
    assert_keys(data, RULE_KEYS)
    assert_no_snake(data)


async def test_get_rules_value_types(client):
    res = await client.get("/api/v1/rebalance-rules/")
    data = assert_success(res)
    assert isinstance(data["baseThreshold"],      (int, float))
    assert isinstance(data["volatilityFactor"],   (int, float))
    assert isinstance(data["liquidityCapRatio"],  (int, float))
    assert isinstance(data["advLookbackDays"],    int)
    assert isinstance(data["concentrationLimit"], (int, float))


async def test_update_rules_validates_required(client):
    res = await client.put("/api/v1/rebalance-rules/", json={"baseThreshold": 0.05})
    assert res.status_code == 400


async def test_get_snapshots_returns_list(client):
    res = await client.get("/api/v1/rebalance-snapshots/")
    data = assert_success(res)
    assert isinstance(data, list)


async def test_get_snapshots_items_camel(client):
    res = await client.get("/api/v1/rebalance-snapshots/")
    data = assert_success(res)
    for item in data:
        assert_keys(item, SNAPSHOT_KEYS)
        assert_no_snake(item)
        assert_keys(item["params"], PARAMS_KEYS)
        assert_no_snake(item["params"])
        assert isinstance(item["suggestions"], list)
