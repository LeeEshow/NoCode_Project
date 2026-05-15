# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Layout

```
Back-End/
├── backend/          # Node.js Express API（主後端，port 3001）
├── Shioaji_API/      # Python FastAPI 微服務（永豐金即時報價，port 8000）
└── Task_Backend.md   # 開發任務清單與進度
```

---

## Node.js Backend (`backend/`)

### Common Commands

```bash
npm run dev     # 開發模式（ts-node + 熱重載）
npm run build   # 編譯 TypeScript → dist/
npm start       # 正式模式（需先 build）
npm run lint
npm run format
```

### Architecture

```
Routes (src/routes/)
  → Controllers (src/controllers/)
    → Services (src/services/)     ← 跨 Model 業務邏輯（e.g. 動態風險計算）
    → Models (src/models/)         ← Firestore CRUD + 外部 API 呼叫
      → src/global/               ← 共用工具
```

所有路由前綴 `/api/v1`，回應格式統一（由 `src/global/apiResponse.ts` 產生）：
- 成功：`{ success: true, data: ... }`
- 失敗：`{ success: false, error: "訊息" }`（透過 `AppError` + `middleware/errorHandler.ts`）

Express 主入口為 `src/index.ts`，另有 `GET /health`（非 `/api/v1` 前綴）供 Azure warmup probe 使用。

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
| `cache.ts` | `getOrSet<T>(key, factory, ttl, shouldCache?)` NodeCache wrapper；`shouldCache` 可過濾不值得快取的結果；另匯出 `nodeCache` 實例 |
| `yahooFinance.ts` | `yfChart()` v8 / `yfQuoteSummary()` v10 封裝 |
| `rateHelper.ts` | `getLiveRateMap()` 即時匯率 Map（currency → 台幣） |
| `shioajiClient.ts` | 呼叫 Python 微服務的 axios client（base URL `SHIOAJI_API_URL` 或預設 `http://localhost:8000`） |
| `marketHours.ts` | `isMarketOpen()` 純函式：週一–五 09:00–13:30 台灣時間 |
| `circuitBreaker.ts` | Circuit Breaker 狀態機（CLOSED → OPEN 失敗 3 次，冷卻 60s → HALF_OPEN） |
| `apiSwitch.ts` | `apiSwitch.call(primary, fallback)` + `apiSwitch.status()`：盤中走 Shioaji，其餘走 Yahoo |
| `apiResponse.ts` | `ApiResponse` 工具：統一產生成功/失敗回應物件 |

### Data Source Switching Logic

```
apiSwitch.call(primary, fallback)
  ├─ 盤外              → fallback（Yahoo Finance）
  ├─ 盤中 + CB OPEN    → fallback（冷卻期）
  ├─ 盤中 + CB HALF_OPEN → primary 試跑，成功 CLOSED / 失敗 fallback
  └─ 盤中 + CB CLOSED  → primary（Shioaji 微服務）
```

受 `apiSwitch` 控制的端點：`getIndices`、`getQuote`、`getHistory`。

`GET /holdings/prices` 的即時報價以 `getOrSet('quote:live:{stockId}', ..., 10s)` 做每股短快取，避免 5 秒輪詢直接打外部 API。

### Firestore Collection Design

| 類型 | 集合 | Document ID | 備註 |
|------|------|-------------|------|
| **一般集合** | holdings / transactions / watchlist / foreign_assets / daily_snapshots / yearly_records / tags / asset_tags / rebalance_snapshots | stockId / UUID / 日期 / assetType_year / UUID / UUID | 多筆文件 |
| **Singleton（單一文件）** | settings / preferences / plan_config / tag_correlation_matrix / rebalance_rules / market_state | `main` / `default` / `main` / `main` / `main` / `main` | 固定 ID，預設值內建於 Model |
| **單一 Map 文件** | stock_list | `data` | 整份股票清單存為單一 document |

Model 層欄位用 **snake_case**（Firestore 儲存），回應時轉為 **camelCase**（API 回應）。

### Tag 功能路由結構

`tags` 與 `asset_tags` 是兩個獨立集合：
- `tags`：全局 Tag 定義（name / baseRisk / dynamicRisk / targetWeight / fallbackBehavior / marketStatePresets / triggerDirection）
- `asset_tags`：持股與 Tag 的對應關係（stockCode / tagName / weightRatio）

