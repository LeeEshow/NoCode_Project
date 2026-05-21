# 個人理財雲端系統 — 後端開發任務清單

> 版本：2.2（2026-05-21）
> 參考文件：Back-End\CLAUDE.md

---

## 待辦

> 暫無待辦

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
