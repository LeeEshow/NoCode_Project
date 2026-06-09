"""M10/M13 驗收：AI 個股交易策略 REST 端點 + MCP Tool"""
import json
import pytest
from tests.helpers import assert_success, assert_error


@pytest.fixture(autouse=True)
def clear_mcp_key(monkeypatch):
    """測試預設不啟用 MCP Key 驗證"""
    monkeypatch.delenv("MCP_ACCESS_KEY", raising=False)


BASE = "/api/v1/trading-strategies"
MCP  = "/api/v1/mcp/message"

_TEST_CODE = "_MCP_TEST_STRATEGY"

# ── 新 schema（M13）──────────────────────────────────────────────────────────
_VALID_PAYLOAD = {
    "stock_code":             _TEST_CODE,
    "stock_name":             "測試股",
    "trade_type":             "add",
    "reference_price":        105.0,
    "stop_loss_price":        90.0,
    "target_price_low":       120.0,
    "target_price_high":      130.0,
    "trigger_condition":      "自營商轉買 + 站穩 MA5",
    "invalidation_condition": "收盤跌破 90，策略失效",
    "confidence":             "high",
    "timeframe":              "medium",
    "summary":                "外資連續買超，籌碼集中，加碼時機佳。",
    "expires_at":             None,
    "tranches": [
        {
            "batch":             1,
            "price_low":         103.0,
            "price_high":        106.0,
            "size_ratio":        0.6,
            "shares":            600,
            "trigger_condition": "現價可進場",
            "trigger_rules":     [{"type": "price_in_range"}],
            "status":            "pending",
        },
        {
            "batch":             2,
            "price_low":         100.0,
            "price_high":        103.0,
            "size_ratio":        0.4,
            "shares":            400,
            "trigger_condition": "自營商轉買",
            "trigger_rules":     [{"type": "chip_dealer_buy", "period": 1}],
            "status":            "pending",
        },
    ],
}

