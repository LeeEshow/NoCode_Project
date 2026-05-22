"""M2-D 驗證：transactions CRUD + date 升冪 + 204 Delete"""
from tests.helpers import assert_success, assert_keys, assert_no_snake

TX_KEYS = ["id", "stockId", "type", "date", "shares",
           "pricePerShare", "fee", "note", "createdAt"]

TEST_TX = {
    "stockId":       "__test__",
    "type":          "buy",
    "date":          "2024-01-15T00:00:00+00:00",
    "shares":        100,
    "pricePerShare": 50.0,
    "fee":           20.0,
    "note":          "pytest",
}


async def test_get_transactions_returns_success(client):
    res = await client.get("/api/v1/transactions/")
    data = assert_success(res)
    assert isinstance(data, list)


async def test_get_transactions_items_camel(client):
    res = await client.get("/api/v1/transactions/")
    data = assert_success(res)
    for item in data:
        assert_keys(item, TX_KEYS)
        assert_no_snake(item)


async def test_get_transactions_ascending_date(client):
    res = await client.get("/api/v1/transactions/")
    data = assert_success(res)
    dates = [item["date"] for item in data]
    assert dates == sorted(dates), "GET /transactions 應依 date 升冪排列"


async def test_get_transactions_stock_id_filter(client):
    res = await client.get("/api/v1/transactions/?stock_id=__nonexistent__")
    data = assert_success(res)
    assert data == [], "不存在的 stock_id 應回傳空陣列"


async def test_create_transaction_validates_required(client):
    res = await client.post("/api/v1/transactions/", json={"stockId": "2330"})
    assert res.status_code == 400


async def test_create_and_delete_transaction(client):
    # 建立
    res = await client.post("/api/v1/transactions/", json=TEST_TX)
    assert res.status_code == 200 or res.status_code == 201
    body = res.json()
    assert body["success"] is True
    tx_id = body["data"]["id"]
    assert_keys(body["data"], TX_KEYS)
    assert_no_snake(body["data"])

    # 刪除
    del_res = await client.delete(f"/api/v1/transactions/{tx_id}")
    assert del_res.status_code == 204


async def test_delete_nonexistent_returns_404(client):
    res = await client.delete("/api/v1/transactions/zz-nonexistent-test")
    assert res.status_code == 404
