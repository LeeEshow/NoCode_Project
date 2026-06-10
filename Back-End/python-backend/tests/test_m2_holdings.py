"""M2-A/B 驗證：holdings CRUD + tags 嵌套"""
from tests.helpers import assert_success, assert_keys, assert_no_snake

HOLDING_KEYS = ["stockId", "sharesHeld", "avgCost", "totalCost",
                "realizedProfit", "costMethod", "updatedAt", "sortIndex", "tags"]


async def test_get_holdings_returns_success(client):
    res = await client.get("/api/v1/holdings/")
    data = assert_success(res)
    assert isinstance(data, list)


async def test_get_holdings_items_have_camel_keys(client):
    res = await client.get("/api/v1/holdings/")
    data = assert_success(res)
    for item in data:
        assert_keys(item, HOLDING_KEYS)
        assert_no_snake(item)


async def test_get_holdings_tags_is_list(client):
    res = await client.get("/api/v1/holdings/")
    data = assert_success(res)
    for item in data:
        assert isinstance(item["tags"], list)


async def test_get_holdings_tags_items_camel(client):
    res = await client.get("/api/v1/holdings/")
    data = assert_success(res)
    for item in data:
        for tag in item["tags"]:
            assert_keys(tag, ["id", "tagName", "weightRatio"])
            assert_no_snake(tag)


async def test_reorder_validates_order_field(client):
    res = await client.put("/api/v1/holdings/reorder", json={"order": []})
    assert res.status_code == 400
    body = res.json()
    assert body["success"] is False


async def test_recalculate_rejects_empty_body(client):
    res = await client.post("/api/v1/holdings/recalculate", json=[])
    assert res.status_code == 400


async def test_recalculate_deletes_zero_share_holding(client):
    """清倉後 recalculate 應刪除文件，GET /holdings 不再回傳該股"""
    test_id = "TEST_ZERO_SHARE_9999"

    # 先建立一筆持股
    await client.post("/api/v1/holdings/recalculate", json=[{
        "stockId": test_id, "sharesHeld": 100, "avgCost": 50,
        "totalCost": 5000, "realizedProfit": 0, "costMethod": "fifo",
    }])

    # 清倉（sharesHeld=0）
    res = await client.post("/api/v1/holdings/recalculate", json=[{
        "stockId": test_id, "sharesHeld": 0, "avgCost": 0,
        "totalCost": 0, "realizedProfit": 500, "costMethod": "fifo",
    }])
    assert res.status_code == 200

    # GET /holdings 不應出現該股
    res = await client.get("/api/v1/holdings/")
    data = res.json()["data"]
    ids = [h["stockId"] for h in data]
    assert test_id not in ids, "清倉後 GET /holdings 不應回傳 0 股文件"


async def test_recalculate_deletes_asset_tags_on_zero_shares(client):
    """清倉時 recalculate 應同步刪除對應的 asset_tags"""
    from services.firestore import get_db

    test_id = "TEST_ZERO_TAG_9998"
    db = get_db()

    # 先建立持股
    await client.post("/api/v1/holdings/recalculate", json=[{
        "stockId": test_id, "sharesHeld": 50, "avgCost": 100,
        "totalCost": 5000, "realizedProfit": 0, "costMethod": "fifo",
    }])

    # 直接寫一筆 asset_tag（不依賴 tag 存在性驗證）
    db.collection("asset_tags").add({
        "stock_code": test_id, "tag_name": "科技", "weight_ratio": 100,
    })

    # 清倉
    await client.post("/api/v1/holdings/recalculate", json=[{
        "stockId": test_id, "sharesHeld": 0, "avgCost": 0,
        "totalCost": 0, "realizedProfit": 0, "costMethod": "fifo",
    }])

    # 確認 asset_tags 已清除
    from google.cloud.firestore_v1.base_query import FieldFilter
    remaining = db.collection("asset_tags").where(
        filter=FieldFilter("stock_code", "==", test_id)
    ).get()
    assert len(list(remaining)) == 0, "清倉後 asset_tags 應全部刪除"
