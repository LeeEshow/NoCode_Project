"""M8 驗證：FinMind 同步端點 + Firestore 基本面/籌碼讀取 + MCP tools"""
import json
import pytest
from datetime import datetime, timezone
from tests.helpers import assert_success, assert_keys, assert_no_snake

TEST_STOCK = "2330"
FAKE_STOCK = "FAKE99"


@pytest.fixture(autouse=True)
def clear_mcp_key(monkeypatch):
    """測試預設不啟用 MCP Key 驗證（與 test_m6_mcp.py 保持一致）"""
    monkeypatch.delenv("MCP_ACCESS_KEY", raising=False)


# ─── 1. 同步端點結構驗證 ───────────────────────────────────────────────────────

async def test_sync_endpoint_with_cron_token(client):
    """POST /finmind/sync 回 200 + {success:true, data:{synced:int, errors:list}}"""
    res = await client.post("/api/v1/finmind/sync")
    data = assert_success(res)
    assert_keys(data, ["synced", "errors"])
    assert isinstance(data["synced"], int)
    assert isinstance(data["errors"], list)


# ─── 2. 同步寫入基本面 ─────────────────────────────────────────────────────────

async def test_sync_writes_fundamentals(client):
    """sync 後 stock_fundamentals/{stockId} 應存在並含必要欄位（snake_case）"""
    from services.firestore import get_db

    # 先執行同步
    await client.post("/api/v1/finmind/sync")

    db = get_db()
    holdings = [doc.id for doc in db.collection("holdings").limit(1).get()]
    if not holdings:
        pytest.skip("無持股，無法驗證同步結果")

    sid = holdings[0]
    doc = db.collection("stock_fundamentals").document(sid).get()
    assert doc.exists, f"stock_fundamentals/{sid} 應在 sync 後存在"
    d = doc.to_dict()
    for key in ["stock_id", "name", "updated_at"]:
        assert key in d, f"缺少欄位 {key}"


# ─── 3. 同步寫入籌碼 ───────────────────────────────────────────────────────────

async def test_sync_writes_chip(client):
    """sync 後 stock_chip/{stockId}/records 若有資料應含 date/foreign/trust/dealer"""
    from services.firestore import get_db

    await client.post("/api/v1/finmind/sync")

    db = get_db()
    holdings = [doc.id for doc in db.collection("holdings").limit(1).get()]
    if not holdings:
        pytest.skip("無持股，無法驗證籌碼同步")

    sid = holdings[0]
    records = list(
        db.collection("stock_chip").document(sid).collection("records").limit(1).get()
    )
    if records:
        d = records[0].to_dict()
        for key in ["date", "foreign", "trust", "dealer"]:
            assert key in d, f"chip record 缺少欄位 {key}"


# ─── 4. GET /profile 讀 Firestore ────────────────────────────────────────────

async def test_get_profile_reads_firestore(client):
    """GET /stocks/{id}/profile 回 camelCase dict 或 null（FinMind 尚未同步）"""
    from services.firestore import get_db
    from datetime import timezone

    # 預先寫入測試資料，確保端點有資料可讀
    db = get_db()
    _TEST_ID = "_test_profile_"
    db.collection("stock_fundamentals").document(_TEST_ID).set({
        "stock_id":       _TEST_ID,
        "name":           "測試股票",
        "market":         "TSE",
        "pe_ratio":       18.5,
        "pb_ratio":       None,
        "eps":            None,
        "book_value":     None,
        "dividend_yield": None,
        "dividend_rate":  None,
        "payout_ratio":   None,
        "ex_dividend_date": None,
        "gross_margin":   None,
        "operating_margin": None,
        "net_margin":     None,
        "roe":            None,
        "market_cap":     None,
        "revenue":        None,
        "revenue_growth": None,
        "fifty_two_week_high": None,
        "fifty_two_week_low":  None,
        "beta":           None,
        "updated_at":     datetime.now(tz=timezone.utc).isoformat(),
    })

    try:
        res = await client.get(f"/api/v1/stocks/{_TEST_ID}/profile")
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert body["data"] is not None
        assert_no_snake(body["data"])
        assert body["data"]["stockId"] == _TEST_ID
    finally:
        db.collection("stock_fundamentals").document(_TEST_ID).delete()


# ─── 5. GET /profile 無資料時回 null ─────────────────────────────────────────

