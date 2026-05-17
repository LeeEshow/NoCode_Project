# 個人理財雲端系統 — 前端開發任務清單

> 參考文件：Front-End\CLAUDE.md

**指派後端開發**：遇到以下情況，請把後端開發需求寫入 D:\Project\NoCode_Project\Back-End\Task_Backend.md 任務清單的最後段
> 1. 前端設計變更，影響後端API資料結構
> 2. 新增功能需後端開發新API
> 3. 前端發現API資訊異常，需要後端排錯時

---

## 待辦

> 暫無待辦

---

## 已完成

### Phase 5 — AI 每日早報

- **5-A** `types/index.ts` 新增 `AiReportDTO`、`AiReportMarketState`、`AiReportExposureAnalysis`、`AiReportStockStrategy`；`SettingsDTO` 擴充 `aiSystemPrompt` / `aiSystemPromptUpdatedAt` / `aiReportEnabled`；新增 `models/aiReportModel.ts`（`getLatestReport` / `getReportByDate`）與 `models/settingsModel.ts`（`fetchSettings` / `updateSettings`）
- **5-B** `viewmodels/useAiReportViewModel.ts`：`loadLatest` / `loadByDate` / `loading` / `error` / `report` / `hasReport` / `availableDates`
- **5-C** `views/components/AiReportModal/`：Market state badge（`--up`/`--down`/`--accent`）、曝險分析卡、個股策略表、風險警示列表、無資料空狀態；lazy fetch on modal open
- **5-D** `PanelHeader` 右側加 `auto_awesome` btn-icon；`hasReport` 時 `::after` 顯示 `--accent` 小圓點；由 `settingsStore.aiReportEnabled` 控制顯示/隱藏
- **5-E** `SettingsModal`「AI 早報」Tab：`ft-toggle` 啟用開關（`settingsStore` 同步，切換即時反映至 PanelHeader）、`TextareaInput` System Prompt（`onBlur` 500ms debounce PUT）、上次更新時間

### Bug 修正

- **Code-Review Bug-A**：`triggered` 改用 `dynamicThreshold`（從 `useRebalanceViewModel` 傳入），解決高波動市場監控層與決策層不一致
- **Code-Review Bug-B**：ADV 流動性過濾靜默失效 — 「計算再平衡」前先批次 fetch 所有持股 klines，確保 `isLiquidityLimited` 正確運作
- **Code-Review Bug-C**：「計算再平衡」按鈕 `disabled` 加入 `marketStateChanging`，防止切換狀態時使用舊 `dynamicRisk`
- **Code-Review Issue-D**：集中度超標判斷移至 `useRiskViewModel`（新增 `isConcentrationBreached`），View 層只讀旗標
- **4-C/4-D klines 懶加載**：改用 sparklines（頁面載入時全量取得）；新增 `calcTagDailyReturnsFromSparklines` 取代 `calcTagDailyReturns`
- **4-D 公式單位不匹配**：DynamicRisk 改為 `baseRisk × stateMultiplier × (std20/std90)`，以 baseRisk 為錨點

### UI/UX 優化

- **UI-7** SettingsModal 重構：分頁 Tab（資料管理 / AI 早報）取代三層 `ft-panel` 卡片；扁平 section rows 去除冗餘邊線（10 條 → 4 條）；固定 `80vw × 80vh`；`Modal.tsx` 新增 `className` prop；`global.css` 新增 `.ft-toggle` 可複用切換開關；`stores/settingsStore.ts` 管理 `aiReportEnabled` 跨元件同步
- **UI-6** TagManagerTab「⟳ 批次自動計算」呼叫 `POST /tags/recalculate-dynamic-risk`，完成後 re-fetch tags，toast 顯示更新數量
- **UI-5** Risk 收折列 56px Mini 進度條（max=2.0，四段色）；「風險/再平衡模組」改 `var(--text)` 白色
- **UI-4** 風險設定 Tab 7 個設定項旁 `ⓘ` Tooltip（`@radix-ui/react-tooltip`，`text-sm`，220px）
- **UI-3** Radix UI Primitives 導入：`react-dialog` → `Modal.tsx`、`react-slider` → RiskPanel sliders、`react-select` → 快照下拉、`react-tooltip` → Tooltip；Modal 毛玻璃動畫、按鈕互動優化
- **UI-2** RiskPanel 收折列加市場狀態 Badge、偏差標籤數、快照下拉（移自 HoldingsTable）
- **UI-1** RiskPanel 展開改雙 Tab（標籤配置 / 風險設定）；相關性矩陣移至 Tab 2

### Phase 3 ＋ 4 — 再平衡決策層 + 進階優化

