"""M3-A/B 驗證：tags CRUD + marketStatePresets 結構"""
from tests.helpers import assert_success, assert_keys, assert_no_snake

TAG_KEYS = ["id", "name", "baseRisk", "dynamicRisk", "targetWeight",
            "fallbackBehavior", "marketStatePresets", "triggerDirection"]


async def test_get_tags_returns_success(client):
    res = await client.get("/api/v1/tags/")
    data = assert_success(res)
    assert isinstance(data, list)


async def test_get_tags_items_camel(client):
    res = await client.get("/api/v1/tags/")
    data = assert_success(res)
    for item in data:
        assert_keys(item, TAG_KEYS)
        assert_no_snake(item)


async def test_get_tags_presets_structure(client):
    res = await client.get("/api/v1/tags/")
    data = assert_success(res)
    for item in data:
        msp = item["marketStatePresets"]
        assert msp is None or isinstance(msp, dict), \
            "marketStatePresets 應為 null 或物件"
        if isinstance(msp, dict):
            for key in ["riskOn", "riskOff", "liquidityDry"]:
                assert key in msp, f"marketStatePresets 應含 {key}"


async def test_get_tags_trigger_direction_valid(client):
    res = await client.get("/api/v1/tags/")
    data = assert_success(res)
    valid = {"both", "upper_only", "lower_only"}
    for item in data:
        assert item["triggerDirection"] in valid, \
            f"triggerDirection 值異常：{item['triggerDirection']}"


async def test_create_tag_validates_name_required(client):
    res = await client.post("/api/v1/tags/", json={"baseRisk": 1.0})
    assert res.status_code == 400


async def test_create_tag_validates_base_risk_range(client):
    res = await client.post("/api/v1/tags/", json={"name": "pytest-tag", "baseRisk": 5.0})
    assert res.status_code == 400


async def test_update_nonexistent_returns_404(client):
    res = await client.put("/api/v1/tags/zz-nonexistent-test", json={"baseRisk": 1.0})
    assert res.status_code == 404


async def test_delete_nonexistent_returns_404(client):
    res = await client.delete("/api/v1/tags/zz-nonexistent-test")
    assert res.status_code == 404


async def test_recalculate_validates_market_state(client):
    res = await client.post(
        "/api/v1/tags/recalculate-dynamic-risk",
        json={"marketState": "invalid"},
    )
    assert res.status_code == 400
