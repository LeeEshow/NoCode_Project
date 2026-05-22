# 個人理財雲端系統 — 後端開發任務清單

> 版本：4.0（2026-05-22）
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

## 驗證策略

### 開發期：pytest 結構驗證（每個里程碑完成後必跑）

每個里程碑完成後，必須跑對應的 pytest 測試套件並全數通過，才可進入下一個里程碑。

**測試原則**：
- 使用 `httpx.AsyncClient` + FastAPI `app`（不啟動外部 server）
- Firestore 讀寫使用真實連線（與 Node.js 共用同一資料庫）
- **只驗證結構**：response 格式、欄位名稱（camelCase）、型別、null/預設值行為
- **不驗證數值**：不斷言具體數字，避免因 Firestore 資料異動而失敗

**測試目錄結構**：

```
Back-End/python-backend/
└── tests/
    ├── conftest.py               # AsyncClient fixture、auth header（bypass EasyAuth）
    ├── helpers.py                # assert_success()、assert_keys()、assert_types() 共用函式
    ├── test_m1_health.py         # M1 驗證：GET /health、response wrapper 格式
    ├── test_m2_holdings.py       # M2-A/B 驗證：holdings CRUD + /prices 欄位、tags 嵌套
    ├── test_m2_watchlist.py      # M2-C 驗證：watchlist + livePrice/judgment 注入
    ├── test_m2_transactions.py   # M2-D 驗證：transactions + 升冪排序
    ├── test_m2_assets.py         # M2-E 驗證：foreign-assets + liveRate 注入
    ├── test_m2_plans.py          # M2-F 驗證：plan singleton + 預設值回傳
    ├── test_m3_tags.py           # M3-A/B 驗證：tags CRUD + marketStatePresets 結構
    ├── test_m3_market_state.py   # M3-C 驗證：market-state GET/PUT
    ├── test_m3_correlation.py    # M3-D 驗證：tag-correlation-matrix + previousEntries
    ├── test_m3_rebalance.py      # M3-E 驗證：rebalance-rules + rebalance-snapshots
    ├── test_m4_market.py         # M4-C 驗證：indices/forex-rates/export-indicator 結構
    ├── test_m4_stocks.py         # M4-D 驗證：stocks search/quote/history/profile/chip
    ├── test_m5_snapshots.py      # M5-B 驗證：snapshots CRUD + holdings 子欄位 camelCase
    ├── test_m5_settings.py       # M5-C 驗證：settings GET null、PUT 回傳結構
    ├── test_m5_preferences.py    # M5-D 驗證：preferences camelCase 欄位儲存/讀取
    └── test_m6_mcp.py            # M6 驗證：SSE ping、JSON-RPC tools/list 格式
```

**共用驗證函式（`helpers.py`）**：

```python
def assert_success(res, status=200):
    assert res.status_code == status
    body = res.json()
    assert body["success"] is True
    assert "data" in body
    return body["data"]

def assert_keys(obj, required_keys):
    """驗證 dict 包含所有必要 camelCase 欄位"""
    for key in required_keys:
        assert key in obj, f"缺少欄位：{key}"

def assert_no_snake(obj):
    """驗證 dict 第一層沒有 snake_case 欄位"""
    for key in obj:
        assert "_" not in key, f"欄位應為 camelCase，但收到：{key}"
```

**各里程碑通過標準**：

| 里程碑 | pytest 指令 | 通過條件 |
|--------|------------|---------|
| M1 | `pytest tests/test_m1_health.py` | response wrapper 格式正確 |
| M2 | `pytest tests/test_m2_*.py` | 所有 CRUD 欄位為 camelCase；注入欄位存在 |
| M3 | `pytest tests/test_m3_*.py` | Tag/MarketState/Correlation/Rebalance 結構正確 |
| M4 | `pytest tests/test_m4_*.py` | 市場資料結構與欄位順序正確 |
| M5 | `pytest tests/test_m5_*.py` | Snapshot holdings 子欄位 camelCase；Settings null；Preferences camelCase |
| M6 | `pytest tests/test_m6_mcp.py` | JSON-RPC 格式正確 |
| 全部 | `pytest tests/` | 0 failures，進入 M7 |

### 部署前：雙後端並行比對（方案一，必要時使用）

Node.js（port 3001）與 Python（port 8000）同時運行，以比對腳本對每個 endpoint 各打一次，自動 diff response 結構與欄位值。保留供最終驗證或排查異常時使用。