`triggerDirection`：`'both' | 'upper_only' | 'lower_only'`，預設 `'both'`；舊文件無此欄位時 deserialize fallback `'both'`。

持股 Tag 操作掛在 holdings 路由下（嵌套）：

```
POST   /api/v1/holdings/:stockCode/tags        # createForHolding（tagName、weightRatio 在 body）
PUT    /api/v1/holdings/:stockCode/tags/:id    # 更新 weightRatio
DELETE /api/v1/holdings/:stockCode/tags/:id    # 移除對應
```

`GET /api/v1/holdings` 回傳的每筆持股包含 `tags: HoldingTagDTO[]`（一次性抓全部 asset_tags，建 Map 再組合，不做 N+1 查詢）。

`DELETE /api/v1/tags/:id` 刪除前會檢查 asset_tags 是否仍有對應，若有則回傳 400。

### Market State 切換流程

`PUT /market-state` → 讀全部 tags → 批次更新各 tag 的 `dynamicRisk`：
- `risk-on`：用 `marketStatePresets.riskOn`，無 preset 時 fallback `baseRisk`
- `risk-off`：用 `marketStatePresets.riskOff`，無 preset 時 fallback `baseRisk`
- `liquidity-dry`：用 `marketStatePresets.liquidityDry`，無 preset 時 fallback `baseRisk`
- `neutral`：直接用 `baseRisk`

批次更新走 Firestore `batch.commit()`，再寫入 `market_state/main`。

### Tag Correlation Matrix

`PUT /tag-correlation-matrix`：先讀現有 `entries`，備份為 `previous_entries`，再寫入新 `entries`。  
`GET /tag-correlation-matrix` 回傳 `{ lastUpdated, entries, previousEntries }`（`previousEntries` 首次為 `null`，僅保留前一版）。

### Rebalance Rules

欄位：`baseThreshold`（0–1）、`volatilityFactor`（>0）、`liquidityCapRatio`（0–1）、`advLookbackDays`（整數 5–60，預設 20）、`concentrationLimit`（0.50–0.95，預設 0.70）。  
`PUT /rebalance-rules`：前三欄位必填，`advLookbackDays` / `concentrationLimit` 選填（未傳維持現有值）。  
Firestore 無資料時 `GET` 回傳內建預設值，不拋錯。

### Daily Snapshot vs Rebalance Snapshot

| | `daily_snapshots` | `rebalance_snapshots` |
|---|---|---|
| 集合 | daily_snapshots（date 為 doc ID） | rebalance_snapshots（UUID 為 doc ID） |
| 寫入方式 | 冪等 merge（同日重複安全）；cron 每日 14:00 自動觸發 | append-only，前端每次再平衡計算後手動存入 |
| 內容 | 全資產淨值快照（股票/外幣/現金/浮盈） | 再平衡建議（買賣方向、數量、參數） |
| 端點 | `POST /snapshots/record`（後端計算）、`POST /snapshots`（前端送入） | `POST /rebalance-snapshots` |

`POST /snapshots/record` 並行策略：先 `Promise.all` 讀取 holdings/currencies/bonds/歷史快照/匯率/PlanConfig，再 `Promise.allSettled` 取各股報價（單筆失敗不中斷）。快照寫入成功後 **fire-and-forget** 觸發 `recalculateDynamicRisk`（讀 DB `marketState`，失敗只 `console.error`，不影響 HTTP response）。

### Dynamic Risk Calculation（`src/services/tagRiskService.ts`）

`recalculateDynamicRisk(marketState)` 的計算流程：
1. 並行讀取 tags / asset_tags / holdings；只取 `sharesHeld > 0` 的持股
2. 對各 Tag 有效持股，`Promise.allSettled` 取 90 日收盤價（`Stock.getHistory`）
3. 計算加權日報酬序列：`Σ (weightRatio/100 × 持股日報酬)`
4. `vol_ratio = std(近 20 日) / std(近 90 日)`；資料不足或 baseVol=0 時預設 1.0
5. presets clamp 至 0–3：`riskOn = baseRisk×1.3×vol_ratio`、`riskOff ×1.8`、`liquidityDry ×2.5`；**各值四捨五入至小數兩位**（`parseFloat(v.toFixed(2))`）
6. `dynamicRisk`：neutral → `baseRisk×vol_ratio`；其餘取對應 preset；**同樣四捨五入至小數兩位**
7. `Tag.batchUpdateRisk` 一次寫回 `dynamic_risk` + `market_state_presets`；無有效持股的 Tag 跳過（skippedCount）

