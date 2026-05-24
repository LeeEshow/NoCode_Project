"""M6 驗證：MCP Server — SSE 連線 + JSON-RPC 2.0 + Phase 2 擴充"""
import json
import pytest
from tests.helpers import assert_keys


@pytest.fixture(autouse=True)
def clear_mcp_key(monkeypatch):
    """測試預設不啟用 MCP Key 驗證，auth 測試再自行 setenv"""
    monkeypatch.delenv("MCP_ACCESS_KEY", raising=False)


BASE = "/api/v1/mcp"

TOOL_NAMES = {
    "get_holdings",
    "get_watchlist",
    "get_market_indices",
    "get_stock_quote",
    "get_snapshots",
    "get_tags",
    "get_rebalance_rules",
    "get_foreign_assets",
    # Phase 2 新增
    "get_asset_tags",
    "get_tag_correlation_matrix",
    "get_transactions",
    "get_stock_history",
    "get_stock_chip",
    "get_rebalance_snapshots",
    "get_portfolio_tag_analysis",
    "get_stock_fundamental",
    # M8 FinMind 直查 tool
    "query_stock_fundamental",
    "query_stock_chip",
}


# ─── 共用輔助 ─────────────────────────────────────────────────────────────────

async def _call_tool(client, tool_name: str, arguments: dict | None = None) -> object:
    res = await client.post(
        f"{BASE}/message",
        json={
            "jsonrpc": "2.0",
            "id": 99,
            "method": "tools/call",
            "params": {"name": tool_name, "arguments": arguments or {}},
        },
    )
    assert res.status_code == 200
    return res


def _parse(res) -> object:
    """解析 tools/call 回傳的 content[0].text"""
    return json.loads(res.json()["result"]["content"][0]["text"])


# ─── SSE ──────────────────────────────────────────────────────────────────────

async def _sse_direct(path: str = "/api/v1/mcp/sse", qs: bytes = b""):
    import asyncio
    from main import app as _app

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "path": path,
        "raw_path": path.encode(),
        "query_string": qs,
        "headers": [],
        "server": ("testserver", 80),
        "client": ("127.0.0.1", 123),
        "root_path": "",
        "scheme": "http",
    }
    _req_done = False

    async def receive():
        nonlocal _req_done
        if not _req_done:
            _req_done = True
            return {"type": "http.request", "body": b"", "more_body": False}
        return {"type": "http.disconnect"}

    status_code = None
    content_type = ""
    body_chunks: list[str] = []

    async def send(message):
        nonlocal status_code, content_type
        if message["type"] == "http.response.start":
            status_code = message["status"]
            for k, v in message.get("headers", []):
                if k.lower() == b"content-type":
                    content_type = v.decode()
        elif message["type"] == "http.response.body":
            body = message.get("body", b"")
            if body:
                body_chunks.append(body.decode())

    await asyncio.wait_for(_app(scope, receive, send), timeout=5.0)
    return status_code, content_type, "".join(body_chunks)


async def test_mcp_sse_status_and_content_type():
    status, ct, _ = await _sse_direct()
    assert status == 200
    assert "text/event-stream" in ct


async def test_mcp_sse_first_event_is_endpoint():
    _, _, body = await _sse_direct()
    assert "event: endpoint" in body
    assert "data:" in body


async def test_mcp_sse_endpoint_url_contains_mcp_message():
    _, _, body = await _sse_direct()
    assert "mcp/message" in body


# ─── initialize ───────────────────────────────────────────────────────────────

