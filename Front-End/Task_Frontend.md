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

### Phase 5 移除 — AI 每日早報

- **RM-F-01** 刪除：`useAiReportViewModel.ts`、`aiReportModel.ts`、`settingsStore.ts`、`AiReportModal/`；保留 `settingsModel.ts`（備未來其他設定使用）
- **RM-F-02** `types/index.ts`：移除 `AiReportDTO`、`AiReportMarketState`、`AiReportExposureAnalysis`、`AiReportStockStrategy`；`SettingsDTO` 移除 `aiSystemPrompt`、`aiSystemPromptUpdatedAt`、`aiReportEnabled`
- **RM-F-03** `PanelHeader`：移除 AI 按鈕、`::after` 小圓點、`settingsStore.load()`、`AiReportModal`；保留曝險比 Badge
- **RM-F-04** `SettingsModal`：移除「AI 早報」Tab 與 `AiSystemPromptSection`；移除 tablist/tabpanel 結構（恢復單頁）；保留扁平 section rows 與 80vw×80vh 尺寸
- **RM-F-05** `Task_Frontend.md` 已完成區塊移除 Phase 5（5-A ～ 5-E）整段記錄

### Phase 6 — 曝險/流動比模組

- **6-A** `types/index.ts`：`DailySnapshotDTO` 新增 `vix?: number | null`、`marketStateAuto?: MarketState | null`；`stores/snapshotStore.ts` 擴充對應欄位，`load()` 時一併取出並存入 store
- **6-B** `PanelHeader`：流動現金欄位右側加曝險比 Badge；顯示格式 `曝 XX% ●`；輸入框寬度縮至 90px（7 位數可容納）；曝險比 = `planStore.liveStockValue ÷（liveStockValue + cashBalance）× 100%`
- **6-C** 三色警戒色：未超過動態門檻 → `--down`；超過 → `--up`；門檻：`risk-on`=85%、`neutral`=75%、`risk-off`/`liquidity-dry`=55%；`null` fallback 75%
- **6-D** Badge Tooltip（hover，Radix Tooltip）：「曝險比 = 台股市值 ÷ 總資產」＋ 動態門檻來源說明
- **6-E** `RiskPanel` 收折列：`marketStateAuto` 與手動 `marketState` 不一致時顯示 `💡 系統建議：{autoState}（VIX {vix}）`

### Code Review、效能優化 ＆ 規格統一

- **CR-01** `holdingModel.ts` — `RawProfile` 補齊 `revenue / grossMargin / roe / roa` 欄位，移除 `(r as any)` 強制轉型
- **CR-02** `StockOverviewPage.tsx` — `handleWlSubmit` / `handleWlDelete` 補 `useCallback`
- **CR-03** `useTagViewModel.ts` — 初始 `useEffect` 加 `cancelled` flag
- **CR-05** `useTagViewModel.ts` — `updateAssetTag` 補 `saving` 狀態與 `toast.error`
- **CR-06** `api/axios.ts` — interceptor 加 DEV 環境 `console.error`
- **PERF-01** `SparkLine.tsx` — 加 `React.memo` + `useMemo(option)`，防止 ECharts 5 秒輪詢無謂重繪
- **PERF-02** `useHoldingsViewModel.ts` — `refreshPrices` 無變動時回傳同一 state reference
- **PERF-03** `HoldingsTable.tsx` — `handleDragEnd` 改 `useCallback`
- **PERF-04** `StockExpandPanel.tsx` — `ChipChart` 加 `React.memo` + `useMemo(option)`，修正硬碼色值改 CSS token
- **PERF-05** `useWatchlistViewModel.ts` — `addItem` / `updateItem` 改 optimistic update，只補載新 item sparkline
- **PERF-06** `RiskPanel.tsx` — `buildRiskClipboardText` 相關性矩陣改預建 Map 查詢
- **PERF-07** `StockOverviewPage.tsx` — `preDynamicThreshold` 改用 `useMemo`
- **CR-07** 建立 `utils/useLatest.ts`；重構 `StockOverviewPage` / `useHoldingsViewModel` / `useWatchlistViewModel` 使用統一 hook；`Frontend-React.md` Rule 7.1 更新說明例外條件，補 Rule 7.6 完整規範

### Bug 修正

- **Code-Review Bug-A**：`triggered` 改用 `dynamicThreshold`（從 `useRebalanceViewModel` 傳入），解決高波動市場監控層與決策層不一致
- **Code-Review Bug-B**：ADV 流動性過濾靜默失效 — 「計算再平衡」前先批次 fetch 所有持股 klines，確保 `isLiquidityLimited` 正確運作
- **Code-Review Bug-C**：「計算再平衡」按鈕 `disabled` 加入 `marketStateChanging`，防止切換狀態時使用舊 `dynamicRisk`
- **Code-Review Issue-D**：集中度超標判斷移至 `useRiskViewModel`（新增 `isConcentrationBreached`），View 層只讀旗標
- **4-C/4-D klines 懶加載**：改用 sparklines（頁面載入時全量取得）；新增 `calcTagDailyReturnsFromSparklines` 取代 `calcTagDailyReturns`
- **4-D 公式單位不匹配**：DynamicRisk 改為 `baseRisk × stateMultiplier × (std20/std90)`，以 baseRisk 為錨點

### UI/UX 優化

- **UI-7** SettingsModal 重構：扁平 section rows 去除冗餘邊線（10 條 → 4 條）；固定 `80vw × 80vh`；`Modal.tsx` 新增 `className` prop；`global.css` 新增 `.ft-toggle` 可複用切換開關
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
