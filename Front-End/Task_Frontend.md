# 個人理財雲端系統 — 前端開發任務清單

> 版本：2.0（2026-04-23）

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
