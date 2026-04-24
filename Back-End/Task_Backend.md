# 個人理財雲端系統 — 開發任務清單

> 版本：1.0（2026-04-22）
> 參考文件：BACKEND_PLAN.md

---

## Phase 0：環境建置

### 後端初始化
- [x] P0-01：建立後端專案（`/backend`）— Express + TypeScript 初始化（`tsconfig.json` / `package.json`）
- [x] P0-02：後端 — 安裝套件（`express` / `cors` / `dotenv` / `firebase-admin` / `node-cache` / `axios` / `typescript` / `ts-node-dev`）
- [x] P0-03：後端 — 建立資料夾結構（`routes/` / `controllers/` / `models/` / `middleware/` / `global/`）
- [x] P0-04：後端 — 建立基礎骨架（`index.ts` / `global/firebase.ts` / `global/cache.ts` / `global/apiResponse.ts` / `middleware/errorHandler.ts`）

### Firebase
- [x] P0-05：Firebase 專案建立 + Firestore 啟用 + Service Account 金鑰下載
- [x] P0-06：Firebase Emulator Suite 安裝與設定

### 前端初始化
- [x] P0-07：建立前端專案（`/frontend`）— Vite + React + TypeScript
- [x] P0-08：前端 — 安裝套件（`react-bootstrap` / `axios` / `zustand` / `react-router-dom` / `echarts` / `echarts-for-react`）
- [x] P0-09：前端 — 建立資料夾結構（`api/` / `types/` / `models/` / `viewmodels/` / `views/layout/` / `views/pages/` / `components/` 各子資料夾）

### 共用設定
- [x] P0-10：前後端 ESLint + Prettier 統一設定
- [x] P0-11：Yahoo Finance API 連線測試
- [ ] P0-12：（可選）Docker Compose 設定

---

## Phase 1：後端核心 API

> 後端只負責資料存取與外部 API 代理，不含任何計算邏輯

### 市場資料（外部 API 代理 + node-cache）
- [x] P1-01：Yahoo Finance 工具函式整合（axios 封裝，node-cache TTL 60s）
- [x] P1-02：`GET /market/indices` — 台股 / 台指期 / NASDAQ / S&P500 / 道瓊 / SOX
- [x] P1-03：`GET /market/export-indicator` — 台灣出口景氣燈號（NDC 爬蟲，TTL 3600s）
- [ ] **BUG P1-04**：`GET /stocks/search?q=` — 股票搜尋回傳空陣列（`data: {}`）
  - 已修：`getOrSet` 加入 `shouldCache` 防止空結果快取，`fetchAllStockList` 加入 console.error
  - 待查：Node 終端無任何 log 輸出（成功或失敗皆無），懷疑 TWSE API 回傳結構與 `item['公司代號']` / `item['公司名稱']` 欄位名稱不符
  - 建議：在 `fetchAllStockList` 中加入 `console.log(JSON.stringify(tseRes.value.data?.[0]))` 印出首筆資料結構後確認欄位名稱
- [x] P1-05：`GET /stocks/:id/quote` — 即時報價（TTL 60s）
- [x] P1-06：`GET /stocks/:id/history?days=90` — 歷史 K 線
- [x] P1-07：`GET /stocks/:id/profile` — 股票基礎數據

### Firestore CRUD
- [x] P1-08：交易紀錄 CRUD — `GET/POST/PUT/DELETE /transactions`
- [x] P1-09：`GET /holdings` — 庫存查詢（Firestore + 即時報價注入）
- [x] P1-10：`POST /holdings/recalculate` — 整批重算寫回（前端計算後送陣列）
- [x] P1-11：投報計畫 CRUD — `GET/PUT /plan`
- [x] P1-12：年度結算 CRUD — `GET/POST/PUT /plan/yearly-records`
- [x] P1-13：使用者設定 CRUD — `GET/PUT /settings`

### 外幣 & 債券
- [x] P1-14：`GET /market/forex-rates` — 主要幣別對台幣匯率（TTL 300s）
- [x] P1-15：`ForeignCurrency` Model — Firestore CRUD + 反序列化
- [x] P1-16：`GET/PUT/DELETE /foreign-currencies` — 外幣持倉 CRUD（upsert）
- [x] P1-17：`Bond` Model — Firestore CRUD + 反序列化
- [x] P1-18：`GET/POST/PUT/DELETE /bonds` — 債券清單 CRUD

### 關注清單
- [x] P1-23：`Watchlist` Model — Firestore CRUD + 反序列化
- [x] P1-24：`GET/POST/PUT/DELETE /watchlist` — 關注清單 CRUD（GET 含即時報價注入）

### 每日快照
- [x] P1-19：`DailySnapshot` Model — Firestore CRUD + 反序列化（含 `forex_value` 欄位）
- [x] P1-20：`POST /snapshots/record` — 自動計算快照（冪等設計，含讀取外幣&債券計算 `forex_value`）
- [x] P1-21：`GET /snapshots` — 依日期範圍查詢
- [x] P1-22：`PUT /snapshots/:date` — 修正活存 / 備註

---