---

## DTO 對齊規格（Node.js 原始碼萃取）

### Holdings（`holdings` collection，doc.id = stockId）

| Firestore 欄位 | API 欄位 | 備註 |
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
| *(注入)* | `currentPrice` | Controller 注入，不存 Firestore |
| *(注入)* | `change` | |
| *(注入)* | `changePercent` | |
| *(注入)* | `tags` | `GET /holdings` 附加 `[{ id, tagName, weightRatio }]` |

**GET /holdings/prices** 回傳結構（`changePct` 非 `changePercent`）：
```json
{ "stockCode": str, "currentPrice": num, "change": num, "changePct": num, "unrealizedProfit": num }
```

### Tags（`tags` collection，doc.id = 自動 UUID）

| Firestore 欄位 | API 欄位 | 備註 |
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

`marketStatePresets` 整體為 `null` 或物件（各子值可為 `null`）。

### AssetTags（`asset_tags` collection，doc.id = 自動 UUID）

| Firestore | API | 備註 |
|---|---|---|
| `stock_code` | `stockCode` | |
| `tag_name` | `tagName` | |
| `weight_ratio` | `weightRatio` | |
| *(doc.id)* | `id` | |

### Transactions（`transactions` collection，doc.id = 自動）

| Firestore | API | 備註 |
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

`GET /transactions` 依 `date` 升冪排列；支援 `?stockId=` 篩選。

### Watchlist（`watchlist` collection，doc.id = stockId）

| Firestore | API | 備註 |
|---|---|---|
| *(doc.id)* | `stockId` | |
| `stock_name` | `stockName` | fallback `''` |
| `target_price` | `targetPrice` | |
| `note` | `note` | fallback `''` |
| `created_at` | `createdAt` | Timestamp → Date |
| `updated_at` | `updatedAt` | Timestamp → Date |
| `sort_index` | `sortIndex` | fallback `0` |
| *(注入)* | `livePrice` | Controller 注入 `null` on failure |
| *(注入)* | `change` | |
| *(注入)* | `changePercent` | |
| *(注入)* | `judgment` | `'買進' \| '觀望' \| null` |

`judgment` 邏輯：`livePrice !== null && livePrice <= targetPrice → '買進'`，否則 `'觀望'`。

### ForeignAssets（`foreign_assets` collection，doc.id = 自動）

| Firestore | API | 備註 |
|---|---|---|
| `type` | `type` | `'活存' \| '定存' \| '債券'` |
| `name` | `name` | fallback `''` |
| `currency` | `currency` | 大寫 |
| `amount` | `amount` | |
| `interest_rate` | `interestRate` | |
| `maturity_date` | `maturityDate` | `null` |
| `use_manual_rate` | `useManualRate` | |
| `manual_rate` | `manualRate` | |
| `updated_at` | `updatedAt` | Timestamp → ISO string |
| *(doc.id)* | `id` | |
| *(注入)* | `liveRate` | `GET` 時注入即時匯率，null on failure |

### DailySnapshot（`daily_snapshots` collection，doc.id = YYYY-MM-DD）

| Firestore | API | 備註 |
|---|---|---|
| `date` | `date` | |
| `exec_capital` | `execCapital` | fallback `0` |
| `reinvest` | `reinvest` | fallback `0` |
| `stock_value` | `stockValue` | fallback `0` |
| `cash_balance` | `cashBalance` | fallback `0` |
| `forex_value` | `forexValue` | fallback `0` |
| `unrealized_profit` | `unrealizedProfit` | fallback `0` |
| `note` | `note` | fallback `''` |
| `holdings` | `holdings` | array，子欄位**已是 camelCase**（見下） |
| `vix` | `vix` | `null` |
| `market_state_auto` | `marketStateAuto` | `null` |
| `recorded_at` | `recordedAt` | Timestamp → Date |

`holdings` 陣列子欄位（Firestore 即 camelCase）：
`stockCode`, `stockName`, `shares`, `costAvg`, `currentPrice`, `currentValue`, `unrealizedProfit`

### PlanConfig（`plan_config/main`，singleton）

| Firestore | API | 預設值 |
|---|---|---|
| `annual_invest` | `annualInvest` | `120000` |
| `r_base` | `rBase` | `0.08` |
| `inflation` | `inflation` | `'base'` |
| `k_risk` | `kRisk` | `1.0` |
| `start_year` | `startYear` | 當年 |
| `overrides` | `overrides` | `{}` |
| `current_year_reinvest` | `currentYearReinvest` | `0` |
| `updated_at` | `updatedAt` | ISO string |