async def test_mcp_initialize(client):
    res = await client.post(
        f"{BASE}/message",
        json={"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["jsonrpc"] == "2.0"
    assert body["id"] == 1
    result = body["result"]
    assert "protocolVersion" in result
    assert "serverInfo" in result
    assert "capabilities" in result


# ─── tools/list ───────────────────────────────────────────────────────────────

async def test_mcp_tools_list_returns_tools(client):
    res = await client.post(
        f"{BASE}/message",
        json={"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
    )
    assert res.status_code == 200
    tools = res.json()["result"]["tools"]
    assert isinstance(tools, list)
    assert len(tools) == len(TOOL_NAMES)


async def test_mcp_tools_list_has_required_fields(client):
    res = await client.post(
        f"{BASE}/message",
        json={"jsonrpc": "2.0", "id": 3, "method": "tools/list"},
    )
    tools = res.json()["result"]["tools"]
    for tool in tools:
        assert_keys(tool, ["name", "description", "inputSchema"])


async def test_mcp_tools_list_names_match(client):
    res = await client.post(
        f"{BASE}/message",
        json={"jsonrpc": "2.0", "id": 4, "method": "tools/list"},
    )
    names = {t["name"] for t in res.json()["result"]["tools"]}
    assert names == TOOL_NAMES


# ─── tools/call — 基礎格式 ───────────────────────────────────────────────────

async def test_mcp_tools_call_returns_content(client):
    res = await _call_tool(client, "get_tags")
    result = res.json()["result"]
    assert "content" in result
    assert isinstance(result["content"], list)
    assert result["content"][0]["type"] == "text"
    assert isinstance(result["content"][0]["text"], str)


async def test_mcp_tools_call_missing_name_returns_error(client):
    res = await client.post(
        f"{BASE}/message",
        json={"jsonrpc": "2.0", "id": 6, "method": "tools/call", "params": {"arguments": {}}},
    )
    body = res.json()
    assert "error" in body
    assert body["error"]["code"] == -32602


async def test_mcp_tools_call_unknown_tool_returns_error_content(client):
    res = await _call_tool(client, "does_not_exist")
    text = res.json()["result"]["content"][0]["text"]
    assert "未知工具" in text


# ─── 未知方法 ─────────────────────────────────────────────────────────────────

async def test_mcp_unknown_method_returns_error(client):
    res = await client.post(
        f"{BASE}/message",
        json={"jsonrpc": "2.0", "id": 8, "method": "no_such_method"},
    )
    body = res.json()
    assert "error" in body
    assert body["error"]["code"] == -32601


# ─── API Key ──────────────────────────────────────────────────────────────────

async def test_mcp_invalid_key_returns_401(client, monkeypatch):
    monkeypatch.setenv("MCP_ACCESS_KEY", "secret123")
    res = await client.post(
        f"{BASE}/message?key=wrong",
        json={"jsonrpc": "2.0", "id": 9, "method": "tools/list"},
    )
    assert res.status_code == 401


async def test_mcp_valid_key_returns_200(client, monkeypatch):
    monkeypatch.setenv("MCP_ACCESS_KEY", "secret123")
    res = await client.post(
        f"{BASE}/message?key=secret123",
        json={"jsonrpc": "2.0", "id": 10, "method": "tools/list"},
    )
    assert res.status_code == 200


async def test_mcp_no_key_required_when_env_not_set(client, monkeypatch):
    monkeypatch.delenv("MCP_ACCESS_KEY", raising=False)
    res = await client.post(
        f"{BASE}/message",
        json={"jsonrpc": "2.0", "id": 11, "method": "tools/list"},
    )
    assert res.status_code == 200


# ─── MCP-OPT-01/02: get_holdings camelCase + currentPrice ────────────────────

async def test_holdings_camelcase(client):
    data = _parse(await _call_tool(client, "get_holdings"))
    if not isinstance(data, list) or len(data) == 0:
        pytest.skip("Firestore 無持股資料")
    h = data[0]
    assert "shares_held" not in h, "不應出現 snake_case 欄位"
    assert "avg_cost"    not in h, "不應出現 snake_case 欄位"
    assert "currentPrice" in h,    "應含 currentPrice 欄位"
    assert "currentValue" in h,    "應含 currentValue 欄位"


async def test_holdings_current_price_type(client):
    data = _parse(await _call_tool(client, "get_holdings"))
    if not isinstance(data, list) or len(data) == 0:
        pytest.skip("Firestore 無持股資料")
    for h in data:
        cp = h.get("currentPrice")
        cv = h.get("currentValue")
        assert cp is None or isinstance(cp, (int, float)), f"currentPrice 型別錯誤：{cp}"
        assert cv is None or isinstance(cv, (int, float)), f"currentValue 型別錯誤：{cv}"


# ─── MCP-OPT-01: get_tags camelCase ──────────────────────────────────────────

async def test_tags_camelcase(client):
    data = _parse(await _call_tool(client, "get_tags"))
    if not isinstance(data, list) or len(data) == 0:
        pytest.skip("Firestore 無 Tag 資料")
    t = data[0]
    assert "base_risk"    not in t, "不應出現 snake_case"
    assert "dynamic_risk" not in t, "不應出現 snake_case"
    assert "baseRisk"    in t, "應含 baseRisk"
    assert "dynamicRisk" in t, "應含 dynamicRisk"


# ─── MCP-OPT-01: get_rebalance_rules camelCase ───────────────────────────────

async def test_rebalance_rules_camelcase(client):
    data = _parse(await _call_tool(client, "get_rebalance_rules"))
    assert isinstance(data, dict)
    if data:
        assert "base_threshold"    not in data
        assert "volatility_factor" not in data
        assert "baseThreshold"    in data
        assert "volatilityFactor" in data


# ─── MCP-OPT-03: get_snapshots 日期範圍 ──────────────────────────────────────

async def test_snapshots_default_returns_list(client):
    data = _parse(await _call_tool(client, "get_snapshots"))
    assert isinstance(data, list)


async def test_snapshots_date_range_limit(client):
    data = _parse(await _call_tool(client, "get_snapshots", {"start_date": "2025-01-01", "end_date": "2025-12-31", "limit": 5}))
    assert isinstance(data, list)
    assert len(data) <= 5


async def test_snapshots_camelcase(client):
    data = _parse(await _call_tool(client, "get_snapshots", {"limit": 1}))
    if not isinstance(data, list) or len(data) == 0:
        pytest.skip("Firestore 無快照資料")
    s = data[0]
    assert "cash_balance"     not in s
    assert "stock_value"      not in s
    assert "cashBalance"      in s or "date" in s


# ─── MCP-NEW-01: get_asset_tags ───────────────────────────────────────────────

async def test_get_asset_tags_returns_list(client):
    data = _parse(await _call_tool(client, "get_asset_tags"))
    assert isinstance(data, list)


async def test_get_asset_tags_structure(client):
    data = _parse(await _call_tool(client, "get_asset_tags"))
    if len(data) == 0:
        pytest.skip("Firestore 無 asset_tags 資料")
    at = data[0]
    assert_keys(at, ["stockCode", "tagName", "weightRatio"])
    assert "stock_code" not in at
    assert "tag_name"   not in at
    assert "weight_ratio" not in at


# ─── MCP-NEW-02: get_tag_correlation_matrix ───────────────────────────────────

async def test_get_tag_correlation_matrix_structure(client):
    data = _parse(await _call_tool(client, "get_tag_correlation_matrix"))
    assert isinstance(data, dict)
    assert "lastUpdated"    in data
    assert "entries"        in data
    assert "previousEntries" in data
    assert isinstance(data["entries"], list)


async def test_get_tag_correlation_matrix_entries_camelcase(client):
    data = _parse(await _call_tool(client, "get_tag_correlation_matrix"))
    for entry in data.get("entries", []):
        assert_keys(entry, ["tagA", "tagB", "rho"])
        assert "tag_a" not in entry
        assert "tag_b" not in entry


# ─── MCP-NEW-03: get_transactions ─────────────────────────────────────────────

async def test_get_transactions_returns_list(client):
    data = _parse(await _call_tool(client, "get_transactions"))
    assert isinstance(data, list)


async def test_get_transactions_camelcase(client):
    data = _parse(await _call_tool(client, "get_transactions"))
    if len(data) == 0:
        pytest.skip("Firestore 無交易紀錄")
    t = data[0]
    assert "stockId"      in t
    assert "pricePerShare" in t
    assert "stock_id"         not in t
    assert "price_per_share"  not in t


# ─── MCP-NEW-04: get_stock_history ───────────────────────────────────────────

async def test_get_stock_history_structure(client):
    data = _parse(await _call_tool(client, "get_stock_history", {"stock_id": "2330"}))
    assert isinstance(data, list)
    if len(data) > 0:
        assert_keys(data[0], ["timestamp", "open", "high", "low", "close", "volume"])


async def test_get_stock_history_date_range(client):
    data = _parse(await _call_tool(client, "get_stock_history", {"stock_id": "2330", "start_date": "2025-01-01", "end_date": "2025-03-31"}))
    assert isinstance(data, list)


async def test_get_stock_history_missing_id_returns_error(client):
    data = _parse(await _call_tool(client, "get_stock_history", {}))
    assert "error" in data


# ─── MCP-NEW-05: get_stock_chip ───────────────────────────────────────────────

async def test_get_stock_chip_structure(client):
    data = _parse(await _call_tool(client, "get_stock_chip", {"stock_id": "2330"}))
    assert isinstance(data, list)
    if len(data) > 0:
        assert_keys(data[0], ["date", "foreign", "trust", "dealer"])


async def test_get_stock_chip_missing_id_returns_error(client):
    data = _parse(await _call_tool(client, "get_stock_chip", {}))
    assert "error" in data


# ─── MCP-NEW-06: get_rebalance_snapshots ─────────────────────────────────────

async def test_get_rebalance_snapshots_returns_list(client):
    data = _parse(await _call_tool(client, "get_rebalance_snapshots"))
    assert isinstance(data, list)


async def test_get_rebalance_snapshots_limit(client):
    data = _parse(await _call_tool(client, "get_rebalance_snapshots", {"limit": 2}))
    assert isinstance(data, list)
    assert len(data) <= 2


async def test_get_rebalance_snapshots_structure(client):
    data = _parse(await _call_tool(client, "get_rebalance_snapshots", {"limit": 1}))
    if len(data) == 0:
        pytest.skip("Firestore 無再平衡快照")
    s = data[0]
    assert "id"          in s
    assert "createdAt"   in s
    assert "params"      in s
    assert "suggestions" in s
    assert "created_at"  not in s


# ─── MCP-NEW-07: get_portfolio_tag_analysis ───────────────────────────────────

async def test_get_portfolio_tag_analysis_structure(client):
    data = _parse(await _call_tool(client, "get_portfolio_tag_analysis"))
    assert isinstance(data, dict)
    assert "totalValue" in data
    assert "tags"       in data
    assert isinstance(data["totalValue"], (int, float))
    assert isinstance(data["tags"], list)


async def test_get_portfolio_tag_analysis_tag_fields(client):
    data = _parse(await _call_tool(client, "get_portfolio_tag_analysis"))
    for tag in data.get("tags", []):
        assert_keys(tag, ["tagName", "actualWeight", "holdings"])
        assert isinstance(tag["actualWeight"], (int, float))
        assert isinstance(tag["holdings"], list)


async def test_get_portfolio_tag_analysis_holding_fields(client):
    data = _parse(await _call_tool(client, "get_portfolio_tag_analysis"))
    for tag in data.get("tags", []):
        for h in tag.get("holdings", []):
            assert_keys(h, ["stockCode", "weightRatio", "contribution"])
            assert isinstance(h["contribution"], (int, float))


# ─── MCP-NEW-08: get_stock_fundamental ───────────────────────────────────────

# M8：fundamental 來源改為 FinMind + Firestore，欄位對齊 StockProfile DTO
FUNDAMENTAL_KEYS = [
    # 識別
    "stockId", "name", "market",
    # 評價
    "peRatio", "pbRatio", "eps", "bookValue",
    # 股利
    "dividendYield", "dividendRate", "payoutRatio", "exDividendDate",
    # 獲利能力
    "grossMargin", "operatingMargin", "netMargin", "roe",
    # 規模 / 成長
    "marketCap", "revenue", "revenueGrowth",
    # 風險 / 波動
    "fiftyTwoWeekHigh", "fiftyTwoWeekLow", "beta",
    # 同步資訊
    "updatedAt",
]


async def test_get_stock_fundamental_structure(client):
    data = _parse(await _call_tool(client, "get_stock_fundamental", {"stock_id": "2330"}))
    assert isinstance(data, dict)
    assert "stockId" in data
    # 有 Firestore 資料時才驗證完整 schema（FinMind 未同步時僅含 stockId/updatedAt）
    if data.get("updatedAt") is not None:
        assert_keys(data, FUNDAMENTAL_KEYS)


async def test_get_stock_fundamental_no_snake(client):
    data = _parse(await _call_tool(client, "get_stock_fundamental", {"stock_id": "2330"}))
    assert isinstance(data, dict)
    for key in data:
        assert "_" not in key, f"出現 snake_case 欄位：{key}"


async def test_get_stock_fundamental_stock_id_matches(client):
    data = _parse(await _call_tool(client, "get_stock_fundamental", {"stock_id": "2330"}))
    assert data.get("stockId") == "2330"


async def test_get_stock_fundamental_numeric_types(client):
    data = _parse(await _call_tool(client, "get_stock_fundamental", {"stock_id": "2330"}))
    # M8 DTO 數值欄位：若有值必須是數值型別
    numeric_fields = [
        "peRatio", "pbRatio", "eps", "bookValue",
        "dividendYield", "dividendRate", "payoutRatio",
        "grossMargin", "operatingMargin", "netMargin", "roe",
        "marketCap", "revenue", "revenueGrowth",
        "fiftyTwoWeekHigh", "fiftyTwoWeekLow", "beta",
    ]
    for field in numeric_fields:
        v = data.get(field)
        assert v is None or isinstance(v, (int, float)), f"{field} 型別錯誤：{v!r}"


async def test_get_stock_fundamental_missing_id_returns_error(client):
    data = _parse(await _call_tool(client, "get_stock_fundamental", {}))
    assert "error" in data
