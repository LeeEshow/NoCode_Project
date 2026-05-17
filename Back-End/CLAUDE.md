# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Layout

```
Back-End/
├── backend/          # Node.js Express API（主後端，port 3001）
├── Shioaji_API/      # Python FastAPI 微服務（永豐金即時報價，port 8000，選用）
└── Task_Backend.md   # 開發任務清單與進度
```

---

## Node.js Backend (`backend/`)

### Common Commands

```bash
npm run dev          # 開發模式（ts-node-dev 熱重載）
npm run build        # 編譯 TypeScript → dist/
npm start            # 正式模式（需先 build）
npm run lint
npm run format
npx tsc --noEmit     # 型別檢查（不產生輸出）
```

### Architecture

```
Routes (src/routes/)
  → Controllers (src/controllers/)
    → Services (src/services/)     ← 跨 Model 業務邏輯
    → Models (src/models/)         ← Firestore CRUD + 外部 API 呼叫
      → src/global/               ← 共用工具
```

所有路由前綴 `/api/v1`，回應格式統一（`src/global/apiResponse.ts`）：
- 成功：`{ success: true, data: ... }`
- 失敗：`{ success: false, error: "訊息" }`（`AppError` + `middleware/errorHandler.ts`）

Express 主入口：`src/index.ts`；`GET /health` 供 Azure warmup probe 使用（無 `/api/v1` 前綴）。

### Route Map

| 前綴 | 功能 |
|------|------|
| `/api/v1/holdings` | 持股 CRUD、即時報價、排序、重算 |
| `/api/v1/holdings/:stockCode/tags` | 持股 Tag 嵌套操作（POST/PUT/DELETE） |
| `/api/v1/transactions` | 交易紀錄 |
| `/api/v1/market` | 指數、匯率、出口指標 |
| `/api/v1/stocks` | 股票清單、個股報價、K 線 |
| `/api/v1/snapshots` | 每日資產快照（GET/POST/PUT；`/record` 為後端自算端點） |
| `/api/v1/tags` | Tag 全局定義 CRUD；`POST /recalculate-dynamic-risk` 觸發動態風險重算 |
| `/api/v1/tag-correlation-matrix` | 相關性矩陣（GET/PUT） |
| `/api/v1/market-state` | 市場狀態切換（GET/PUT） |
| `/api/v1/rebalance-rules` | 再平衡規則（GET/PUT） |
| `/api/v1/rebalance-snapshots` | 再平衡快照（GET/POST，append-only） |
| `/api/v1/ai` | AI 每日早報（POST/GET `/daily-report`、GET `/daily-report/:date`） |
| `/api/v1/foreign-assets` | 外幣 + 債券資產 |
| `/api/v1/watchlist` | 自選股 |
| `/api/v1/plan` | 計畫設定 |
| `/api/v1/settings` | 應用設定 |
| `/api/v1/preferences` | 使用者偏好 |
| `/api/v1/system` | 系統狀態（含 apiSwitch.status） |
| `/api/v1/foreign-currencies` | **已棄用**，保留向下相容 |
| `/api/v1/bonds` | **已棄用**，保留向下相容 |

### Global Utilities (`src/global/`)

| 檔案 | 用途 |
|------|------|
| `firebase.ts` | Firestore 單例初始化（`db`） |
| `cache.ts` | `getOrSet<T>(key, factory, ttl, shouldCache?)` NodeCache wrapper；另匯出 `nodeCache` 實例 |
| `yahooFinance.ts` | `yfChart()` v8 / `yfQuoteSummary()` v10 封裝 |
| `rateHelper.ts` | `getLiveRateMap()` 即時匯率 Map（currency → 台幣） |
| `shioajiClient.ts` | 呼叫 Python 微服務的 axios client（`SHIOAJI_API_URL` 環境變數） |
| `marketHours.ts` | `isMarketOpen()` 純函式：週一–五 09:00–13:30 台灣時間 |
| `circuitBreaker.ts` | Circuit Breaker（CLOSED → OPEN 失敗 3 次，冷卻 60s → HALF_OPEN） |
| `apiSwitch.ts` | `apiSwitch.call(primary, fallback)` + `apiSwitch.status()` |
| `apiResponse.ts` | `ApiResponse` 工具：統一產生成功/失敗回應物件 |

### Data Source Switching Logic

`SHIOAJI_API_URL` 未設定時，`apiSwitch` 全程使用 Yahoo Finance（Yahoo-only 部署模式）。有設定時依以下邏輯切換：

```
apiSwitch.call(primary, fallback)
  ├─ SHIOAJI_API_URL 未設定 → fallback（Yahoo Finance）
  ├─ 盤外               → fallback
  ├─ 盤中 + CB OPEN     → fallback（冷卻期）
  ├─ 盤中 + CB HALF_OPEN → primary 試跑，成功 CLOSED / 失敗 fallback
  └─ 盤中 + CB CLOSED   → primary（Shioaji 微服務）
```