無資料時回傳預設值（不拋錯）。

### Settings（`settings/main`，singleton）

| Firestore | API | 備註 |
|---|---|---|
| `cost_method` | `costMethod` | fallback `'preserve_method'` |
| `updated_at` | `updatedAt` | ISO string |

`GET /settings` 無資料時回傳 `null`（不是預設物件）。

### Preferences（`preferences/default`，singleton）

**欄位在 Firestore 直接以 camelCase 儲存（例外）：**

| Firestore 欄位 | API 欄位 | 預設 |
|---|---|---|
| `chart.showK` | `chart.showK` | `true` |
| `chart.showMA5` | `chart.showMA5` | `true` |
| `chart.showMA20` | `chart.showMA20` | `true` |
| `chart.showMA60` | `chart.showMA60` | `true` |
| `chart.showVolume` | `chart.showVolume` | `true` |
| `chart.zoomLock` | `chart.zoomLock` | `false` |

無資料時回傳預設值。

### RebalanceRule（`rebalance_rules/main`，singleton）

| Firestore | API | 預設 |
|---|---|---|
| `base_threshold` | `baseThreshold` | `0.05` |
| `volatility_factor` | `volatilityFactor` | `1.0` |
| `liquidity_cap_ratio` | `liquidityCapRatio` | `0.20` |
| `adv_lookback_days` | `advLookbackDays` | `20` |
| `concentration_limit` | `concentrationLimit` | `0.70` |

無資料時回傳預設值。PUT：前三欄必填；`advLookbackDays`、`concentrationLimit` 選填（未傳維持現有值）。

### TagCorrelationMatrix（`tag_correlation_matrix/main`，singleton）

| Firestore | API | 備註 |
|---|---|---|
| `last_updated` | `lastUpdated` | Timestamp → ISO string |
| `entries[].tag_a` | `entries[].tagA` | |
| `entries[].tag_b` | `entries[].tagB` | |
| `entries[].rho` | `entries[].rho` | |
| `previous_entries` | `previousEntries` | 同結構或 `null` |

無資料時回傳 `{ lastUpdated: now, entries: [], previousEntries: null }`。

### MarketState（`market_state/main`，singleton）

```json
{ "current": "neutral" | "risk-on" | "risk-off" | "liquidity-dry" }
```

無資料時回傳 `{ "current": "neutral" }`。

### RebalanceSnapshot（`rebalance_snapshots`，doc.id = 自動 UUID）

| Firestore | API | 備註 |
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

### Market Indices（IndexCard[]）

```json
{ "id": str, "name": str, "price": num|null, "change": num|null, "changePercent": num|null }
```

順序固定：`twii → futures → nasdaq → sp500 → dji → sox`

### Forex Rates（ForexRate[]）

```json
{ "code": str, "name": str, "rate": num|null }
```

幣別順序：USD → JPY → EUR → CNY → HKD → GBP → AUD → SGD

### Export Indicator

```json
{ "period": str, "score": num|null, "light": str|null, "lightLabel": str|null }
```

### Stock Quote

```json
{ "stockId": str, "name": str, "price": num, "change": num, "changePercent": num, "high": num, "low": num, "volume": num, "marketStatus": str, "updatedAt": num }
```

### Stock History（StockHistoryPoint[]）

```json
{ "timestamp": num, "open": num, "high": num, "low": num, "close": num, "volume": num }
```

### Stock Profile

```json
{ "stockId": str, "name": str, "market": str, "peRatio": num|null, "dividendYield": num|null, "fiftyTwoWeekHigh": num, "fiftyTwoWeekLow": num, "marketCap": num|null, "discountPremiumRate": null, "revenue": num|null, "grossMargin": num|null, "roe": num|null, "roa": num|null }
```

### Chip（ChipDTO[]）

```json
{ "date": "YYYY-MM-DD", "foreign": num, "trust": num, "dealer": num }
```

---

## 待辦

### Python 後端重建 — 嚴格對齊 Node.js DTO

> 目標：以 Node.js 原始碼為唯一真理，逐模組重建 FastAPI 服務。
> python-backend 目錄已清空（2026-05-22），從零開始重建。

#### M1：環境建置 ✅

