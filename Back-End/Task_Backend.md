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
| F-02 | `GET/PUT /api/v1/preferences` — 使用者偏好設定持久化（Firestore `preferences/default`，含 chart 顯示元素，預設全 true，支援 Partial merge） |
| F-03 | `GET /api/v1/stocks/:stockId/profile` 加入 revenue/grossMargin/roe/roa；新增 `GET /api/v1/stocks/:stockId/chip`（TWSE T86，近 20 交易日三大法人買賣超，單位：張） |
| F-04 | `GET/PUT /api/v1/preferences` — `chart.zoomLock` 欄位支援（DEFAULT_PREFERENCES 補 `false`，fromSnapshot 補 `?? false`） |

---

## 待辦

### Shioaji 整合計畫 — 雙資料源 + 混合備援機制

**日期：** 2026-04-30  
**架構：** Python FastAPI 微服務（Shioaji）+ Node.js 整合層（時間閘 + Circuit Breaker）  
**備援策略：** 盤中以 Shioaji 為主（WebSocket push，~5–20ms），收盤後自動切換 Yahoo Finance；盤中 Shioaji 連續失敗 3 次觸發 Circuit Breaker，冷卻 60 秒後自動探測恢復。

#### Phase 1 — Python Shioaji 微服務

| ID | 說明 | 狀態 |
|----|------|------|
| SJ-01 | FastAPI 專案建立 + Shioaji 登入/連線管理（singleton，斷線自動重連） | ✅ 完成 |
| SJ-02 | `GET /quote/{stock_id}` 個股即時報價（WebSocket subscribe → 記憶體快取最新 tick） | ✅ 完成 |
| SJ-03 | `GET /index/taiex` & `GET /index/futures` 加權指數與台指期訂閱 | ✅ 完成 |
| SJ-04 | `GET /stocks` 全部台股清單（上市＋上櫃） | ✅ 完成 |
| SJ-05 | `GET /kline/{stock_id}` K 線（`kbars()`，參數：interval、days） | ✅ 完成 |
| SJ-06 | `GET /health` 健康檢查端點（供 Node.js circuit breaker 探測使用） | ✅ 完成 |

> 三大法人買賣資料維持現有 TWSE T86 API（盤後才發布，Shioaji 優勢不大）。

#### Phase 2 — Node.js 整合層

切換邏輯統一封裝為 `ApiSwitch` 元件，controller 只需呼叫 `apiSwitch.call(primary, fallback)`，不感知切換細節。

| ID | 說明 | 狀態 |
|----|------|------|
| INT-01 | `src/global/shioajiClient.ts` — axios HTTP client 封裝，base URL 指向 Python 微服務 | ✅ 完成 |
| INT-02 | `src/global/marketHours.ts` — 台股盤中純函式（週一至週五 09:00–13:30 台灣時間） | ✅ 完成 |
| INT-03 | `src/global/circuitBreaker.ts` — Circuit Breaker 狀態機（CLOSED → OPEN → HALF-OPEN，失敗閾值 3 次，冷卻 60s） | ✅ 完成 |
| INT-04 | `src/global/apiSwitch.ts` — 統一切換元件，組合 marketHours + circuitBreaker；介面：`apiSwitch.call(primary, fallback)`、`apiSwitch.status()` | ✅ 完成 |
| INT-05 | `stocksController` / `marketController` 改用 `apiSwitch.call()` 整合 Shioaji/Yahoo fallback（`getQuote`、`getHistory`、`getIndices`） | ✅ 完成 |
| INT-06 | `GET /api/v1/system/datasource` — 資料源狀態查詢端點（回傳 `source`、`circuit`、`marketOpen`） | ✅ 完成 |

---

## Bug 回報（前端發現 API 異常）

> 暫無bug待辦
