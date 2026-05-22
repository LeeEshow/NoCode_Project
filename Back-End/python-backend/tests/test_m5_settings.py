"""M5-C 驗證：settings GET null / PUT 回傳結構"""
from tests.helpers import assert_success, assert_keys, assert_no_snake

SETTINGS_KEYS = ["costMethod", "updatedAt"]


async def test_get_settings_returns_null_or_object(client):
    res = await client.get("/api/v1/settings/")
    assert res.status_code == 200
    body = res.json()
    assert body["success"] is True
    assert "data" in body
    # data 可以是 null 或物件（Settings.find() 無資料時回 null）
    assert body["data"] is None or isinstance(body["data"], dict)


async def test_put_settings_returns_structure(client):
    res = await client.put("/api/v1/settings/", json={"costMethod": "preserve_method"})
    data = assert_success(res)
    assert_keys(data, SETTINGS_KEYS)
    assert_no_snake(data)


async def test_put_settings_validates_cost_method(client):
    res = await client.put("/api/v1/settings/", json={"costMethod": "invalid_method"})
    assert res.status_code == 400


async def test_put_settings_cost_method_values(client):
    for method in ["preserve_method", "return_method"]:
        res = await client.put("/api/v1/settings/", json={"costMethod": method})
        data = assert_success(res)
        assert data["costMethod"] == method