- **M1-A** ✅ 建立 `Back-End/python-backend/` 專案骨架：`main.py`（FastAPI app）、`requirements.txt`、`.env.example`、`.gitignore`、`pytest.ini`
- **M1-B** ✅ Firebase Admin SDK 初始化（`services/firestore.py` Firestore 單例；支援本機 key 檔與 Azure base64 JSON 兩種模式）
- **M1-C** ✅ 全域 Middleware：CORS（最外層）、EasyAuth 驗證（`X-MS-CLIENT-PRINCIPAL`；`EASY_AUTH_BYPASS=true` 跳過）、統一錯誤格式（`{ success: false, error: "..." }`）
- **M1-D** ✅ `deploy-python-backend.yml` GitHub Actions workflow（已存在）
- **M1-E** ✅ `tests/conftest.py`（AsyncClient fixture）、`tests/helpers.py`（`assert_success` / `assert_error` / `assert_keys` / `assert_no_snake` / `assert_type`）
- **✅ 驗證關卡** `pytest tests/test_m1_health.py` → **7/7 passed**

#### M2：核心 CRUD API ✅

- **M2-A** ✅ `routers/holdings.py`：完整實作 `GET/POST/PUT/DELETE /holdings`、`PUT /holdings/reorder`、`POST /holdings/recalculate`；`GET /holdings/prices`（注意回傳 `changePct` 非 `changePercent`）；`GET /holdings` 附加 `tags` 陣列
- **M2-B** ✅ `routers/holdings.py`（Asset Tags）：`POST/PUT/DELETE /holdings/:stockCode/tags`
- **M2-C** ✅ `routers/watchlist.py`：`GET/POST/PUT/DELETE /watchlist`、`PUT /watchlist/reorder`；GET 注入 `livePrice`、`change`、`changePercent`、`judgment`
- **M2-D** ✅ `routers/transactions.py`：`GET/POST/PUT/DELETE /transactions`（`?stockId=` 篩選；依 date 升冪）
- **M2-E** ✅ `routers/assets.py`：`GET/POST/PUT/DELETE /foreign-assets`；GET 注入 `liveRate`
- **M2-F** ✅ `routers/plans.py`：`GET/PUT /plan`（singleton，無資料回傳預設值）
- **✅ 驗證關卡** `pytest tests/test_m2_*.py` → **38/38 passed**（2026-05-22）

#### M3：Tag 與風險系統 ✅

- **M3-A** ✅ `routers/tags.py`：`GET/POST/PUT/DELETE /tags`；DELETE 前查 asset_tags；POST 唯一性驗證；`marketStatePresets` 整體 null 或物件（子值可 null）
- **M3-B** ✅ `services/tag_risk_service.py`：volRatio 計算（近 20 日 std / 全 90 日 std）；presets 公式（×1.3 / ×1.8 / ×2.5）；`round(v, 2)` clamp 0–3；`POST /tags/recalculate-dynamic-risk`
- **M3-C** ✅ `routers/market_state.py`：`GET/PUT /market-state`；PUT 以 Firestore batch 原子更新所有 tag dynamicRisk
- **M3-D** ✅ `routers/correlation.py`：`GET/PUT /tag-correlation-matrix`；PUT 備份 entries → previousEntries
- **M3-E** ✅ `routers/rebalance.py`：`GET/PUT /rebalance-rules`；`GET/POST /rebalance-snapshots`
- **✅ 驗證關卡** `pytest tests/test_m3_*.py` → **23/23 passed**（2026-05-22）

#### M4：市場資料 ✅

- **M4-A** ✅ `services/yahoo_finance.py`：**yfinance 已完全移除**，全改用 Yahoo v8 Chart API（`_yf_chart`）與 v10 quoteSummary（`_yf_quote_summary`）直接 HTTP 呼叫；NaN 安全轉換（`_f`/`_i` helper）；市場指數（6-worker 並發 + 台指期爬蟲）；匯率（8 幣別並發）；出口燈號（NDC）；歷史 K 線；基本面；籌碼（TWSE T86）
- **M4-B** ✅ Shioaji 整合完成
  - ✅ `services/shioaji_manager.py`：WebSocket tick 訂閱、quote/futures cache（120s TTL）、snapshot fallback、斷線重連
  - ✅ `services/api_switch.py`：CircuitBreaker（CLOSED/OPEN/HALF_OPEN，失敗 3 次→冷卻 60s）；`api_switch_call(primary, fallback)` 盤中走 Shioaji、盤外走 Yahoo
  - ✅ `utils/market_hours.py`：`is_market_open()` 台股盤中判斷（週一–五 09:00–13:30 UTC+8）
  - ✅ Phase C：`routers/market.py / stocks.py / holdings.py / watchlist.py` 全接 `api_switch_call`
  - ✅ Phase E：移除 `BYPASS_LIVE_PRICES` 旗標，正式啟用切換邏輯
