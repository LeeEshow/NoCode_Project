"""M2-C 驗證：watchlist + livePrice/judgment 注入欄位"""
from tests.helpers import assert_success, assert_keys, assert_no_snake

WATCHLIST_KEYS = ["stockId", "stockName", "targetPrice", "note", "group",
                  "createdAt", "updatedAt", "sortIndex",
                  "livePrice", "change", "changePercent", "judgment"]


async def test_get_watchlist_returns_success(client):
    res = await client.get("/api/v1/watchlist/")
    data = assert_success(res)
    assert isinstance(data, list)


async def test_get_watchlist_items_have_camel_keys(client):
    res = await client.get("/api/v1/watchlist/")
    data = assert_success(res)
    for item in data:
        assert_keys(item, WATCHLIST_KEYS)
        assert_no_snake(item)


async def test_get_watchlist_judgment_values(client):
    res = await client.get("/api/v1/watchlist/")
    data = assert_success(res)
    for item in data:
        assert item["judgment"] in ("買進", "觀望", None), \
            f"judgment 應為 '買進' | '觀望' | null，實際：{item['judgment']}"


async def test_create_watchlist_validates_required(client):
    res = await client.post("/api/v1/watchlist/", json={"stockId": "9999"})
    assert res.status_code == 400


async def test_reorder_validates_order_field(client):
    res = await client.put("/api/v1/watchlist/reorder", json={"order": []})
    assert res.status_code == 400
    assert res.json()["success"] is False


async def test_update_nonexistent_returns_404(client):
    res = await client.put("/api/v1/watchlist/zz-nonexistent-test", json={"targetPrice": 100})
    assert res.status_code == 404


async def test_update_only_group_returns_400_when_no_fields(client):
    """PUT 空 body 應回 400（三個可選欄位均未提供）"""
    res = await client.put("/api/v1/watchlist/zz-nonexistent-test", json={})
    assert res.status_code == 400


async def test_get_watchlist_group_field_nullable(client):
    """GET 回傳的每筆 item 必須含 group 欄位，值為 str 或 null"""
    res = await client.get("/api/v1/watchlist/")
    data = assert_success(res)
    for item in data:
        assert "group" in item, "缺少 group 欄位"
        assert item["group"] is None or isinstance(item["group"], str)


async def test_delete_nonexistent_returns_404(client):
    res = await client.delete("/api/v1/watchlist/zz-nonexistent-test")
    assert res.status_code == 404