async def test_get_profile_null_when_no_data(client):
    """stock_fundamentals 不存在時回 {success:true, data:null}"""
    res = await client.get(f"/api/v1/stocks/{FAKE_STOCK}/profile")
    data = assert_success(res)
    assert data is None


# ─── 6. GET /chip 回陣列 ──────────────────────────────────────────────────────

async def test_get_chip_returns_list(client):
    """GET /stocks/{id}/chip 回陣列（可能為空，Firestore 無資料時）"""
    res = await client.get(f"/api/v1/stocks/{TEST_STOCK}/chip")
    data = assert_success(res)
    assert isinstance(data, list)
    for item in data:
        assert_keys(item, ["date", "foreign", "trust", "dealer"])
        assert_no_snake(item)


# ─── 7. GET /chip ?limit ─────────────────────────────────────────────────────

async def test_get_chip_limit_param(client):
    """?limit=5 回傳 ≤ 5 筆"""
    res = await client.get(f"/api/v1/stocks/{TEST_STOCK}/chip?limit=5")
    data = assert_success(res)
    assert isinstance(data, list)
    assert len(data) <= 5


# ─── 8. MCP get_stock_fundamental ─────────────────────────────────────────────

async def test_mcp_get_stock_fundamental(client):
    """MCP tool get_stock_fundamental 回 dict，含 stockId；有資料時含 camelCase key"""
    res = await client.post(
        "/api/v1/mcp/message",
        json={
            "jsonrpc": "2.0", "id": 10,
            "method": "tools/call",
            "params": {"name": "get_stock_fundamental", "arguments": {"stock_id": TEST_STOCK}},
        },
    )
    assert res.status_code == 200
    data = json.loads(res.json()["result"]["content"][0]["text"])
    assert isinstance(data, dict)
    assert "stockId" in data
    # 若有基本面資料，欄位應為 camelCase
    if data.get("updatedAt") is not None:
        assert_no_snake(data)


# ─── 9. MCP get_stock_chip 含 limit 參數 ─────────────────────────────────────

async def test_mcp_get_stock_chip_updated(client):
    """MCP tool get_stock_chip 支援 limit 參數，回陣列且筆數 ≤ limit"""
    res = await client.post(
        "/api/v1/mcp/message",
        json={
            "jsonrpc": "2.0", "id": 11,
            "method": "tools/call",
            "params": {"name": "get_stock_chip", "arguments": {"stock_id": TEST_STOCK, "limit": 10}},
        },
    )
    assert res.status_code == 200
    data = json.loads(res.json()["result"]["content"][0]["text"])
    assert isinstance(data, list)
    assert len(data) <= 10


# ─── 10. MCP query_stock_fundamental（直接打 FinMind API） ─────────────────────

async def test_mcp_query_stock_fundamental_structure(client):
    """query_stock_fundamental 直接呼叫 FinMind，回 camelCase dict 含必要欄位"""
    res = await client.post(
        "/api/v1/mcp/message",
        json={
            "jsonrpc": "2.0", "id": 20,
            "method": "tools/call",
            "params": {"name": "query_stock_fundamental", "arguments": {"stock_id": TEST_STOCK}},
        },
    )
    assert res.status_code == 200
    data = json.loads(res.json()["result"]["content"][0]["text"])
    assert isinstance(data, dict)
    # 必有的 key
    for key in ["stockId", "name", "updatedAt"]:
        assert key in data, f"缺少欄位 {key}"
    # 全部 key 應為 camelCase
    assert_no_snake(data)


# ─── 11. MCP query_stock_chip（直接打 FinMind API） ───────────────────────────

async def test_mcp_query_stock_chip_structure(client):
    """query_stock_chip 直接呼叫 FinMind，回陣列且 ≤ limit 筆"""
    res = await client.post(
        "/api/v1/mcp/message",
        json={
            "jsonrpc": "2.0", "id": 21,
            "method": "tools/call",
            "params": {
                "name": "query_stock_chip",
                "arguments": {"stock_id": TEST_STOCK, "limit": 5},
            },
        },
    )
    assert res.status_code == 200
    data = json.loads(res.json()["result"]["content"][0]["text"])
    assert isinstance(data, list)
    assert len(data) <= 5
    for item in data:
        for key in ["date", "foreign", "trust", "dealer"]:
            assert key in item, f"chip row 缺少欄位 {key}"
