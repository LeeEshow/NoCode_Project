"""M2-E 驗證：foreign-assets + liveRate 注入"""
from tests.helpers import assert_success, assert_keys, assert_no_snake

ASSET_KEYS = ["id", "type", "name", "currency", "amount", "interestRate",
              "maturityDate", "useManualRate", "manualRate", "updatedAt", "liveRate"]

TEST_ASSET = {
    "type":          "活存",
    "name":          "pytest 測試",
    "currency":      "USD",
    "amount":        1000.0,
    "interestRate":  0.03,
    "maturityDate":  None,
    "useManualRate": False,
    "manualRate":    0.0,
}


async def test_get_assets_returns_success(client):
    res = await client.get("/api/v1/foreign-assets/")
    data = assert_success(res)
    assert isinstance(data, list)


async def test_get_assets_items_camel(client):
    res = await client.get("/api/v1/foreign-assets/")
    data = assert_success(res)
    for item in data:
        assert_keys(item, ASSET_KEYS)
        assert_no_snake(item)


async def test_get_assets_has_live_rate(client):
    res = await client.get("/api/v1/foreign-assets/")
    data = assert_success(res)
    for item in data:
        assert "liveRate" in item, "GET /foreign-assets 每筆應含 liveRate 欄位"


async def test_create_asset_validates_type(client):
    bad = {**TEST_ASSET, "type": "invalid"}
    res = await client.post("/api/v1/foreign-assets/", json=bad)
    assert res.status_code == 400


async def test_create_asset_validates_currency(client):
    bad = {**TEST_ASSET, "currency": "XYZ"}
    res = await client.post("/api/v1/foreign-assets/", json=bad)
    assert res.status_code == 400


async def test_create_and_delete_asset(client):
    res = await client.post("/api/v1/foreign-assets/", json=TEST_ASSET)
    assert res.status_code == 200
    body = res.json()
    assert body["success"] is True
    asset_id = body["data"]["id"]
    assert_keys(body["data"], [k for k in ASSET_KEYS if k != "liveRate"])
    assert_no_snake(body["data"])

    del_res = await client.delete(f"/api/v1/foreign-assets/{asset_id}")
    assert del_res.status_code == 200
    assert del_res.json()["data"]["deleted"] is True


async def test_update_nonexistent_returns_404(client):
    res = await client.put("/api/v1/foreign-assets/zz-nonexistent-test", json={"amount": 500})
    assert res.status_code == 404


async def test_delete_nonexistent_returns_404(client):
    res = await client.delete("/api/v1/foreign-assets/zz-nonexistent-test")
    assert res.status_code == 404
