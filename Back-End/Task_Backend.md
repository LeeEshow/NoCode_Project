# 個人理財雲端系統 — 後端開發任務清單

> 版本：1.0（2026-04-22）
> 參考文件：Back-End\CLAUDE.md

---

## 已完成項目

| ID | 說明 |
|----|------|
| P1-01 | Yahoo Finance 工具函式整合（axios 封裝，node-cache TTL 60s） |
| P1-02 | `GET /market/indices` — 台股 / 台指期 / NASDAQ / S&P500 / 道瓊 / SOX |
| P1-03 | `GET /market/export-indicator` — 台灣景氣燈號（NDC，TTL 3600s） |
| P1-04 | `GET /stocks/search?q=` — 股票搜尋 |
| P3B-01～04 | `ForeignAsset` Model + Controller + 路由；舊 foreign-currencies / bonds 標記 @deprecated |
| P4B-01～06 | `DailySnapshot` / `PlanConfig` Model + Controller + 路由 |
| E-01 | 台指期盤中/夜盤 null 值處理（`Promise.allSettled` 靜默處理） |
| E-02 | `holdings` 回應加入 `stockName` 欄位 |
| E-03 | 台指期資料回傳 null → 改爬 Yahoo Finance TW SSR HTML（`WTX&`），實測 `{ price: 39766, change: 544, changePercent: 1.39 }` |
| E-04 | 景氣燈號回傳空值 → NDC 為 AngularJS SPA，改為先 GET 取 CSRF token，再 POST `/n/json/data/eco/indicators` 解析 `SR0005` |

---

## 待辦

### ~~F-01：庫存持股 & 關注清單排序持久化~~ ✅ 完成（2026-04-25）

**背景：** 前端已實作拖拉排序，目前暫存於 localStorage。需後端記錄 `sortIndex` 以跨裝置同步。

#### Holding（庫存持股）

1. `src/models/Holding.ts`
   - 新增欄位 `sortIndex: number`（預設 0）

2. 新增路由 `PUT /api/v1/holdings/reorder`
   - Request body：`{ order: string[] }` — stockCode 陣列，index 即新順序
   - 批次更新各 Holding 的 `sortIndex`

3. `GET /api/v1/holdings` 回傳結果依 `sortIndex` 升冪排序

---

#### WatchlistItem（關注清單）

1. `src/models/WatchlistItem.ts`（或對應 Firestore model）
   - 新增欄位 `sortIndex: number`（預設 0）

2. 新增路由 `PUT /api/v1/watchlist/reorder`
   - Request body：`{ order: string[] }` — id 陣列，index 即新順序
   - 批次更新各 WatchlistItem 的 `sortIndex`

3. `GET /api/v1/watchlist` 回傳結果依 `sortIndex` 升冪排序

---

> 前端 API 呼叫端點已預留，完成後移除 localStorage fallback 即可。
