"""M10 驗收：AI 個股交易策略 REST 端點 + MCP Tool"""
import json
import pytest
from tests.helpers import assert_success, assert_error


@pytest.fixture(autouse=True)
def clear_mcp_key(monkeypatch):
    """測試預設不啟用 MCP Key 驗證（與 test_m6_mcp.py 相同機制）"""
    monkeypatch.delenv("MCP_ACCESS_KEY", raising=False)

BASE = "/api/v1/trading-strategies"
MCP  = "/api/v1/mcp/message"

# 不與真實股票代碼衝突的測試用 code
_TEST_CODE = "_MCP_TEST_STRATEGY"

_VALID_PAYLOAD = {
    "stock_code":      _TEST_CODE,
    "stock_name":      "測試股",
    "trade_type":      "add",
    "trigger_price":   100.0,
    "reference_price": 105.0,
    "target_price":    120.0,
    "stop_loss_price": 90.0,
    "confidence":      "high",
    "timeframe":       "medium",
    "summary":         "外資連續買超，籌碼集中，加碼時機佳。",
    "expires_at":      None,
}


# ─── 共用 MCP 輔助 ────────────────────────────────────────────────────────────

async def _mcp_call(client, tool: str, args: dict):
    res = await client.post(MCP, json={
        "jsonrpc": "2.0", "id": 1,
        "method": "tools/call",
        "params": {"name": tool, "arguments": args},
    })
    assert res.status_code == 200
    return res


def _mcp_parse(res) -> object:
    return json.loads(res.json()["result"]["content"][0]["text"])


# ─── 清理 fixture ─────────────────────────────────────────────────────────────

@pytest.fixture(autouse=False)
async def cleanup(client):
    """測試後刪除測試策略（若存在）"""
    yield
    await client.delete(f"{BASE}/{_TEST_CODE}")


# ─── REST：GET /trading-strategies ───────────────────────────────────────────

async def test_get_all_returns_list(client):
    data = assert_success(await client.get(BASE))
    assert isinstance(data, list)


# ─── REST：GET /trading-strategies/{stock_code} 無資料 → null ────────────────

async def test_get_one_nonexistent_returns_null(client):
    data = assert_success(await client.get(f"{BASE}/NONEXISTENT_STOCK_99"))
    assert data is None


# ─── MCP：save_trading_strategy 建立策略 ─────────────────────────────────────

async def test_save_strategy_creates_document(client, cleanup):
    res = await _mcp_call(client, "save_trading_strategy", _VALID_PAYLOAD)
    result = _mcp_parse(res)

    assert "error" not in result, f"意外錯誤：{result}"
    assert result.get("stockCode") == _TEST_CODE
    assert result.get("dismissed") is False
    assert "createdAt" in result


# ─── MCP：get_trading_strategy 讀回策略 ──────────────────────────────────────

async def test_get_strategy_after_save(client, cleanup):
    # 先建立
    await _mcp_call(client, "save_trading_strategy", _VALID_PAYLOAD)

    res = await _mcp_call(client, "get_trading_strategy", {"stock_code": _TEST_CODE})
    result = _mcp_parse(res)

    assert result.get("stockCode") == _TEST_CODE
    strategy = result.get("strategy")
    assert strategy is not None
    assert strategy.get("tradeType") == "add"
    assert strategy.get("dismissed") is False


async def test_get_strategy_nonexistent_returns_null(client):
    res = await _mcp_call(client, "get_trading_strategy", {"stock_code": "NONEXISTENT99"})
    result = _mcp_parse(res)
    assert result.get("stockCode") == "NONEXISTENT99"
    assert result.get("strategy") is None


# ─── REST：PATCH /dismiss ─────────────────────────────────────────────────────

async def test_dismiss_sets_flag(client, cleanup):
    # 先透過 MCP 建立策略
    await _mcp_call(client, "save_trading_strategy", _VALID_PAYLOAD)

    data = assert_success(await client.patch(f"{BASE}/{_TEST_CODE}/dismiss"))
    assert data.get("dismissed") is True


async def test_dismiss_nonexistent_returns_404(client):
    assert_error(await client.patch(f"{BASE}/NONEXISTENT99/dismiss"), 404)


# ─── REST：save 後 dismissed 重置為 false ────────────────────────────────────

