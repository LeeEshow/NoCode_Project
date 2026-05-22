"""M5-D 驗證：preferences camelCase 欄位儲存/讀取"""
from tests.helpers import assert_success, assert_keys, assert_no_snake

CHART_KEYS = ["showK", "showMA5", "showMA20", "showMA60", "showVolume", "zoomLock"]


async def test_get_preferences_returns_success(client):
    res = await client.get("/api/v1/preferences/")
    data = assert_success(res)
    assert "chart" in data


async def test_get_preferences_chart_has_camel_keys(client):
    res = await client.get("/api/v1/preferences/")
    data = assert_success(res)
    assert_keys(data["chart"], CHART_KEYS)
    assert_no_snake(data["chart"])


async def test_get_preferences_chart_bool_types(client):
    res = await client.get("/api/v1/preferences/")
    data = assert_success(res)
    for key in CHART_KEYS:
        assert isinstance(data["chart"][key], bool), \
            f"chart.{key} 應為 boolean，實際：{type(data['chart'][key])}"


async def test_put_preferences_deep_merge(client):
    res = await client.put("/api/v1/preferences/", json={"chart": {"zoomLock": True}})
    data = assert_success(res)
    assert "chart" in data
    assert_keys(data["chart"], CHART_KEYS)
    assert_no_snake(data["chart"])


async def test_put_preferences_preserves_other_keys(client):
    # 先把 zoomLock 設為 false
    await client.put("/api/v1/preferences/", json={"chart": {"zoomLock": False}})
    # 只更新 showK，其他應保留
    res = await client.put("/api/v1/preferences/", json={"chart": {"showK": False}})
    data = assert_success(res)
    # 確認所有 chart 欄位存在
    assert_keys(data["chart"], CHART_KEYS)