- **M4-C** ✅ `routers/market.py`：`GET /market/indices`（TTL=5s）、`GET /market/forex-rates`（TTL=300s）、`GET /market/export-indicator`（TTL=3600s）
- **M4-D** ✅ `routers/stocks.py`：`GET /stocks/search?q=`、`GET /stocks/list/meta`、`GET /stocks/{id}/quote|history|profile|chip`
- **✅ 驗證關卡** `pytest tests/test_m4_*.py` → **22/22 passed**（2026-05-22）

#### M5：快照與設定 ✅

- **M5-A** ✅ `services/snapshot_service.py`：VIX 抓取 + marketStateAuto；`record_snapshot()` 冪等 merge；完成後 fire-and-forget 觸發動態風險重算；holdings normalize（相容舊後端 sharesHeld/stockValue 欄位）
- **M5-B** ✅ `routers/snapshots.py`：`GET /snapshots`（?year= 篩選）、`GET /snapshots/{date}`、`POST /snapshots`（前端送入）、`POST /snapshots/record`（後端自算）、`PUT /snapshots/{date}`（cashBalance/note）
- **M5-C** ✅ `routers/settings.py`：`GET/PUT /settings`；GET 無資料回傳 `null`（不是預設值）
- **M5-D** ✅ `routers/preferences.py`：`GET/PUT /preferences`；Firestore 欄位直接 camelCase；PUT deep merge
- **✅ 驗證關卡** `pytest tests/test_m5_*.py` → **17/17 passed**（2026-05-22）

#### M6：MCP Server ✅

- **M6-A** ✅ `routers/mcp.py`：`GET /mcp/sse`（SSE 長連線，15s ping）、`POST /mcp/message`（JSON-RPC 2.0）；`/api/v1/mcp/` 路由跳過 EasyAuth（改用 MCP_ACCESS_KEY）
- **M6-B** ✅ `services/mcp_service.py`：8 個 Tool（`get_holdings / get_watchlist / get_market_indices / get_stock_quote / get_snapshots / get_tags / get_rebalance_rules / get_foreign_assets`）；回傳格式 `{"content": [{"type": "text", "text": "<JSON>"}]}`
- **M6-C** ✅ API Key 驗證：`?key=<MCP_ACCESS_KEY>`；`MCP_ACCESS_KEY` 未設定時跳過（開發模式）
- ✅ `main.py` 加掛 `mcp.router`；EasyAuth skip 加入 `/api/v1/mcp/` prefix
- **✅ 驗證關卡** `pytest tests/test_m6_mcp.py` → **14/14 passed**（2026-05-22）

#### M7：切換與下線 ✅

- **M7-A** ✅ 前端 `VITE_API_BASE_URL` 更新指向新 Python 服務 URL；Azure Static Web Apps 環境變數同步
- **M7-B** ✅ 全端點驗證：`pytest tests/` → **121/121 passed**（2026-05-22）
- **M7-C** ✅ 確認正常後下線 `finance-backend`（Node.js）與 `finance-shioaji`（Python proxy）
- **M7-D** ✅ `Docs/Azure-Deployment.md` 全面更新

---

## Bug 回報（前端發現 API 異常）

### BUG-01：`GET /api/v1/asset-tags` 路由缺失 ✅ 已修

**症狀**：Risk Panel「標籤配置」顯示「尚未建立任何 Tag」，即使 Firestore 有資料。

**根本原因**：Node.js 有獨立的 `/api/v1/asset-tags` 路由（`GET/POST/PUT/DELETE`），Python backend 完全未實作。
前端 `useTagViewModel` 以 `Promise.all([fetchTags(), fetchAssetTags(), fetchMarketState()])` 初始化，
`fetchAssetTags()` 打 `GET /asset-tags` 拿到 404，整組 Promise.all 失敗，`tags` 永遠維持空陣列。

**修正**：新增 `routers/asset_tags.py`，掛上 `main.py`，補齊 `GET/POST/PUT/DELETE /api/v1/asset-tags`。

---

### BUG-02：`get_quote()` 實作錯誤，導致持股 timeout ✅ 已修