受 `apiSwitch` 控制的端點：`getIndices`、`getQuote`、`getHistory`。  
`GET /holdings/prices` 以 `getOrSet('quote:live:{stockId}', ..., 10s)` 短快取，避免前端 5 秒輪詢直打外部 API。  
`POST /stocks/list/refresh` 需要 Shioaji，未設定 `SHIOAJI_API_URL` 時回傳 400。

### Firestore Collection Design

| 類型 | 集合 | Document ID |
|------|------|-------------|
| **一般集合** | holdings / transactions / watchlist / foreign_assets / daily_snapshots / tags / asset_tags / rebalance_snapshots / **daily_ai_reports** | stockId / UUID / 日期（YYYY-MM-DD） |
| **Singleton** | settings / preferences / plan_config / tag_correlation_matrix / rebalance_rules / market_state | `main` / `default` / `main` / `main` / `main` / `main` |
| **單一 Map 文件** | stock_list | `data` |

Model 層欄位用 **snake_case**（Firestore），回應時轉為 **camelCase**（API）。  
Singleton Model 的 `find()` 在 Firestore 無資料時回傳內建預設值，不拋錯。

### Settings Model 欄位

`settings/main` 目前欄位（`src/models/Settings.ts`）：

| 欄位 | 型別 | 預設 | 說明 |
|------|------|------|------|
| `costMethod` | `'preserve_method' \| 'return_method'` | `'preserve_method'` | 成本計算方式 |
| `aiSystemPrompt` | string | `''` | AI 早報 System Prompt；更新時同步寫 `aiSystemPromptUpdatedAt` |
| `aiSystemPromptUpdatedAt` | Timestamp \| null | `null` | - |
| `aiReportEnabled` | boolean | `false` | 控制 `POST /ai/daily-report` 是否實際呼叫 Claude |

`PUT /settings`：三個欄位均選填，至少傳一個；`aiReportEnabled` 必須為 boolean。

### AI Daily Report (`src/services/aiReportService.ts`)

`generate()` 執行流程：
1. `Promise.all` 並行讀取：最新 `daily_snapshot`、holdings、`rebalance-rules`、最近 3 筆 `rebalance-snapshots`、settings
2. 以 `settings.aiSystemPrompt` 作為 System Prompt（空白時用內建預設）
3. 組合 User Prompt（持股清單 + 快照數值 + 再平衡建議與參數）
4. 呼叫 `claude-sonnet-4-6`，`temperature: 0`，`tool_choice: { type: 'tool' }` 強制 JSON
5. 解析 `tool_use` block；存入 `daily_ai_reports/{YYYY-MM-DD}`（冪等 `set`，同日重複安全）

日期使用台灣時間（UTC+8）。`Anthropic` client 延遲初始化：未設定 `ANTHROPIC_API_KEY` 時呼叫端點回傳 HTTP 503。

`POST /api/v1/ai/daily-report` 在 `aiReportEnabled = false` 時回傳 HTTP 200 `{ skipped: true }`，不呼叫 Claude（讓 GitHub Actions cron 靜默通過）。

AI Report JSON Schema（`AiReportDoc`）：`reportDate`、`marketState`、`summary`、`exposureAnalysis`、`stockStrategies`、`riskWarnings`（均為 string）、`generatedAt`（ISO 8601）、`createdAt`。

### Tag 功能路由結構

`tags`（全局定義）與 `asset_tags`（持股對應）為兩個獨立集合。

持股 Tag 操作掛在 holdings 路由下：
```
POST   /api/v1/holdings/:stockCode/tags        # tagName、weightRatio 在 body
PUT    /api/v1/holdings/:stockCode/tags/:id    # 更新 weightRatio
DELETE /api/v1/holdings/:stockCode/tags/:id
```

`GET /holdings` 一次抓全部 asset_tags 建 Map 再組合，避免 N+1 查詢。  
`DELETE /tags/:id` 刪除前檢查 asset_tags；有掛載回傳 400。  
`triggerDirection`：`'both' | 'upper_only' | 'lower_only'`，舊文件 deserialize fallback `'both'`。

### Market State 切換

`PUT /market-state` → 批次更新各 tag 的 `dynamicRisk`：
- `risk-on / risk-off / liquidity-dry`：用對應 `marketStatePresets`，無 preset 時 fallback `baseRisk`
- `neutral`：直接用 `baseRisk`

批次走 Firestore `batch.commit()`，寫入後更新 `market_state/main`。

### Tag Correlation Matrix

`PUT`：先備份現有 `entries` 為 `previous_entries`，再寫入新 entries（首次 `previousEntries` 為 null）。

