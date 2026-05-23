# 個人理財雲端系統 — 後端開發任務清單

> 版本：5.0（2026-05-23）
> 參考文件：Back-End\CLAUDE.md

---

## 整合原則（必讀）

> Python FastAPI 是 Node.js Express 的**語言替換**，不是重新設計。
> 前端接口結構不變、Firestore DB 結構不變，Python 版本只需忠實複製 Node.js 的讀寫邏輯與回傳格式。

### 統一 Response 格式

所有端點一律使用：

```json
{ "success": true, "data": <payload> }
{ "success": false, "error": "訊息" }
```

### Firestore 欄位轉換規則

- Firestore 儲存：`snake_case`
- API 回傳：`camelCase`
- **例外**：`preferences/default` 的 `chart.*` 欄位在 Firestore 就是 camelCase（`showK`、`showMA5` 等）

---

## 現況（2026-05-23）

- **M1–M7 全部完成**：Python FastAPI 後端已完全取代 Node.js；`pytest tests/` → 121/121 passed
- **MCP 基礎完成**：8 個 Tool + SSE/Streamable HTTP 雙傳輸層

---

## 驗證策略（MCP 任務）

```bash
cd Back-End/python-backend
py -3.14 -m pytest tests/test_m6_mcp.py -v   # MCP 專項
py -3.14 -m pytest tests/ -v                  # 全套（既有 121 + 新增）
```

**測試原則**：
- `httpx.AsyncClient` + FastAPI `app`（不啟動外部 server）
- Firestore 真實連線
- 只驗證結構：欄位 camelCase、必要欄位存在、型別正確
- 不驗證數值：不斷言具體金額或報價

---

## 待辦：MCP Server 擴充

> 目標：讓 Claude Code 透過 MCP 取得完整投資組合分析所需資料，支援風險評估、再平衡決策與個股研究。
> 修改範圍：`services/mcp_service.py`（主體）、`tests/test_m6_mcp.py`（新增驗證）

### 需求對應缺口

| 需求 | 說明 | 缺口 |
|------|------|------|
| **Req 1** 庫存持股清單 | 代號、名稱、現值、成本價、持有數 | `get_holdings` 回傳 raw snake_case；缺 `currentPrice`、`currentValue` |
| **Req 2** Tag 配置 | Tag 名稱、風險值、目標/已配置比例；個股 Tag 比例 | 無 `get_asset_tags`；無已配置比例計算 |
| **Req 3** 再平衡模組 | 計算參數、Tag 矩陣、曝險金額 | 無 `get_tag_correlation_matrix`；無 `get_rebalance_snapshots` |
| **Req 4** 個股查詢 | 歷史報價、K 線、三大法人、交易紀錄 | 無 `get_stock_history`、`get_stock_chip`、`get_transactions` |
| **Req 5** 快照紀錄 | 範圍時間內所有快照 | `get_snapshots` 僅支援年份篩選；缺日期範圍；回傳 snake_case |

---

### 現有 Tool 修正（優先執行）

#### MCP-OPT-01 🔲 統一 camelCase 輸出格式

**影響 tool**：`get_holdings`、`get_watchlist`、`get_tags`、`get_rebalance_rules`、`get_foreign_assets`、`get_snapshots`（現全部回傳 Firestore raw snake_case）

**作法**：在 `mcp_service.py` 頂層新增共用函式：

```python
import re

def _to_camel(key: str) -> str:
    parts = key.split("_")
    return parts[0] + "".join(p.capitalize() for p in parts[1:])

def _convert_keys(obj):
    """遞迴將 dict key 從 snake_case 轉 camelCase（list 和非 dict 原樣回傳）"""
    if isinstance(obj, dict):
        return {_to_camel(k): _convert_keys(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_convert_keys(i) for i in obj]
    return obj
```

對所有直接呼叫 `doc.to_dict()` 的地方，將結果包一層 `_convert_keys()`。

**不處理**：`preferences/default` 的 `chart.*` 欄位（Firestore 已是 camelCase，_convert_keys 不影響已是 camelCase 的欄位）

---

#### MCP-OPT-02 🔲 `get_holdings` 增加現值注入

