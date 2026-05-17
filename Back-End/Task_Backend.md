# 個人理財雲端系統 — 後端開發任務清單

> 版本：2.1（2026-05-17）
> 參考文件：Back-End\CLAUDE.md

---

## 待辦

> 暫無待辦

---

## Bug 回報（前端發現 API 異常）

> 暫無 Bug 待辦

---

## 已完成

### Phase 5 — AI 每日早報

- **5-A** 安裝 `@anthropic-ai/sdk`；`.env.example` 新增 `ANTHROPIC_API_KEY`（本機 `.env` + Azure App Service 應用程式設定，**絕不寫入程式碼**）
- **5-B** `Settings` Singleton Model 擴充三個欄位：
  - `aiSystemPrompt`（string，預設 `''`）：傳入時同步更新 `aiSystemPromptUpdatedAt`
  - `aiSystemPromptUpdatedAt`（Timestamp → ISO string，預設 `null`）
  - `aiReportEnabled`（boolean，預設 `false`）：控制每日排程是否實際呼叫 Claude
  - `PUT /settings` 三欄位均為選填，至少需傳其中一個；`costMethod` 同樣改為選填
- **5-C** `src/services/aiReportService.ts`（核心邏輯）：
  - `Promise.all` 並行讀取：最新 `daily_snapshot`、holdings、`rebalance-rules`、最近 3 筆 `rebalance-snapshots`、settings
  - 組合 User Prompt（持股清單 + 快照數值 + 再平衡建議）
  - 呼叫 `claude-sonnet-4-6`（`temperature: 0`，`tool_choice` 強制 JSON 回傳）
  - 存入 `daily_ai_reports/{YYYY-MM-DD}`（冪等 `set`，同日重複呼叫安全）
  - `ANTHROPIC_API_KEY` 未設定時延遲初始化，呼叫時回傳 HTTP 503
- **5-D** `src/routes/ai.ts` + `src/controllers/aiController.ts`（已掛載 `/api/v1/ai`）：
  - `POST /api/v1/ai/daily-report`：`aiReportEnabled = false` 時回傳 HTTP 200 `{ skipped: true }`，不呼叫 Claude
  - `GET  /api/v1/ai/daily-report`：取最新一筆（`reportDate` 降冪 limit 1）
  - `GET  /api/v1/ai/daily-report/:date`：取指定日期，date 格式驗證 `YYYY-MM-DD`
- **5-E** `.github/workflows/daily-ai-report.yml`：cron `0 22 * * 0-4`（台灣週一–週五 06:00 = UTC 週日–週四 22:00）+ `workflow_dispatch`；Backend URL 讀自 GitHub Actions Secret `BACKEND_URL`
- `src/models/AiReport.ts` 新增（`daily_ai_reports` collection：`save` / `findLatest` / `findByDate`）

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