### Rebalance Rules

欄位：`baseThreshold`（0–1）、`volatilityFactor`（>0）、`liquidityCapRatio`（0–1）、`advLookbackDays`（5–60，預設 20）、`concentrationLimit`（0.50–0.95，預設 0.70）。  
`PUT`：前三欄位必填，後兩欄選填（未傳維持現有值）。

### Daily Snapshot vs Rebalance Snapshot

| | `daily_snapshots` | `rebalance_snapshots` |
|---|---|---|
| Document ID | date（YYYY-MM-DD） | UUID |
| 寫入方式 | 冪等 merge，cron 每日 14:00 觸發 | append-only，前端手動存入 |
| 端點 | `POST /snapshots/record`（後端自算）/ `POST /snapshots`（前端送入） | `POST /rebalance-snapshots` |

`POST /snapshots/record` 完成後 fire-and-forget 觸發 `recalculateDynamicRisk`（失敗只 `console.error`）。

### Dynamic Risk Calculation（`src/services/tagRiskService.ts`）

`recalculateDynamicRisk(marketState)` 計算流程：
1. 並行讀取 tags / asset_tags / holdings；只取 `sharesHeld > 0` 的持股
2. `Promise.allSettled` 取各 Tag 有效持股的 90 日收盤價
3. 計算加權日報酬序列：`Σ (weightRatio/100 × 持股日報酬)`
4. `vol_ratio = std(近 20 日) / std(近 90 日)`；資料不足或 baseVol=0 預設 1.0
5. presets clamp 至 0–3（`riskOn = baseRisk×1.3×vol_ratio`、`×1.8`、`×2.5`）；**四捨五入至小數兩位**
6. `dynamicRisk`：neutral → `baseRisk×vol_ratio`；其餘取對應 preset；**同樣四捨五入**
7. `Tag.batchUpdateRisk` 一次寫回；無有效持股的 Tag 跳過（回傳 `skippedCount`）

### Key Design Decisions

- `daily_snapshots.record()` 冪等（merge），同日多次呼叫安全
- 外部 API 以 `Promise.allSettled` 靜默失敗，不中斷整體回應
- `GET /holdings/prices`（輕量即時）vs `GET /holdings`（完整含 tags）語意不同
- `bonds/` 與 `foreign-currencies/` 路由已棄用，統一由 `foreign-assets/` 取代
- `Holding.currentPrice / change / changePercent` 不存 Firestore，Controller 層注入

### Environment Variables

```env
FIRESTORE_PROJECT_ID=nocode-finance
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json   # 本機開發
GOOGLE_APPLICATION_CREDENTIALS_JSON=<base64 JSON>         # Azure 部署（二擇一）
PORT=3001
SHIOAJI_API_URL=http://localhost:8000   # 選填；未設定則全程使用 Yahoo Finance
ANTHROPIC_API_KEY=sk-ant-...           # 選填；未設定時 POST /ai/daily-report 回傳 503
```

---

## Python Microservice (`Shioaji_API/`)

### Startup

```bash
cd Back-End/Shioaji_API
pip install -r requirements.txt
uvicorn main:app --port 8000
```

`.env`：`SJ_API_KEY` / `SJ_SECRET_KEY`

### Architecture

```
Shioaji_API/
├── main.py                  # 根入口（sys.path 修正）
└── src/shioaji_api/
    ├── main.py              # FastAPI app + lifespan（登入/登出）
    ├── core/
    │   ├── config.py        # pydantic-settings
    │   └── manager.py       # ShioajiManager singleton
    ├── routers/
    └── schemas/market.py
```

### ShioajiManager（`core/manager.py`）

- WebSocket tick 訂閱，快取於 `_quote_cache` / `_futures_cache`
- 斷線（event_code 2）→ 立即清空兩個 cache，避免 stale 資料
- 斷線自動重連（event_code 4）
- tick 快取 **120 秒**新鮮度限制（`_TICK_MAX_AGE_SECONDS`），超過改走 snapshot

### Endpoints

| 端點 | 說明 |
|------|------|
| `GET /health` | 連線狀態、快取數量 |
| `GET /quote/{stock_id}` | 個股即時報價 |
| `GET /index/taiex` | 加權指數 |
| `GET /index/futures` | 台指期近月 |
| `GET /stocks` | 全台股清單（TSE + OTC） |
| `GET /kline/{stock_id}` | K 線（`?interval=1D\|1m&days=N`） |

### Shioaji Contract Access Pattern

```python
# ✅ 正確：先取群組再迭代
for c in api.Contracts.Stocks.TSE: ...
for c in api.Contracts.Futures.TXF: ...

# ❌ 錯誤：直接 key 存取在 1.3.x 回傳 None
api.Contracts.Futures["TXFC0"]   # → None
```
