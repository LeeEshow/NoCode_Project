"""M2-F 驗證：plan/config singleton + 預設值 + yearly-records 結構"""
from tests.helpers import assert_success, assert_keys, assert_no_snake

PLAN_CONFIG_KEYS = ["annualInvest", "rBase", "inflation", "kRisk",
                    "startYear", "overrides", "currentYearReinvest", "updatedAt"]

YEARLY_RECORD_KEYS = ["id", "assetType", "year", "prevYearTotal", "amountInvested",
                      "stockValue", "cashBalance", "foreignValueTwd",
                      "returnAmount", "returnRate", "settledAt", "note", "createdAt"]


async def test_get_plan_config_returns_success(client):
    res = await client.get("/api/v1/plan/config")
    data = assert_success(res)
    assert isinstance(data, dict)


async def test_get_plan_config_has_camel_keys(client):
    res = await client.get("/api/v1/plan/config")
    data = assert_success(res)
    assert_keys(data, PLAN_CONFIG_KEYS)
    assert_no_snake(data)


async def test_get_plan_config_default_values_types(client):
    res = await client.get("/api/v1/plan/config")
    data = assert_success(res)
    assert isinstance(data["annualInvest"],        (int, float))
    assert isinstance(data["rBase"],               (int, float))
    assert data["inflation"] in ("low", "base", "high")
    assert isinstance(data["kRisk"],               (int, float))
    assert isinstance(data["startYear"],           int)
    assert isinstance(data["overrides"],           dict)
    assert isinstance(data["currentYearReinvest"], (int, float))


async def test_update_plan_config_validates_required(client):
    res = await client.put("/api/v1/plan/config", json={"annualInvest": 120000})
    assert res.status_code == 400


async def test_update_plan_config_validates_inflation(client):
    res = await client.put("/api/v1/plan/config", json={
        "annualInvest": 120000, "rBase": 0.08, "kRisk": 1.0,
        "startYear": 2024, "inflation": "invalid",
    })
    assert res.status_code == 400


async def test_get_yearly_records_returns_success(client):
    res = await client.get("/api/v1/plan/yearly-records")
    data = assert_success(res)
    assert isinstance(data, list)


async def test_get_yearly_records_items_camel(client):
    res = await client.get("/api/v1/plan/yearly-records")
    data = assert_success(res)
    for item in data:
        assert_keys(item, YEARLY_RECORD_KEYS)
        assert_no_snake(item)
