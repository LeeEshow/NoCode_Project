# 個人理財雲端系統 — 開發任務清單

> 版本：1.0（2026-04-22）
> 參考文件：REQUIREMENTS.md / BACKEND_PLAN.md / FRONTEND_PLAN.md

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
- [x] P0-09：前端 — 建立資料夾結構（`api/` / `types/` / `models/` / `viewmodels/` / `views/`）

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

## Phase 2：前端 — Layout 與台股總覽頁

### 基礎骨架
- [x] P2-00a：`styles/` — 設計 Token（`tokens.css` / `theme.ts` / `global.css`），CSS 變數統一管理，供所有頁面引用
- [x] P2-00b：`components/DataTable/` — 共用泛型 Table 元件（TypeScript 泛型 props、欄位點擊排序升/降/清除、Header 搜尋展開動畫 + keyword 即時篩選、空狀態、自訂 render slot）
- [ ] P2-01：`api/axios.ts` — Axios 實例 + 攔截器
- [ ] P2-02：`types/index.ts` — 所有 DTO 與 Domain 型別定義
- [ ] P2-03：`App.tsx` — React Router 設定（BrowserRouter + Outlet）
- [ ] P2-04：`views/layout/SideNav.tsx` — 左側固定 NavBar（分組結構）
- [ ] P2-05：`views/layout/MainLayout.tsx` — Outlet 容器
- [ ] P2-06：`views/pages/` — 頁面骨架（StockOverviewPage / PlanPage / AssetsPage / ReportPage / SettingsPage）

### 台股總覽頁（`/`）— 市場指數區
- [ ] P2-07：`models/marketModel.ts` — 市場指數 API 呼叫 + 反序列化
- [ ] P2-08：`viewmodels/useMarketViewModel.ts` — 指數狀態管理
- [ ] P2-09：指數卡片元件（8張，Bootstrap Card，含漲跌顏色紅/綠）

### 台股總覽頁（`/`）— 庫存 Table 區
- [ ] P2-10：`models/holdingModel.ts` — 庫存 API 呼叫 + 反序列化 + 衍生欄位（未實現損益 / 成長率 / isUp）
- [ ] P2-11：`viewmodels/useHoldingsViewModel.ts` — 庫存狀態管理 + 彙總計算
- [ ] P2-12：未實現損益摘要列（總損益金額 / 報酬率 / 當日變化）
- [ ] P2-13：持股 Table 元件（欄位定義、漲跌顏色、操作圖示欄）
- [ ] P2-14：持股 Table — 90天迷你走勢圖（ECharts SparkLine，按需引入）
- [ ] P2-15：持股 Table — inline 展開 K線 + MA5/MA20/MA60 + 成交量
- [ ] P2-16：持股 Table — inline 展開 股票基礎數據

### 台股總覽頁（`/`）— 交易 Modal
- [ ] P2-17：`models/transactionModel.ts` — 交易紀錄 API 呼叫 + 反序列化
- [ ] P2-18：`viewmodels/useTransactionsViewModel.ts` — 交易狀態管理 + 動態成本計算（依全部交易紀錄運算均價 / 總成本）
- [ ] P2-19：歷史買賣紀錄 Modal（📋，含逐筆編輯 / 刪除）
- [ ] P2-20：新增買賣紀錄 Modal（➕，前端動態計算成本後呼叫 `POST /holdings/recalculate` 寫回）

### 台股總覽頁（`/`）— 關注清單
- [ ] P2-21：`models/watchlistModel.ts` — 關注清單 API 呼叫 + 反序列化
- [ ] P2-22：`viewmodels/useWatchlistViewModel.ts` — 狀態管理 + 判斷欄計算（即時報價 ≤ 目標價 → 買進；否則 → 觀望）
- [ ] P2-23：關注清單 Table 元件（目標價 / 即時報價 / 判斷，顏色區分）
- [ ] P2-24：關注清單新增 / 編輯 / 移除 Modal

---

## Phase 3：前端 — 投報計畫頁（`/plan`）

> 數學模型：MARC Model（見 REQUIREMENTS.md 第三節）

