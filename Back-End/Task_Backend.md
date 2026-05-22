# 個人理財雲端系統 — 後端開發任務清單

> 版本：2.2（2026-05-21）
> 參考文件：Back-End\CLAUDE.md

---

## 待辦

### Python 後端整合 — Node.js + Python → 單一 FastAPI 服務

> 目標：將 `finance-backend`（Node.js）與 `finance-shioaji`（Python）整合為單一 FastAPI 服務，同步納入 MCP Server。
> 新服務與 Node.js 並行部署，全功能驗證後再切換前端 API URL，最後下線兩個舊服務。

#### M1：環境建置 ✅

- **M1-A** ✅ 建立 `Back-End/python-backend/` 專案；`main.py`（FastAPI app）、`requirements.txt`（fastapi、uvicorn、firebase-admin、yfinance、shioaji、mcp、cachetools、httpx、pydantic）、`.env.example`
- **M1-B** ✅ Firebase Admin SDK 初始化（Service Account，與現有 Node.js 共用同一 Firestore）；統一 `services/firestore.py` 連線單例
- **M1-C** ✅ 全域 Middleware：CORS、統一錯誤處理（HTTP Exception → JSON）、Easy Auth token 驗證（讀 `X-MS-CLIENT-PRINCIPAL` header）、structured logging
- **M1-D** ✅ `deploy-python-backend.yml` workflow 建立；環境變數從現有兩個服務合併遷移；`Docs/Azure-Deployment.md` 同步更新。**待手動操作**：Azure Portal 建立 `finance-backend-py` Web App，並將發行設定檔存入 `AZURE_PYTHON_BACKEND_PUBLISH_PROFILE` Secret

#### M2：核心 CRUD API ✅

- **M2-A** ✅ `routers/holdings.py`：`GET/POST/PUT/DELETE /holdings`、`PUT /holdings/reorder`、`POST /holdings/recalculate`；Pydantic 模型對應 `HoldingDTO` / `CreateHoldingPayload`；`GET /holdings` 內嵌 `tags`、`GET /holdings/prices` 輕量輪詢端點
- **M2-B** ✅ `routers/holdings.py`（Asset Tags）：`POST/PUT/DELETE /holdings/:stockCode/tags`；含 tagName 存在性驗證、weightRatio 範圍驗證
- **M2-C** ✅ `routers/watchlist.py`：`GET/POST/PUT/DELETE /watchlist`、`PUT /watchlist/reorder`
- **M2-D** ✅ `routers/transactions.py`：`GET/POST/PUT/DELETE /transactions`（支援 `?stockId=` 篩選）
- **M2-E** ✅ `routers/assets.py`：`GET/POST/PUT/DELETE /foreign-assets`；`GET` 並行抓取 yfinance 即時匯率注入 `liveRate`
- **M2-F** ✅ `routers/plans.py`：`GET/PUT /plan`（singleton）；無資料時回傳預設值；`PUT` 選填欄位，未傳維持現有值

#### M3：Tag 與風險系統 ✅

- **M3-A** ✅ `routers/tags.py`：`GET/POST/PUT/DELETE /tags`；Tag CRUD，DELETE 前檢查 asset_tags；`TagDTO` 含 `marketStatePresets`、`triggerDirection`；POST 含名稱唯一性驗證
- **M3-B** ✅ `services/tag_risk_service.py`：preset 優先，否則 `baseRisk × stateMultiplier`，`round(v,2)` clamp 0–3；`POST /tags/recalculate-dynamic-risk`；所有 tag 皆更新，skippedCount 統計無 asset_tags 掛載的 tag 數
- **M3-C** ✅ `routers/market_state.py`：`GET/PUT /market-state`；PUT 於同一 Firestore batch 原子寫入所有 tag dynamicRisk + market_state document
- **M3-D** ✅ `routers/correlation.py`：`GET/PUT /tag-correlation-matrix`；PUT 驗證 tagA≠tagB、兩者存在、-1.0≤rho≤1.0；備份現有 entries 為 previousEntries
- **M3-E** ✅ `routers/rebalance.py`：`GET/PUT /rebalance-rules`（含 advLookbackDays 5–60、concentrationLimit 0.50–0.95，選填保留現有值）；`GET/POST /rebalance-snapshots`（GET 支援 `?limit=` 1–100）

#### M4：市場資料 ✅

