# 個人理財雲端系統 — 後端開發任務清單

> 版本：2.0（2026-05-13）
> 參考文件：Back-End\CLAUDE.md

---

## 待辦

> 暫無待辦

---

## Bug 回報（前端發現 API 異常）

> 暫無 Bug 待辦

---

## 已完成

### 市場指數快取 TTL 改為 5 秒

- `marketController.ts`：`getOrSet('market:indices', ..., 60)` → TTL 改為 `5`
- 前端每 5 秒輪詢 `GET /market/indices` 現可拿到近即時大盤資料
- 注意：Shioaji 模式才有真正即時資料；Mock 模式改 TTL 不影響資料頻率

### Tag 觸發方向欄位（triggerDirection）

- `TriggerDirection = 'both' | 'upper_only' | 'lower_only'` 型別新增於 `Tag.ts`
- `tags` collection 新增 `trigger_direction` 欄位，預設 `'both'`；舊資料 deserialize fallback `'both'`
- `GET /tags` 每筆 Tag 回傳含 `triggerDirection`
- `POST /tags` / `PUT /tags/:id`：接收 `triggerDirection`（選填），驗證三選一

### 動態風險數值統一四捨五入至小數後兩位

- `tagRiskService.ts`：`riskOn` / `riskOff` / `liquidityDry` / `dynamicRisk` 計算後呼叫 `r2()` (`parseFloat(v.toFixed(2))`) 再存 DB
- `tagsController.ts` `validatePresets()`：接收 `marketStatePresets` 時對每個值套用 `Math.round(v * 100) / 100`
- 影響端點：`POST /tags/recalculate-dynamic-risk`、`POST /tags`、`PUT /tags/:id`、`POST /snapshots/record` 靜默觸發

### Tag 動態風險自動計算 API + 每日排程

- `POST /tags/recalculate-dynamic-risk`：依傳入 `marketState` 計算各 Tag 的 `vol_ratio`（近 20 日/近 90 日波動比）→ 更新 `dynamicRisk` 及三個 `marketStatePresets`；無有效持股的 Tag 跳過（`skippedCount`）
- `POST /snapshots/record` 完成後靜默觸發重算（讀 DB `marketState`，失敗只記 error log）
- 計算邏輯封裝於 `backend/src/services/tagRiskService.ts`；只計算 `sharesHeld > 0` 的持股

---

### Phase 1 — Tag 標籤功能 API

- `GET / POST / PUT / DELETE /tags` — Tag CRUD；刪除時若有持股仍掛載則回傳 400
- `POST /holdings/:stockCode/tags` — 為持股新增 Tag 對應（tagName 須存在、weightRatio 0 < v ≤ 100）
- `PUT  /holdings/:stockCode/tags/:id` — 更新 weightRatio
- `DELETE /holdings/:stockCode/tags/:id` — 移除 Tag 對應
- `GET /holdings` 回傳結構擴充，每筆持股附加 `tags: HoldingTagDTO[]`

### Phase 2 初期驗收（無新 API）

- `GET /holdings` 回傳含 `tags[]` 內嵌欄位 ✓
- `GET /tags` 回傳含 `baseRisk`、`targetWeight`、`fallbackBehavior` ✓

### Phase 2 後期 — Tag 相關性矩陣 API

- `GET /tag-correlation-matrix` — 取得相關性矩陣；Firestore 無資料時回傳 `{ lastUpdated, entries: [] }`
- `PUT /tag-correlation-matrix` — 整筆覆寫；驗證 tagA ≠ tagB、兩者須存在於 /tags、rho 0–1

### Phase 2 後期 — 市場狀態切換 API

- `TagDTO` 擴充 `marketStatePresets: { riskOn, riskOff, liquidityDry } | null`（各值範圍 0–3，選填）
- `POST /tags` 支援傳入 `marketStatePresets`
- `PUT /tags/:id` 支援更新 `marketStatePresets`（null 可清除）
- `GET /market-state` — 取得目前市場狀態；無資料回傳 `{ current: "neutral" }`
- `PUT /market-state` — 切換狀態（neutral / risk-on / risk-off / liquidity-dry），批次更新所有 Tag 的 `dynamicRisk`；preset 未設定時 fallback `baseRisk`

### Phase 3 — 再平衡規則 API（DTO 初稿，待規劃確認）

- `GET /rebalance-rules` — 取得規則；無資料時回傳預設值 `{ baseThreshold: 0.05, volatilityFactor: 1.0, liquidityCapRatio: 0.20 }`
- `PUT /rebalance-rules` — 整筆覆寫，驗證各欄位範圍

### Phase 3 — 再平衡快照 API

- `GET /rebalance-snapshots?limit=N` — 取得最近 N 筆快照（預設 10，上限 100），依 createdAt 降冪
- `POST /rebalance-snapshots` — 儲存新快照（append-only，驗證 params + suggestions 各欄位）

### Phase 4 — 進階優化

- `GET/PUT /rebalance-rules` 擴充 `advLookbackDays`（整數 5–60，預設 20）、`concentrationLimit`（0.50–0.95，預設 0.70）；PUT 兩欄位選填，未傳維持現有值
- `GET /tag-correlation-matrix` 回傳結構新增 `previousEntries: CorrelationEntry[] | null`；每次 PUT 自動將舊 entries 備份為 previousEntries（首次為 null）