async def test_save_resets_dismissed(client, cleanup):
    # 建立 → dismiss → 再次 save → dismissed 應回 false
    await _mcp_call(client, "save_trading_strategy", _VALID_PAYLOAD)
    await client.patch(f"{BASE}/{_TEST_CODE}/dismiss")

    await _mcp_call(client, "save_trading_strategy", _VALID_PAYLOAD)
    res = await _mcp_call(client, "get_trading_strategy", {"stock_code": _TEST_CODE})
    strategy = _mcp_parse(res).get("strategy", {})
    assert strategy.get("dismissed") is False


# ─── REST：DELETE ─────────────────────────────────────────────────────────────

async def test_delete_removes_document(client):
    # 建立
    await _mcp_call(client, "save_trading_strategy", _VALID_PAYLOAD)
    # 刪除
    data = assert_success(await client.delete(f"{BASE}/{_TEST_CODE}"))
    assert data.get("deleted") == _TEST_CODE
    # 驗證已消失
    data2 = assert_success(await client.get(f"{BASE}/{_TEST_CODE}"))
    assert data2 is None


async def test_delete_nonexistent_returns_404(client):
    assert_error(await client.delete(f"{BASE}/NONEXISTENT99"), 404)


# ─── MCP 錯誤情境 ─────────────────────────────────────────────────────────────

async def test_save_strategy_invalid_trade_type(client):
    bad = {**_VALID_PAYLOAD, "trade_type": "invalid_type"}
    result = _mcp_parse(await _mcp_call(client, "save_trading_strategy", bad))
    assert "error" in result


async def test_save_strategy_summary_too_long(client):
    bad = {**_VALID_PAYLOAD, "summary": "x" * 101}
    result = _mcp_parse(await _mcp_call(client, "save_trading_strategy", bad))
    assert "error" in result


async def test_save_strategy_invalid_confidence(client):
    bad = {**_VALID_PAYLOAD, "confidence": "very_high"}
    result = _mcp_parse(await _mcp_call(client, "save_trading_strategy", bad))
    assert "error" in result


async def test_save_strategy_invalid_timeframe(client):
    bad = {**_VALID_PAYLOAD, "timeframe": "instant"}
    result = _mcp_parse(await _mcp_call(client, "save_trading_strategy", bad))
    assert "error" in result


# ─── M9 錯誤情境（update_tag / set_asset_tags）──────────────────────────────

async def test_update_tag_nonexistent_returns_error(client):
    result = _mcp_parse(await _mcp_call(client, "update_tag", {
        "tag_id": "NONEXISTENT_TAG_99",
        "base_risk": 0.5,
        "dry_run": False,
    }))
    assert "error" in result
    assert "not found" in result["error"].lower()


async def test_update_tag_base_risk_out_of_range(client):
    result = _mcp_parse(await _mcp_call(client, "update_tag", {
        "tag_id": "any",
        "base_risk": 5.0,   # > 1.0 → invalid
        "dry_run": True,
    }))
    assert "error" in result


async def test_set_asset_tags_empty_list_returns_error(client):
    result = _mcp_parse(await _mcp_call(client, "set_asset_tags", {
        "stock_code": "2330",
        "tags": [],
        "dry_run": True,
    }))
    assert "error" in result


async def test_set_asset_tags_sum_not_100(client):
    result = _mcp_parse(await _mcp_call(client, "set_asset_tags", {
        "stock_code": "2330",
        "tags": [{"tag_name": "半導體", "weight_ratio": 60}],
        "dry_run": True,
    }))
    assert "error" in result
    assert "totalWeightRatio" in result


async def test_set_asset_tags_duplicate_tag_name(client):
    result = _mcp_parse(await _mcp_call(client, "set_asset_tags", {
        "stock_code": "2330",
        "tags": [
            {"tag_name": "半導體", "weight_ratio": 50},
            {"tag_name": "半導體", "weight_ratio": 50},
        ],
        "dry_run": True,
    }))
    assert "error" in result


# ─── tools/list 計數 ──────────────────────────────────────────────────────────

async def test_tools_list_count_22(client):
    res = await client.post(MCP, json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
    tools = res.json()["result"]["tools"]
    assert len(tools) == 22, f"預期 22 個 tool，實際 {len(tools)}"