- **M4-A** ✅ `services/yahoo_finance.py`：`yfinance` 封裝；`resolve_symbol()` 從 Firestore 判斷 .TW/.TWO 後綴；個股報價 / K 線 / 基本面（revenue / grossMargin / roe / roa）；市場指數（5 支 + 台指期爬蟲）；匯率（8 幣別對台幣）；出口燈號（NDC curl + CSRF）；`get_vix()` 供 M5 使用
- **M4-B** ✅ `services/shioaji_service.py`：Shioaji 原生整合；WebSocket tick 快取 120 秒；過期改走 snapshot；斷線自動清空快取 + 重新訂閱；`SJ_API_KEY` + `SJ_SECRET_KEY` 雙重判斷啟用；Shioaji 失敗靜默 fallback Yahoo Finance；`POST /stocks/list/refresh` 無 SJ 時回傳 400
- **M4-C** ✅ `routers/market.py`：`GET /market/indices`（indices TTL=5s）、`GET /market/forex-rates`（TTL=300s）、`GET /market/export-indicator`（TTL=3600s）；Shioaji 供 TW 指數、Yahoo Finance 供美股及 fallback
- **M4-D** ✅ `routers/stocks.py`：`GET /stocks/search?q=`（Firestore stock_list，上限 20）；`GET /stocks/list/meta`；`POST /stocks/list/refresh`；`GET /stocks/{id}/quote|history|profile|chip`（chip 爬 TWSE T86 API）；stock_list TTLCache 3600s

#### M5：快照與設定 ✅

- **M5-A** ✅ `services/snapshot_service.py`：VIX 並行抓取 + `marketStateAuto` 計算（vix<20 risk-on / 20-30 neutral / >30 risk-off）；`record_snapshot()` 冪等 merge；完成後 `asyncio.create_task` fire-and-forget 觸發 `recalculate_dynamic_risk`；`get_all_snapshots()` / `get_snapshot_by_date()` 查詢輔助
- **M5-B** ✅ `routers/snapshots.py`：`GET /snapshots`、`GET /snapshots/{date}`、`POST /snapshots`（前端送入）、`POST /snapshots/record`（後端自算：並行抓各持股報價 → 計算 totalValue / totalGain → 呼叫 record_snapshot）；舊快照缺欄位 fallback `null`
- **M5-C** ✅ `routers/settings.py`：`GET/PUT /settings`（`costMethod` 選填，Firestore snake_case 儲存，API camelCase 回傳）
- **M5-D** ✅ `routers/preferences.py`：`GET/PUT /preferences`（language / theme / defaultDays + extra 欄位，`extra="allow"` 支援擴充）

#### M6：MCP Server ✅

- **M6-A** ✅ `routers/mcp.py`：`GET /mcp/sse`（SSE 長連線，15 秒 ping）、`POST /mcp/message`（JSON-RPC 2.0）；支援 initialize / tools/list / tools/call 三種 method
- **M6-B** ✅ `services/mcp_service.py`：8 個 Tool 實作：`get_holdings`、`get_tags_and_risk`、`get_market_state`、`get_latest_snapshot`、`get_rebalance_rules`、`get_stock_price`、`get_correlation_matrix`、`get_rebalance_snapshots`；TOOLS registry dict 統一管理 description / inputSchema / fn
- **M6-C** ✅ API Key 驗證：`?key=<MCP_ACCESS_KEY>` query param；`MCP_ACCESS_KEY` 未設定時跳過驗證（開發模式）；Azure App Service 需新增 `MCP_ACCESS_KEY` 環境變數

#### M7：切換與下線

- **M7-A** 前端 `VITE_API_BASE_URL` 更新指向新 Python 服務 URL；Azure Static Web Apps 環境變數同步更新
- **M7-B** 全端點整合測試（對照現有 Node.js 回傳格式，確認 DTO 一致）
- **M7-C** 確認正常後下線 `finance-backend`（Node.js）與 `finance-shioaji`（Python proxy）兩個 App Service
- **M7-D** `Docs/Azure-Deployment.md` 全面更新（新架構、移除舊服務說明）

---


---

## Bug 回報（前端發現 API 異常）

> 暫無 Bug 待辦

---

## 已完成

### Phase 5 移除 — AI 每日早報

- **RM-B-01** 刪除整份檔案：`src/services/aiReportService.ts`、`src/routes/ai.ts`、`src/controllers/aiController.ts`、`src/models/AiReport.ts`（`.github/workflows/daily-ai-report.yml` 從未建立，略過）
- **RM-B-02** `src/index.ts`：移除 `/api/v1/ai` 路由 import 與 `app.use()` 掛載
- **RM-B-03** `Settings` Model 與 `settingsController.ts`：移除 `aiSystemPrompt`、`aiSystemPromptUpdatedAt`、`aiReportEnabled` 三個欄位及相關 PUT 處理邏輯
- **RM-B-04** 移除套件：`npm uninstall @anthropic-ai/sdk`；`.env.example` 移除 `ANTHROPIC_API_KEY`
- **RM-B-05** `Task_Backend.md` 已完成區塊移除 Phase 5（5-A ～ 5-E）整段記錄