在 camelCase 修正基礎上，並行注入每筆持股的即時/收盤報價：

- 並行呼叫 `get_quote(stock_id)` 取得各持股報價
- 每筆持股新增：
  - `currentPrice: number | null`
  - `currentValue: number | null`（`sharesHeld × currentPrice`）
- 報價失敗（timeout/無資料）時設為 `null`，不中斷整體回傳

**inputSchema 不變**（無參數）

---

#### MCP-OPT-03 🔲 `get_snapshots` 支援日期範圍查詢

新增參數（舊參數 `year`、`limit` 保留，向下相容）：

| 參數 | 型別 | 說明 |
|------|------|------|
| `start_date` | string（選填）| YYYY-MM-DD，查詢起始日 |
| `end_date` | string（選填）| YYYY-MM-DD，查詢結束日 |

邏輯：
- `start_date` / `end_date` 存在時以日期範圍優先（忽略 `year`）
- 僅 `year` 時維持原邏輯（`{year}-01-01` ~ `{year}-12-31`）
- 日期範圍模式預設 `limit: 365`；無範圍模式維持預設 `limit: 30`

---

### 新增 Tool

#### MCP-NEW-01 🔲 `get_asset_tags` — 個股 Tag 配置清單（Req 2）

```
資料來源：asset_tags collection
inputSchema：無參數（回傳全部）
回傳：[{ id, stockCode, tagName, weightRatio }]
```

用途：搭配 `get_tags` + `get_holdings`，讓 AI 計算各 Tag 的實際配置比例。

---

#### MCP-NEW-02 🔲 `get_tag_correlation_matrix` — Tag 相關性矩陣（Req 3）

```
資料來源：tag_correlation_matrix/main（singleton）
inputSchema：無參數
回傳：{ lastUpdated: string, entries: [{ tagA, tagB, rho }], previousEntries: [...] | null }
無資料時：{ lastUpdated: <now>, entries: [], previousEntries: null }
```

用途：風險公式 `Risk_total = √(wᵀ × Σ × w)` 所需的相關性矩陣（見 `Docs/Risk and Rebalancing Model.md` 第五節）。

---

#### MCP-NEW-03 🔲 `get_transactions` — 交易紀錄（Req 4）

```
資料來源：transactions collection
inputSchema：{ stock_id?: string }（選填，篩選單一個股）
回傳：[{ id, stockId, type, date, shares, pricePerShare, fee, note, createdAt }]（依 date 升冪）
```

用途：分析買賣時機、持倉成本演進。

---

#### MCP-NEW-04 🔲 `get_stock_history` — 個股歷史 K 線（Req 4）

```
資料來源：yahoo_finance._yf_chart()（已有實作，直接複用）
inputSchema：
  stock_id:   string（必填）
  start_date: string（選填，YYYY-MM-DD，預設 180 日前）
  end_date:   string（選填，YYYY-MM-DD，預設今日）
  interval:   string（選填，'1d' | '1wk' | '1mo'，預設 '1d'）
回傳：[{ timestamp, open, high, low, close, volume }]
```

用途：技術分析；波動率計算（再平衡動態門檻 `Current_Vol / Historical_Vol` 所需）。

---

#### MCP-NEW-05 🔲 `get_stock_chip` — 三大法人籌碼（Req 4）

```
資料來源：yahoo_finance 模組 TWSE T86 爬蟲（GET /stocks/{id}/chip 已實作）
inputSchema：{ stock_id: string }（必填）
回傳：[{ date, foreign, trust, dealer }]（最近 20 筆，依日期降冪）
```

用途：法人動向判斷。

---

#### MCP-NEW-06 🔲 `get_rebalance_snapshots` — 再平衡歷史快照（Req 3）

```
資料來源：rebalance_snapshots collection
inputSchema：{ limit?: integer }（預設 5）
回傳：[{
  id, createdAt,
  params: { totalAsset, baseThreshold, liquidityCapRatio, marketState },
  suggestions: [{ stockCode, stockName, action, shares, estimatedAmount, isLiquidityLimited }]
}]
```

用途：檢視歷次再平衡建議，評估策略有效性。

---

