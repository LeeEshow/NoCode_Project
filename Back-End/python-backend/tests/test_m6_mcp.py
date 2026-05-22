"""M6 驗證：MCP Server — SSE 連線 + JSON-RPC 2.0"""
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
}


# ─── SSE ──────────────────────────────────────────────────────────────────────
# httpx ASGITransport 會等待整個 ASGI app 完成，無法測試無限 SSE stream。
# 改用直接 ASGI 呼叫：receive() 回傳 http.disconnect，讓 Starlette 的
# listen_for_disconnect task 主動取消 task group，使 app 正常退出。

async def _sse_direct(path: str = "/api/v1/mcp/sse", qs: bytes = b""):
    """直接呼叫 ASGI app，回傳 (status, content_type, first_body)"""
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
    assert status == 200, f"Expected 200, got {status}"
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
    body = res.json()
    assert "result" in body
    tools = body["result"]["tools"]
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


# ─── tools/call ───────────────────────────────────────────────────────────────

async def test_mcp_tools_call_returns_content(client):
    res = await client.post(
        f"{BASE}/message",
        json={
            "jsonrpc": "2.0",
            "id": 5,
            "method": "tools/call",
            "params": {"name": "get_tags", "arguments": {}},
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert "result" in body
    result = body["result"]
    assert "content" in result
    assert isinstance(result["content"], list)
    assert len(result["content"]) > 0
    assert result["content"][0]["type"] == "text"
    assert isinstance(result["content"][0]["text"], str)


async def test_mcp_tools_call_missing_name_returns_error(client):
    res = await client.post(
        f"{BASE}/message",
        json={
            "jsonrpc": "2.0",
            "id": 6,
            "method": "tools/call",
            "params": {"arguments": {}},
        },
    )
    body = res.json()
    assert "error" in body
    assert body["error"]["code"] == -32602


async def test_mcp_tools_call_unknown_tool_returns_error_content(client):
    res = await client.post(
        f"{BASE}/message",
        json={
            "jsonrpc": "2.0",
            "id": 7,
            "method": "tools/call",
            "params": {"name": "does_not_exist", "arguments": {}},
        },
    )
    body = res.json()
    assert "result" in body
    text = body["result"]["content"][0]["text"]
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
