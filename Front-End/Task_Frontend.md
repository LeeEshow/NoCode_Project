# 個人理財雲端系統 — 開發任務清單

> 版本：1.0（2026-04-22）
> 參考文件：FRONTEND_PLAN.md

## Phase 2：前端 — Layout 與台股總覽頁

### 基礎骨架
- [x] P2-00a：`styles/` — 設計 Token（`tokens.css` / `theme.ts` / `global.css`），CSS 變數統一管理，供所有頁面引用
- [x] P2-00b：`components/DataTable/` — 共用泛型 Table 元件（TypeScript 泛型 props、欄位點擊排序升/降/清除、Header 搜尋展開動畫 + keyword 即時篩選、空狀態、自訂 render slot）
- [x] P2-00c：`components/Modal/` — 基底 Modal 元件（header / body / footer / backdrop，統一關閉邏輯）
- [x] P2-00d：`components/LoadingPanel/` — 載入狀態元件（Skeleton shimmer / Spinner，props 控制顯示）
- [x] P2-00e：`components/Toast/` — 全域通知元件（Zustand store，toast.success/error/info()，3.5s 自動消失）
- [x] P2-00f：`components/ConfirmDialog/` — 二次確認元件（基於 Modal，danger / accent 兩種按鈕樣式）
- [x] P2-00g：`components/StatusBadge/` — 狀態標籤元件（up / down / flat / accent / muted 五種 variant）
- [x] P2-00h：`components/SummaryCard/` — 摘要數值卡片元件（標題 + 主數值 + 副標）
- [x] P2-00i：`components/FormInputs/` — 共用輸入元件（FormField / TextInput / NumberInput / SelectInput / RadioGroup / TextareaInput）
- [x] P2-00j：`components/Charts/` — ECharts 封裝元件（SparkLine / KLineChart（含 MA5/20/60 + 成交量 + DataZoom）/ MultiLineChart，按需引入）
- [x] P2-01：`api/axios.ts` — Axios 實例 + 攔截器（timeout 15s，統一錯誤訊息萃取）
- [x] P2-02：`types/index.ts` — 所有 DTO 與 Domain 型別定義（Market / Stock / Holding / Transaction / Watchlist / ForeignCurrency / Bond / Plan / Snapshot / Settings）
- [x] P2-03：`App.tsx` — React Router 設定（BrowserRouter + Routes + Outlet + ToastContainer）
- [x] P2-04：`views/layout/SideNav.tsx` — 左側固定 NavBar（分組結構、展開/收合、≥1200px 自動展開）
- [x] P2-05：`views/layout/MainLayout.tsx` — Outlet 容器（配合 SideNav 左移量）
- [x] P2-06：`views/pages/` — 頁面骨架（StockOverviewPage / PlanPage / AssetsPage / ReportPage / SettingsPage）

### 台股總覽頁（`/`）— 市場指數區
- [x] P2-07：`models/marketModel.ts` — 市場指數 API 呼叫 + 反序列化
- [x] P2-08：`viewmodels/useMarketViewModel.ts` — 指數狀態管理
- [x] P2-09：指數卡片元件（MarketIndicesRow，含台股大盤 / 台指期盤中夜盤 / 景氣燈號 / 國際指數，漲跌紅/綠）

### 台股總覽頁（`/`）— 庫存 Table 區
- [x] P2-10：`models/holdingModel.ts` — 庫存 / SparkLine / K線 / Profile / 搜尋 API 呼叫
- [x] P2-11：`viewmodels/useHoldingsViewModel.ts` — 庫存狀態管理 + 彙總計算 + 延遲載入 K線/Profile
- [x] P2-12：未實現損益摘要列（總損益金額 / 報酬率 / 當日變化）
- [x] P2-13：持股 Table 元件（欄位定義、漲跌顏色、操作圖示欄）
- [x] P2-14：持股 Table — 90天迷你走勢圖（ECharts SparkLine，按需引入）
- [x] P2-15：持股 Table — inline 展開 K線 + MA5/MA20/MA60 + 成交量
- [x] P2-16：持股 Table — inline 展開 股票基礎數據

### 台股總覽頁（`/`）— 交易 Modal
- [x] P2-17：`models/transactionModel.ts` — 交易紀錄 API 呼叫 + 反序列化
- [x] P2-18：`viewmodels/useTransactionsViewModel.ts` — 交易狀態管理 + 加權平均成本計算
- [x] P2-19：歷史買賣紀錄 Modal（含 inline 逐筆編輯 / 刪除）
- [x] P2-20：新增買賣紀錄 Modal（即時預覽新均價，完成後呼叫 `POST /holdings/recalculate` 寫回）

### 台股總覽頁（`/`）— 關注清單
- [x] P2-21：`models/watchlistModel.ts` — 關注清單 API 呼叫 + 反序列化
- [x] P2-22：`viewmodels/useWatchlistViewModel.ts` — 狀態管理（signal 由後端提供）
- [x] P2-23：關注清單 Table 元件（目標價 / 即時報價 / 判斷，顏色區分）
- [x] P2-24：關注清單新增（股票搜尋 Dropdown）/ 編輯 / 移除 Modal

---

## UI 修正待辦（Bug / UX）

### 市場指數列
- [ ] FIX-01：指數卡片順序固定為「台股大盤 → 台指期 → 景氣燈號 ｜ S&P 500 → 費城半導體 → 其餘國際指數」，不依 API 回傳順序動態排列
- [ ] FIX-02：台指期小卡版面改為與台股大盤相同尺寸（114px），標題格式「台指期 盤中」或「台指期 夜盤」，依台灣時間判斷：09:00–13:30 顯示「盤中」；13:30–17:00 顯示「盤後」；17:00–次日 05:00 顯示「夜盤」
- [ ] FIX-03：景氣燈號後端 API（`/market/export-indicator`）無資料時，小卡顯示「—」佔位，不隱藏卡片

### 庫存持股
- [ ] FIX-04：未實現損益摘要列（HoldingsSummaryRow）樣式對齊 UI Sample — 頂部橫幅樣式（固定於 Panel header 下方），數值字體、顏色、間距依 token 規範（截圖提供後再實作）
- [ ] FIX-05：庫存持股 Panel 補上「新增持股」功能入口（➕ 按鈕）— 可手動新增一筆持股（代號 / 均價 / 股數），呼叫 `POST /holdings` 或以首筆買入交易寫入

### 版面 / 導覽
- [ ] FIX-06：SideNav 補上手動收折 / 展開切換按鈕（對應 UI Sample `.nav-toggle-btn` 設計：收折時置中、展開時靠右；icon 切換 ‹ / ›）

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