#### MCP-NEW-07 🔲 `get_portfolio_tag_analysis` — 投組 Tag 配置分析（Req 2 + 3 合成）

最高價值工具：在 service 層完成聚合計算，AI 直接取得結果，無需自行處理多源資料。

**資料來源**：`holdings` + `asset_tags` + `tags` + 即時報價（三路並行）

**計算邏輯**（參照 `Docs/Risk and Rebalancing Model.md` 第四節）：

```
1. 取 holdings（全部）+ 並行 get_quote(stock_id) 取即時/收盤價
2. totalValue = Σ(sharesHeld × currentPrice)
3. 取 asset_tags（個股→Tag 的 weightRatio）
4. 取 tags（targetWeight、dynamicRisk、baseRisk、fallbackBehavior）
5. 每個 Tag：
   actualWeight = Σ_i(sharesHeld_i × price_i × weightRatio(i, tag)) / totalValue
   deviation    = actualWeight - targetWeight（targetWeight 為 null 時設 null）
```

**回傳結構**：

```json
{
  "totalValue": 1234567.89,
  "tags": [
    {
      "tagName": "高股息",
      "targetWeight": 0.30,
      "actualWeight": 0.28,
      "deviation": -0.02,
      "baseRisk": 0.8,
      "dynamicRisk": 1.1,
      "holdings": [
        { "stockCode": "0056", "stockName": "元大高股息", "weightRatio": 1.0, "contribution": 0.28 }
      ]
    }
  ]
}
```

- `deviation` 為 `null` 若 `targetWeight` 為 `null`（fallback tag）
- `currentPrice` 取得失敗的個股：排除於 `totalValue` 與 `actualWeight` 計算（不中斷整體）

---

### 驗證關卡（`tests/test_m6_mcp.py` 新增）

| Test ID | 驗證項目 |
|---------|---------|
| `test_holdings_camelcase` | `sharesHeld`、`avgCost` 等欄位為 camelCase；含 `currentPrice` 欄位 |
| `test_holdings_current_price` | `currentPrice` 型別為 number 或 null |
| `test_snapshots_date_range` | `start_date`/`end_date` 篩選回傳筆數 ≤ `limit` |
| `test_get_asset_tags` | 含 `stockCode`、`tagName`、`weightRatio` 欄位 |
| `test_get_tag_correlation_matrix` | 含 `lastUpdated`、`entries` 陣列（可空）、`previousEntries` |
| `test_get_transactions` | 欄位為 camelCase；含 `stockId`、`type`、`date`、`shares` |
| `test_get_stock_history` | 含 `timestamp`、`open`、`high`、`low`、`close`、`volume` |
| `test_get_stock_chip` | 含 `date`、`foreign`、`trust`、`dealer` |
| `test_get_rebalance_snapshots` | 含 `params`、`suggestions` 陣列 |
| `test_get_portfolio_tag_analysis` | 含 `totalValue`（number）、`tags[].actualWeight`（number） |

全數通過後：`pytest tests/` → 0 failures

---

## DTO 對齊規格（MCP 實作參考）

### Holdings（`holdings` collection，doc.id = stockId）

| Firestore 欄位 | API/MCP 欄位 | 備註 |
|---|---|---|
| `stock_id` | `stockId` | = doc.id |
| `stock_name` | `stockName` | 可為 undefined |
| `shares_held` | `sharesHeld` | |
| `avg_cost` | `avgCost` | |
| `total_cost` | `totalCost` | |
| `realized_profit` | `realizedProfit` | |
| `cost_method` | `costMethod` | fallback `'preserve_method'` |
| `updated_at` | `updatedAt` | Timestamp → ISO string |
| `sort_index` | `sortIndex` | fallback `0` |
| *(MCP 注入)* | `currentPrice` | `get_quote()` 注入，null on failure |
| *(MCP 計算)* | `currentValue` | `sharesHeld × currentPrice`，null on failure |

### Tags（`tags` collection，doc.id = 自動 UUID）