**症狀**：`GET /holdings` 與 `GET /holdings/prices` timeout（前端 15000ms exceeded），持股列表無法載入。

**根本原因（兩層）**：

**第一層 — 選錯工具**：原本使用 `yfinance.fast_info.last_price`，盤外會拋 `KeyError`，fallback 改走 `ticker.history("5d")`，每支股票耗時 5–10 秒。

**第二層 — Bypass 路徑仍呼叫 `get_all_stocks()`**：原 bypass stub 查 Firestore `stock_list/data`（數千筆），每次 GET /holdings 都觸發，額外增加 Firestore 讀取。

**修正**：
- `get_quote()` 非 bypass 路徑改用 Yahoo v8 `_yf_chart(symbol, "1d", "1d")`，`timeout=10`，盤中盤外均有值
- Bypass 路徑移除 `get_all_stocks()` 呼叫，直接回傳 `{..., "name": stock_id}`
- `routers/holdings.py` 匯入 `BYPASS_LIVE_PRICES`，bypass 時完全跳過 `_fetch_quotes_parallel()`
- `routers/watchlist.py` 同上，bypass 時跳過 `get_quote()` 迴圈
- yfinance 套件已完全移除

---

### BUG-03：`get_indices()` ThreadPoolExecutor 阻塞問題 ✅ 已修

**症狀**：`GET /market/indices` 持續 timeout。

**根本原因**：
- `with ThreadPoolExecutor(...) as pool` context manager 的 `__exit__` 呼叫 `shutdown(wait=True)`，`fut.result(timeout=12)` 超時後仍繼續等所有 future
- `_fetch_all_indices_batch()` 呼叫 `yf.download()` 無明確 timeout

**修正**：
- 移除 `_fetch_all_indices_batch()`，改用 `_fetch_index_card(item)` 逐一打 Yahoo v8 Chart API（`timeout=10`）
- `get_indices()` 改為 6-worker `ThreadPoolExecutor`，台指期 + 5 個指數全並發，`pool.shutdown(wait=False)` 不阻塞
- yfinance 套件已完全移除

---

## 已完成

### Phase 5 移除 — AI 每日早報

- **RM-B-01** 刪除整份檔案：`src/services/aiReportService.ts`、`src/routes/ai.ts`、`src/controllers/aiController.ts`、`src/models/AiReport.ts`
- **RM-B-02** `src/index.ts`：移除 `/api/v1/ai` 路由 import 與 `app.use()` 掛載
- **RM-B-03** `Settings` Model 移除 `aiSystemPrompt`、`aiSystemPromptUpdatedAt`、`aiReportEnabled` 三個欄位
- **RM-B-04** 移除套件：`npm uninstall @anthropic-ai/sdk`

---

### Phase 6 — 曝險/流動比模組（Node.js）

- **6-A** `DailySnapshotInput` 擴充 `vix`、`marketStateAuto`；`record()` 寫入；`deserialize()` 讀回（舊文件缺欄位 fallback `null`）
- **6-B** `snapshotsController.ts` 新增 `fetchVix()` 輔助函式；於 `POST /snapshots/record` 並行抓取
- **6-C** 所有 `GET /snapshots` 端點自動含 `vix`、`marketStateAuto`

---

### Phase 4 — 進階優化（Node.js）

- `GET/PUT /rebalance-rules` 擴充 `advLookbackDays`（5–60）、`concentrationLimit`（0.50–0.95）
- `GET /tag-correlation-matrix` 新增 `previousEntries`；每次 PUT 自動備份

### Phase 3 — 再平衡規則 + 快照 API（Node.js）

- `GET /rebalance-rules`、`PUT /rebalance-rules`
- `GET/POST /rebalance-snapshots`

### Phase 2 — Tag 相關性矩陣 + 市場狀態切換（Node.js）

- `GET/PUT /tag-correlation-matrix`
- `TagDTO` 擴充 `marketStatePresets`
- `GET/PUT /market-state`

### Phase 1 — Tag 標籤功能 API（Node.js）

- `GET/POST/PUT/DELETE /tags`
- `POST/PUT/DELETE /holdings/:stockCode/tags`
- `GET /holdings` 回傳附加 `tags`

---

### 其他優化項目（Node.js）

- 市場指數快取 TTL：5 秒
- Tag `triggerDirection` 欄位
- 動態風險四捨五入 `round(v, 2)`
- Tag 動態風險自動計算（`POST /snapshots/record` fire-and-forget）
- Yahoo-only 部署支援