- [ ] P3-01：`models/planModel.ts` — 計畫 API 呼叫 + 反序列化 + `buildMARCRows()` 複利試算
- [ ] P3-02：`viewmodels/usePlanViewModel.ts` — 計畫狀態管理 + MARC 試算結果聚合
- [ ] P3-03：計畫參數設定區（MARC 全參數可編輯表單，底部即時顯示名目/實質報酬率）
- [ ] P3-04：複利試算表（逐年展開，第 10/15/20/30 年高亮）
- [ ] P3-05：20年/30年名目 & 實質總資產摘要卡片
- [ ] P3-06：年度實際結算表（可點擊列行內編輯）
- [ ] P3-07：年度結算新增 Modal

---

## Phase 3A：前端 — 外幣 & 債券頁（`/assets`）

- [ ] P3A-01：`models/foreignCurrencyModel.ts` — 外幣 API 呼叫 + 反序列化 + 台幣換算
- [ ] P3A-02：`models/bondModel.ts` — 債券 API 呼叫 + 反序列化 + 台幣估值
- [ ] P3A-03：`viewmodels/useAssetsViewModel.ts` — 外幣 + 債券狀態管理 + 合計台幣計算
- [ ] P3A-04：外幣列表元件（RadioButton 即時 / 手動匯率切換，行內金額編輯）
- [ ] P3A-05：外幣新增 Modal（幣別下拉 / 金額 / 匯率來源）
- [ ] P3A-06：債券列表元件（票面利率 / 到期日 / 幣別 / 面額 / 台幣估值 / 備註）
- [ ] P3A-07：債券新增 / 編輯 Modal
- [ ] P3A-08：底部外幣 & 債券台幣合計列（含匯率更新時間）

---

## Phase 3B：前端 — 績效報告頁（`/report`）

- [ ] P3B-01：`models/snapshotModel.ts` — 快照 API 呼叫 + 反序列化
- [ ] P3B-02：`viewmodels/useSnapshotViewModel.ts` — 快照狀態管理 + 日期範圍過濾 + MARC 目標線計算
- [ ] P3B-03：摘要卡片列（累計投入 / 股票現值 / 活存 / 整體報酬率）
- [ ] P3B-04：控制列（日期範圍選擇器 / 快速選擇按鈕 / 手動觸發快照 / 修正活存）
- [ ] P3B-05：報酬率走勢圖（ECharts LineChart，實際藍線 + MARC 名目橘虛線 + 實質灰虛線，Hover 十字準線同步顯示三線數值）
- [ ] P3B-06：每日快照明細表（含編輯按鈕，可修正活存 / 備註）

---

## Phase 4：整合測試與優化

- [ ] P4-01：前後端整合測試（API 連線 + Firestore Emulator 驗證）
- [ ] P4-02：node-cache 行為驗證（各 TTL 正確命中）
- [ ] P4-03：RWD 響應式設計調整（Bootstrap 斷點測試）
- [ ] P4-04：效能優化（API 回應時間量測、node-cache 命中率）

---

## Phase 5：GCP 部署

- [ ] P5-01：Cloud Run — Backend 容器化部署（`Dockerfile` + `gcloud run deploy`）
- [ ] P5-02：Firebase Hosting — Frontend 部署（`npm run build` + `firebase deploy`）
- [ ] P5-03：Firestore 正式環境安全規則設定
- [ ] P5-04：環境變數與 Secret Manager 設定
- [ ] P5-05：Identity-Aware Proxy（IAP）設定與授權 Google 帳號
- [ ] P5-06：Domain 設定與 HTTPS
- [ ] P5-07：Cloud Scheduler 設定 — 每日台灣時間 14:00（UTC 06:00）觸發 `POST /api/v1/snapshots/record`

---

## 進度總覽

| Phase | 項目數 | 完成 | 未完成 |
|-------|--------|------|--------|
| Phase 0 | 12 | 11 | 1 |
| Phase 1 | 24 | 24 | 0 |
| Phase 2 | 26 | 2 | 24 |
| Phase 3 | 7 | 0 | 7 |
| Phase 3A | 8 | 0 | 8 |
| Phase 3B | 6 | 0 | 6 |
| Phase 4 | 4 | 0 | 4 |
| Phase 5 | 7 | 0 | 7 |
| **合計** | **94** | **37** | **57** |