| Firestore 欄位 | API/MCP 欄位 | 備註 |
|---|---|---|
| `name` | `name` | |
| `base_risk` | `baseRisk` | 0–3 |
| `dynamic_risk` | `dynamicRisk` | fallback `base_risk` |
| `target_weight` | `targetWeight` | `null` |
| `fallback_behavior` | `fallbackBehavior` | fallback `'hold'` |
| `trigger_direction` | `triggerDirection` | fallback `'both'` |
| `market_state_presets.risk_on` | `marketStatePresets.riskOn` | |
| `market_state_presets.risk_off` | `marketStatePresets.riskOff` | |
| `market_state_presets.liquidity_dry` | `marketStatePresets.liquidityDry` | |

### AssetTags（`asset_tags` collection，doc.id = 自動 UUID）

| Firestore | API/MCP | 備註 |
|---|---|---|
| `stock_code` | `stockCode` | |
| `tag_name` | `tagName` | |
| `weight_ratio` | `weightRatio` | |
| *(doc.id)* | `id` | |

### Transactions（`transactions` collection，doc.id = 自動）

| Firestore | API/MCP | 備註 |
|---|---|---|
| `stock_id` | `stockId` | |
| `type` | `type` | `'buy' \| 'sell'` |
| `date` | `date` | Timestamp → ISO string |
| `shares` | `shares` | |
| `price_per_share` | `pricePerShare` | |
| `fee` | `fee` | |
| `note` | `note` | fallback `''` |
| `created_at` | `createdAt` | Timestamp → ISO string |
| *(doc.id)* | `id` | |

`GET` 依 `date` 升冪；支援 `stock_id` 篩選。

### DailySnapshot（`daily_snapshots` collection，doc.id = YYYY-MM-DD）

| Firestore | API/MCP | 備註 |
|---|---|---|
| `date` | `date` | |
| `exec_capital` | `execCapital` | fallback `0` |
| `reinvest` | `reinvest` | fallback `0` |
| `stock_value` | `stockValue` | fallback `0` |
| `cash_balance` | `cashBalance` | fallback `0` |
| `forex_value` | `forexValue` | fallback `0` |
| `unrealized_profit` | `unrealizedProfit` | fallback `0` |
| `note` | `note` | fallback `''` |
| `holdings` | `holdings` | array，子欄位已是 camelCase |
| `vix` | `vix` | `null` |
| `market_state_auto` | `marketStateAuto` | `null` |
| `recorded_at` | `recordedAt` | Timestamp → ISO string |

### TagCorrelationMatrix（`tag_correlation_matrix/main`，singleton）

| Firestore | API/MCP | 備註 |
|---|---|---|
| `last_updated` | `lastUpdated` | Timestamp → ISO string |
| `entries[].tag_a` | `entries[].tagA` | |
| `entries[].tag_b` | `entries[].tagB` | |
| `entries[].rho` | `entries[].rho` | |
| `previous_entries` | `previousEntries` | 同結構或 `null` |

無資料時回傳 `{ lastUpdated: now, entries: [], previousEntries: null }`。

### RebalanceSnapshot（`rebalance_snapshots`，doc.id = 自動 UUID）

| Firestore | API/MCP | 備註 |
|---|---|---|
| *(doc.id)* | `id` | |
| `created_at` | `createdAt` | Timestamp → ISO string |
| `params.total_asset` | `params.totalAsset` | |
| `params.base_threshold` | `params.baseThreshold` | |
| `params.liquidity_cap_ratio` | `params.liquidityCapRatio` | |
| `params.market_state` | `params.marketState` | |
| `suggestions[].stock_code` | `suggestions[].stockCode` | |
| `suggestions[].stock_name` | `suggestions[].stockName` | |
| `suggestions[].action` | `suggestions[].action` | `'buy' \| 'sell' \| 'hold'` |
| `suggestions[].shares` | `suggestions[].shares` | |
| `suggestions[].estimated_amount` | `suggestions[].estimatedAmount` | |
| `suggestions[].is_liquidity_limited` | `suggestions[].isLiquidityLimited` | |

### Stock History（StockHistoryPoint[]）

```json
{ "timestamp": number, "open": number, "high": number, "low": number, "close": number, "volume": number }
```

### Chip（ChipDTO[]）

```json
{ "date": "YYYY-MM-DD", "foreign": number, "trust": number, "dealer": number }
```