# ── 舊 schema（向後相容）────────────────────────────────────────────────────────
_LEGACY_PAYLOAD = {
    "stock_code":      _TEST_CODE,
    "stock_name":      "測試股",
    "trade_type":      "add",
    "trigger_price":   100.0,
    "reference_price": 105.0,
    "stop_loss_price": 90.0,
    "confidence":      "high",
    "timeframe":       "medium",
    "summary":         "測試舊版向後相容",
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
    yield
    await client.delete(f"{BASE}/{_TEST_CODE}")


# ─── REST：GET /trading-strategies ───────────────────────────────────────────

async def test_get_all_returns_list(client):
    data = assert_success(await client.get(BASE))
    assert isinstance(data, list)


# ─── REST：GET /trading-strategies/{stock_code} ──────────────────────────────

async def test_get_one_nonexistent_returns_null(client):
    data = assert_success(await client.get(f"{BASE}/NONEXISTENT_STOCK_99"))
    assert data is None


# ─── MCP：save_trading_strategy 新 schema（M13）─────────────────────────────

async def test_save_strategy_new_schema(client, cleanup):
    res    = await _mcp_call(client, "save_trading_strategy", _VALID_PAYLOAD)
    result = _mcp_parse(res)

    assert "error" not in result, f"意外錯誤：{result}"
    assert result.get("stockCode") == _TEST_CODE
    assert result.get("dismissed") is False
    assert result.get("status") == "active"
    assert "createdAt" in result
    # 新欄位驗證
    assert isinstance(result.get("tranches"), list)
    assert len(result["tranches"]) == 2
    assert result.get("stopLossPrice") == 90.0
    assert result.get("targetPriceLow") == 120.0
    assert result.get("targetPriceHigh") == 130.0
    # riskRewardRatio 後端自動計算：(120 - 105) / (105 - 90) = 1.0
    assert result.get("riskRewardRatio") == 1.0


async def test_tranches_rule_statuses_keys_preserved(client, cleanup):
    """chip_dealer_buy 的 ruleStatuses key 不應被 camelCase 轉換（H-2）"""
    await _mcp_call(client, "save_trading_strategy", _VALID_PAYLOAD)
    res      = await _mcp_call(client, "get_trading_strategy", {"stock_code": _TEST_CODE})
    strategy = _mcp_parse(res).get("strategy", {})
    tranches = strategy.get("tranches", [])
    assert len(tranches) == 2
    tranche2 = tranches[1]
    # ruleStatuses 的 key 應保持 snake_case（chip_dealer_buy），不被轉成 chipDealerBuy
    rule_statuses = tranche2.get("ruleStatuses", {})
    assert "chip_dealer_buy" in rule_statuses, f"期望 chip_dealer_buy，實際 keys: {list(rule_statuses.keys())}"
    assert rule_statuses["chip_dealer_buy"] is None  # 初始值 null


async def test_risk_reward_ratio_watch_type_is_null(client, cleanup):
    """watch 類型的 riskRewardRatio 應為 null（M-1）"""
    payload = {**_VALID_PAYLOAD, "trade_type": "watch"}
    res    = await _mcp_call(client, "save_trading_strategy", payload)
    result = _mcp_parse(res)
    assert "error" not in result
    assert result.get("riskRewardRatio") is None


async def test_risk_reward_ratio_stop_loss_above_ref_is_null(client, cleanup):
    """停損 >= 參考價時 riskRewardRatio 應為 null（M-1）"""
    payload = {**_VALID_PAYLOAD, "stop_loss_price": 110.0}  # > reference_price 105
    res    = await _mcp_call(client, "save_trading_strategy", payload)
    result = _mcp_parse(res)
    assert "error" not in result
    assert result.get("riskRewardRatio") is None


# ─── MCP：save_trading_strategy 舊 schema 向後相容 ───────────────────────────

async def test_save_strategy_legacy_trigger_price(client, cleanup):
    """舊版 trigger_price 仍可接受，自動轉換為 tranches[0]（向後相容）"""
    res    = await _mcp_call(client, "save_trading_strategy", _LEGACY_PAYLOAD)
    result = _mcp_parse(res)

    assert "error" not in result, f"意外錯誤：{result}"
    assert result.get("stockCode") == _TEST_CODE
    assert result.get("dismissed") is False
    assert "createdAt" in result
    # 向後相容：tranches[0] 應存在
    tranches = result.get("tranches", [])
    assert len(tranches) == 1
    assert tranches[0].get("priceLow") == 100.0
    assert tranches[0].get("priceHigh") == 100.0
    assert tranches[0].get("sizeRatio") == 1.0
    assert tranches[0].get("triggerRules") == []
    assert tranches[0].get("ruleStatuses") == {}


# ─── MCP：get_trading_strategy ───────────────────────────────────────────────

async def test_get_strategy_after_save(client, cleanup):
    await _mcp_call(client, "save_trading_strategy", _VALID_PAYLOAD)

    res      = await _mcp_call(client, "get_trading_strategy", {"stock_code": _TEST_CODE})
    result   = _mcp_parse(res)
    strategy = result.get("strategy")

    assert strategy is not None
    assert strategy.get("tradeType") == "add"
    assert strategy.get("dismissed") is False
    assert strategy.get("status") == "active"
    assert isinstance(strategy.get("tranches"), list)


async def test_get_strategy_nonexistent_returns_null(client):
    res    = await _mcp_call(client, "get_trading_strategy", {"stock_code": "NONEXISTENT99"})
    result = _mcp_parse(res)
    assert result.get("stockCode") == "NONEXISTENT99"
    assert result.get("strategy") is None


# ─── REST：PATCH /dismiss ─────────────────────────────────────────────────────

async def test_dismiss_sets_flag_and_status(client, cleanup):
    await _mcp_call(client, "save_trading_strategy", _VALID_PAYLOAD)
    data = assert_success(await client.patch(f"{BASE}/{_TEST_CODE}/dismiss"))
    assert data.get("dismissed") is True
    assert data.get("status") == "dismissed"


async def test_dismiss_nonexistent_returns_404(client):
    assert_error(await client.patch(f"{BASE}/NONEXISTENT99/dismiss"), 404)


# ─── REST：save 後 dismissed 重置為 false ────────────────────────────────────

async def test_save_resets_dismissed(client, cleanup):
    await _mcp_call(client, "save_trading_strategy", _VALID_PAYLOAD)
    await client.patch(f"{BASE}/{_TEST_CODE}/dismiss")
    await _mcp_call(client, "save_trading_strategy", _VALID_PAYLOAD)

    res      = await _mcp_call(client, "get_trading_strategy", {"stock_code": _TEST_CODE})
    strategy = _mcp_parse(res).get("strategy", {})
    assert strategy.get("dismissed") is False
    assert strategy.get("status") == "active"


# ─── REST：PATCH /rule-status（M13 新端點）────────────────────────────────────

async def test_rule_status_updates_manual(client, cleanup):
    """PATCH /rule-status 更新 manual rule 狀態"""
    payload_with_manual = {
        **_VALID_PAYLOAD,
        "tranches": [
            {
                "batch":             1,
                "price_low":         100.0,
                "price_high":        106.0,
                "size_ratio":        1.0,
                "shares":            1000,
                "trigger_condition": "Fed 鴿派確認",
                "trigger_rules":     [{"type": "manual"}],
                "status":            "pending",
            }
        ],
    }
    await _mcp_call(client, "save_trading_strategy", payload_with_manual)

    res  = await client.patch(
        f"{BASE}/{_TEST_CODE}/rule-status",
        json={"batch": 1, "ruleType": "manual", "confirmed": True},
    )
    data = assert_success(res)
    tranche = data["tranches"][0]
    assert tranche["ruleStatuses"].get("manual") is True
    # manual 為唯一 rule 且為 true → tranche.status = triggered
    assert tranche["status"] == "triggered"
    assert data["status"] == "triggered"


async def test_rule_status_nonexistent_strategy_404(client):
    assert_error(
        await client.patch(
            f"{BASE}/NONEXISTENT99/rule-status",
            json={"batch": 1, "ruleType": "manual", "confirmed": True},
        ),
        404,
    )


async def test_rule_status_wrong_rule_type_400(client, cleanup):
    await _mcp_call(client, "save_trading_strategy", _VALID_PAYLOAD)
    assert_error(
        await client.patch(
            f"{BASE}/{_TEST_CODE}/rule-status",
            json={"batch": 1, "ruleType": "chip_dealer_buy", "confirmed": True},
        ),
        400,
    )


async def test_rule_status_wrong_batch_400(client, cleanup):
    await _mcp_call(client, "save_trading_strategy", _VALID_PAYLOAD)
    assert_error(
        await client.patch(
            f"{BASE}/{_TEST_CODE}/rule-status",
            json={"batch": 99, "ruleType": "manual", "confirmed": True},
        ),
        400,
    )


async def test_rule_status_no_manual_rule_400(client, cleanup):
    """tranche 沒有 manual rule 時應回 400"""
    await _mcp_call(client, "save_trading_strategy", _VALID_PAYLOAD)
    # batch 1 只有 price_in_range，無 manual
    assert_error(
        await client.patch(
            f"{BASE}/{_TEST_CODE}/rule-status",
            json={"batch": 1, "ruleType": "manual", "confirmed": True},
        ),
        400,
    )


# ─── REST：DELETE ─────────────────────────────────────────────────────────────

async def test_delete_removes_document(client):
    await _mcp_call(client, "save_trading_strategy", _VALID_PAYLOAD)
    data = assert_success(await client.delete(f"{BASE}/{_TEST_CODE}"))
    assert data.get("deleted") == _TEST_CODE
    data2 = assert_success(await client.get(f"{BASE}/{_TEST_CODE}"))
    assert data2 is None


async def test_delete_nonexistent_returns_404(client):
    assert_error(await client.delete(f"{BASE}/NONEXISTENT99"), 404)


# ─── MCP：驗證邏輯 ──────────────────────────────────────────────────────────────

async def test_save_strategy_invalid_trade_type(client):
    bad    = {**_VALID_PAYLOAD, "trade_type": "invalid_type"}
    result = _mcp_parse(await _mcp_call(client, "save_trading_strategy", bad))
    assert "error" in result


async def test_save_strategy_summary_too_long(client):
    bad    = {**_VALID_PAYLOAD, "summary": "x" * 101}
    result = _mcp_parse(await _mcp_call(client, "save_trading_strategy", bad))
    assert "error" in result


async def test_save_strategy_invalid_confidence(client):
    bad    = {**_VALID_PAYLOAD, "confidence": "very_high"}
    result = _mcp_parse(await _mcp_call(client, "save_trading_strategy", bad))
    assert "error" in result


async def test_save_strategy_invalid_timeframe(client):
    bad    = {**_VALID_PAYLOAD, "timeframe": "instant"}
    result = _mcp_parse(await _mcp_call(client, "save_trading_strategy", bad))
    assert "error" in result


async def test_save_strategy_tranches_size_ratio_not_sum_one(client):
    """sizeRatio 合計非 1.0 → 錯誤"""
    bad_tranches = [
        {**_VALID_PAYLOAD["tranches"][0], "size_ratio": 0.3},
        {**_VALID_PAYLOAD["tranches"][1], "size_ratio": 0.3},  # sum=0.6 ≠ 1.0
    ]
    bad    = {**_VALID_PAYLOAD, "tranches": bad_tranches}
    result = _mcp_parse(await _mcp_call(client, "save_trading_strategy", bad))
    assert "error" in result


async def test_save_strategy_tranches_exceeds_4(client):
    """tranches 超過 4 批 → 錯誤"""
    t = _VALID_PAYLOAD["tranches"][0]
    bad = {
        **_VALID_PAYLOAD,
        "tranches": [{**t, "batch": i + 1, "size_ratio": 0.2} for i in range(5)],
    }
    result = _mcp_parse(await _mcp_call(client, "save_trading_strategy", bad))
    assert "error" in result


async def test_save_strategy_no_tranches_and_no_trigger_price(client):
    """tranches 和 trigger_price 都缺 → 錯誤"""
    bad = {k: v for k, v in _VALID_PAYLOAD.items() if k != "tranches"}
    result = _mcp_parse(await _mcp_call(client, "save_trading_strategy", bad))
    assert "error" in result


async def test_save_strategy_chip_rule_missing_period(client):
    """chip_dealer_buy 缺 period → 錯誤"""
    bad_tranches = [
        {
            **_VALID_PAYLOAD["tranches"][0],
            "size_ratio": 1.0,
            "trigger_rules": [{"type": "chip_dealer_buy"}],  # 缺 period
        }
    ]
    bad    = {**_VALID_PAYLOAD, "tranches": bad_tranches}
    result = _mcp_parse(await _mcp_call(client, "save_trading_strategy", bad))
    assert "error" in result
    assert "period" in result["error"]


async def test_save_strategy_price_above_missing_value(client):
    """price_above 缺 value → 錯誤"""
    bad_tranches = [
        {
            **_VALID_PAYLOAD["tranches"][0],
            "size_ratio": 1.0,
            "trigger_rules": [{"type": "price_above"}],  # 缺 value
        }
    ]
    bad    = {**_VALID_PAYLOAD, "tranches": bad_tranches}
    result = _mcp_parse(await _mcp_call(client, "save_trading_strategy", bad))
    assert "error" in result
    assert "value" in result["error"]


# ─── M9 錯誤情境（保留既有測試）────────────────────────────────────────────────

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
        "base_risk": 5.0,
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
    res   = await client.post(MCP, json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
    tools = res.json()["result"]["tools"]
    assert len(tools) == 22, f"預期 22 個 tool，實際 {len(tools)}"