`POST /tags/recalculate-dynamic-risk` 為手動觸發入口；每日 14:00 cron 呼叫 `POST /snapshots/record` 時自動觸發（fire-and-forget）。

### Key Design Decisions

- `Contracts.Futures` / `Contracts.Stocks` 迭代出的是 **StreamMultiContract 群組**，需先取 `.TXF` / `.TSE` / `.OTC` 再迭代個別合約（直接用 `["TXFC0"]` 在 1.3.x 回傳 None）
- `daily_snapshots` 的 `record()` 是冪等設計（merge），同日多次呼叫安全
- 外部 API 以 `Promise.allSettled` 靜默失敗，不中斷整體回應
- `GET /api/v1/holdings/prices`：輕量即時報價（前端 5 秒輪詢用）；`GET /api/v1/holdings`：完整持股資訊含即時報價與 tags，兩者語意不同
- `bonds/` 與 `foreign-currencies/` 路由已棄用，統一由 `foreign-assets/` 取代
- Singleton Model 的 `find()` 在 Firestore 無資料時回傳內建預設值，不拋錯
- `Holding.currentPrice` / `change` / `changePercent` 不存 Firestore，由 Controller 層注入即時資料後回應

### Environment Variables

```env
FIRESTORE_PROJECT_ID=nocode-finance
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json   # 本機開發（檔案路徑）
GOOGLE_APPLICATION_CREDENTIALS_JSON=<base64 JSON>         # Azure 部署（JSON 字串，二擇一）
PORT=3001
SHIOAJI_API_URL=http://localhost:8000   # 可選，預設值即 8000
```

---

## Python Microservice (`Shioaji_API/`)

### Startup

```bash
cd Back-End/Shioaji_API
pip install -r requirements.txt        # 首次安裝
uvicorn main:app --port 8000           # 啟動（根目錄的 main.py 會加入 sys.path）
```

`.env` 需設定：

```env
SJ_API_KEY=your_api_key
SJ_SECRET_KEY=your_secret_key
```

### Architecture

```
Shioaji_API/
├── main.py                  # 根入口（sys.path 修正 + re-export app）
└── src/shioaji_api/
    ├── main.py              # FastAPI app + lifespan（登入/登出）
    ├── core/
    │   ├── config.py        # pydantic-settings 讀取 .env
    │   └── manager.py       # ShioajiManager singleton
    ├── routers/             # 各端點
    └── schemas/market.py    # Pydantic response models
```

### ShioajiManager（`core/manager.py`）

單例，負責：
- 登入（`asyncio.to_thread` 包裹同步呼叫）
- WebSocket tick 訂閱與記憶體快取（`_quote_cache`、`_futures_cache`）
- 斷線時（event_code 2）**立即清空兩個 cache**，避免回傳前日 stale 資料
- 斷線自動重連（event_code 4 → 重新訂閱）
- `_get_nearest_txf()` / `get_taiex_contract()`：動態找近月 TXF 合約與 TSE001 合約

### Endpoints

| 端點 | 說明 |
|------|------|
| `GET /health` | 連線狀態、快取數量 |
| `GET /quote/{stock_id}` | 個股即時報價（tick 快取 → snapshot fallback） |
| `GET /index/taiex` | 加權指數（tick 快取 → snapshot fallback） |
| `GET /index/futures` | 台指期近月（tick 快取 → snapshot fallback） |
| `GET /stocks` | 全台股清單（TSE + OTC，記憶體快取） |
| `GET /kline/{stock_id}` | K 線（`?interval=1D\|1m&days=N`，1D 為後端聚合日線） |

tick 快取有 **120 秒新鮮度限制**（`_TICK_MAX_AGE_SECONDS = 120`）。超過時略過快取，改走 snapshot。此機制同時存在於 `routers/quote.py` 與 `routers/index.py`。

### Shioaji Contract Access Pattern

```python
# ✅ 正確：先取群組再迭代
for c in api.Contracts.Stocks.TSE: ...
for c in api.Contracts.Futures.TXF: ...

# ❌ 錯誤：直接 key 存取在 1.3.x 回傳 None
api.Contracts.Futures["TXFC0"]   # → None
api.Contracts.Indexs["TSE001"]   # → None
```