---

### Phase 6 — 曝險/流動比模組

- **6-A** `DailySnapshotInput` / `DailySnapshotDoc` 擴充 `vix: number | null`、`marketStateAuto: 'risk-on' | 'neutral' | 'risk-off' | null`；`record()` 寫入 `vix` / `market_state_auto`；`deserialize()` 讀回（舊文件缺欄位 fallback `null`）
- **6-B** `snapshotsController.ts` 新增 `fetchVix()` 輔助函式（`yfChart('^VIX', interval:1d, range:5d)` 取最近收盤價），於 `POST /snapshots/record` 第一批並行中同步抓取；抓取失敗靜默回傳 `null`，不中斷主流程
- **6-C** 所有 `GET /snapshots` 端點（`getAll` / `getByDate`）透過 `deserialize()` 自動含 `vix`、`marketStateAuto`；舊快照缺欄位回傳 `null`

---

### Phase 4 — 進階優化

- `GET/PUT /rebalance-rules` 擴充 `advLookbackDays`（整數 5–60，預設 20）、`concentrationLimit`（0.50–0.95，預設 0.70）；PUT 兩欄位選填，未傳維持現有值
- `GET /tag-correlation-matrix` 回傳結構新增 `previousEntries: CorrelationEntry[] | null`；每次 PUT 自動將舊 entries 備份為 previousEntries（首次為 null）

### Phase 3 — 再平衡規則 + 快照 API

- `GET /rebalance-rules`：無資料時回傳預設值 `{ baseThreshold: 0.05, volatilityFactor: 1.0, liquidityCapRatio: 0.20 }`
- `PUT /rebalance-rules`：整筆覆寫，驗證各欄位範圍
- `GET /rebalance-snapshots?limit=N`：最近 N 筆（預設 10，上限 100），依 createdAt 降冪
- `POST /rebalance-snapshots`：append-only，驗證 params + suggestions 各欄位

### Phase 2 — Tag 相關性矩陣 + 市場狀態切換

- `GET /tag-correlation-matrix`：無資料時回傳 `{ lastUpdated, entries: [] }`
- `PUT /tag-correlation-matrix`：整筆覆寫；驗證 tagA ≠ tagB、兩者須存在於 /tags、rho 0–1
- `TagDTO` 擴充 `marketStatePresets: { riskOn, riskOff, liquidityDry } | null`（各值範圍 0–3）
- `GET /market-state`：無資料回傳 `{ current: "neutral" }`
- `PUT /market-state`：切換狀態（neutral / risk-on / risk-off / liquidity-dry），批次更新各 Tag `dynamicRisk`；preset 未設定時 fallback `baseRisk`

### Phase 1 — Tag 標籤功能 API

- `GET / POST / PUT / DELETE /tags`：Tag CRUD；刪除前檢查 asset_tags，有持股掛載回傳 400
- `POST /holdings/:stockCode/tags`：新增對應（tagName 須存在、weightRatio 0 < v ≤ 100）
- `PUT  /holdings/:stockCode/tags/:id`：更新 weightRatio
- `DELETE /holdings/:stockCode/tags/:id`：移除對應
- `GET /holdings` 回傳每筆持股附加 `tags: HoldingTagDTO[]`

---

### 其他優化項目

- **市場指數快取 TTL**：`marketController.ts` `getOrSet('market:indices', ...)` TTL 從 60 秒改為 5 秒，配合前端 5 秒輪詢
- **Tag triggerDirection 欄位**：`'both' | 'upper_only' | 'lower_only'`，預設 `'both'`；舊文件 deserialize fallback `'both'`
- **動態風險四捨五入**：`tagRiskService.ts` 各風險值統一 `parseFloat(v.toFixed(2))`；`tagsController.ts` `validatePresets()` 同步套用
- **Tag 動態風險自動計算**：`POST /tags/recalculate-dynamic-risk` 手動觸發；`POST /snapshots/record` 成功後 fire-and-forget 自動觸發
- **Yahoo-only 部署支援**：`SHIOAJI_API_URL` 未設定時 `apiSwitch` 全程使用 Yahoo Finance；`POST /stocks/list/refresh` 加守衛回傳 400