- **3-A** RiskPanel 展開動畫（grid `0fr/1fr` + CSS transition）
- **3-B** `useRebalanceViewModel`（ADV、流動性上限、再平衡建議 buy/sell/hold）
- **3-C** `useRebalanceSnapshotViewModel`（快照 CRUD + triggerCalculation + `ready` flag）
- **3-D** HoldingsTable 再平衡建議欄（buy/sell/hold + 流動性不足 ⚠）
- **3-E** `useRebalanceRulesViewModel`（debounce PUT），RiskPanel 流動性上限 slider
- **3-F** VolatilityFactor 自動計算（std20/std90 以 sparklines），動態門檻唯讀顯示
- **4-A** ADV 改用 `advLookbackDays`（預設 20 日均量），天數輸入框
- **4-B** `OverlappingTagGroup.combinedWeight` 定量警示，集中度上限 slider
- **4-C** `correlationCalc.ts`（Pearson ρ），「重新計算 ρ」按鈕 + 預覽 + diff > 0.2 橘色標示
- **4-D** TagManagerTab「自動計算」DynamicRisk（`baseRisk × stateMultiplier × vol_ratio`）
- **4-E** 每月再平衡提醒（`snapshots` 載入後判斷本月是否已執行）

### Phase 2 後期 — 市場狀態切換 + 相關性矩陣 UI

- **2-G** 市場狀態切換 UI：`MarketState` 型別、`fetchMarketState/setMarketState`、Radio group、市場狀態係數三欄
- **2-H** 相關性矩陣 UI：N×N 可收折上三角矩陣、`useRiskViewModel` 加 ρ 查找表（未設定預設 1.0）

### Phase 2 — 風險模型監控層

- **2-A** `TagStat`、`OverlappingTagGroup` 型別
- **2-B** `useRiskViewModel`：riskTotal、tagStats 偏差、重疊偵測
- **2-C** `StockOverviewPage` 接線：`baseThreshold`、`useRiskViewModel`
- **2-D** RiskPanel 收折列：`Risk：{riskTotal.toFixed(2)}`，`hasWarning` ⚠ 警示（`aria-live`）
- **2-E** RiskPanel 展開表格：TagManagerTab 進度條、狀態欄、說明欄
- **2-F** StockExpandPanel 重疊警示

### Phase 1 — Tag 標籤功能

- **1-A** `tagModel.ts`：fetchTags / createTag / updateTag / deleteTag / addHoldingTag / updateHoldingTag / deleteHoldingTag
- **1-B** 型別：`TagDTO`、`HoldingTagDTO`、`FallbackBehavior`；`HoldingDTO` 擴充 `tags[]`
- **1-C** `useTagViewModel`：loadTags / addTag / updateTag / removeTag
- **1-D** `useHoldingsViewModel`：addHoldingTag / updateHoldingTag / removeHoldingTag；`toHoldingDTO` 正確帶入 `tags[]`
- **1-E** RiskPanel：可收折面板，Tag 表格，Inline 新增/編輯表單，偏離門檻 slider
- **1-F** 標籤設定 Tab：WeightRatio 管理（onBlur 存檔、合計驗證、自動平均分配）
- **1-G** 交易紀錄 Tab：嵌入 `TransactionHistoryPanel`
- **1-H** 移除 `RiskSettingsModal`

### 全專案圖表配色設定

- **0-A** `tokens.css` 新增 `--chart-1` ～ `--chart-6` 莫蘭迪色
- **0-B** `theme.ts` 新增 `chartColors`；`MultiLineChart` 加全域調色板；舊 `chartColors` 更名 `chartUiColors`

### 頁面切換動畫（View Transitions）

- CSS timing 變數、fade/slide/nav keyframes、reduced-motion fallback
- SideNav 隔離：`viewTransitionName: 'site-nav'`，`startTransition` 導覽
- 各頁面 fade-in / fade-out 包裝；React 升級至 `canary`（19.3.0）

---

## UI 設計要點（全 Phase 適用）

### 色彩規範
- 買入建議（Phase 3）：`--accent #6A8FB5`
- 賣出建議（Phase 3）：`--up #B87A7A`
- WeightRatio 超標：`--up #B87A7A`
- WeightRatio 不足：`--accent #6A8FB5`
- WeightRatio 正常：`--down #7CA88D`

### 計算單位
- 全系統統一使用「**股**」
- 再平衡建議格式：`賣 200 股  約 NT$8,000` / `買 500 股  約 NT$3,000`

### Accessibility 必要項
- 所有 icon-only 按鈕必須有 `aria-label`
- 收折/展開面板：`aria-expanded`、`aria-controls`
- 表單欄位：`<label htmlFor>` 對應
- 驗證訊息：`aria-live="polite"` 包覆
- Tab 元件：`role="tablist"` / `role="tab"` / `role="tabpanel"` / `aria-selected`
- 數值欄：`font-variant-numeric: tabular-nums`
- 動畫：`@media (prefers-reduced-motion: reduce)` fallback
- Native select：明確設定 `background-color` 與 `color`
