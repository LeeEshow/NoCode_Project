"""M3-C 驗證：market-state GET/PUT"""
from tests.helpers import assert_success

VALID_STATES = {"neutral", "risk-on", "risk-off", "liquidity-dry"}


async def test_get_market_state_returns_success(client):
    res = await client.get("/api/v1/market-state/")
    data = assert_success(res)
    assert "current" in data


async def test_get_market_state_value_valid(client):
    res = await client.get("/api/v1/market-state/")
    data = assert_success(res)
    assert data["current"] in VALID_STATES, \
        f"current 應為有效市場狀態，實際：{data['current']}"


async def test_update_market_state_validates_value(client):
    res = await client.put("/api/v1/market-state/", json={"state": "invalid"})
    assert res.status_code == 400


async def test_update_market_state_returns_state_and_count(client):
    res = await client.put("/api/v1/market-state/", json={"state": "neutral"})
    data = assert_success(res)
    assert "state" in data
    assert "updatedTags" in data
    assert data["state"] == "neutral"
    assert isinstance(data["updatedTags"], int)
