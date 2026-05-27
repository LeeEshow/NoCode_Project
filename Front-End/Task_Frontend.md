# 個人理財雲端系統 — 前端開發任務清單

> 參考文件：Front-End\CLAUDE.md

**指派後端開發**：遇到以下情況，請把後端開發需求寫入 D:\Project\NoCode_Project\Back-End\Task_Backend.md 任務清單的最後段
> 1. 前端設計變更，影響後端API資料結構
> 2. 新增功能需後端開發新API
> 3. 前端發現API資訊異常，需要後端排錯時

---

## 待辦

---

### STRAT-F — 個股交易策略模組 (暫不開發)

> AI 透過 MCP 分析後產出結構化策略並存入 DB；前端以圖示入口 + 子視窗顯示最新一筆策略內容。
> **依賴後端**：STRAT-B-01（REST API）、STRAT-B-02（MCP Tools）需先完成。

---

- **STRAT-F-01** `types/index.ts`：新增 `StockStrategyDTO`

```typescript
export interface StockStrategyDTO {
  stockId:          string;
  date:             string;              // YYYY-MM-DD
  entryPriceMin:    number;
  entryPriceMax:    number;
  stopLossPrice:    number;
  stopLossPct:      number;              // 負值，e.g. -8.5
  takeProfitPrice:  number;
  takeProfitPct:    number;              // 正值，e.g. 15.0
  holdingPeriod:    'short' | 'swing' | 'long';
  aiComment:        string;              // max 150 字
  createdAt:        string;
  updatedAt:        string;
}
```

  新增 `HoldingPeriodLabel` 對應 map（工具函式）：`{ short: '短線', swing: '波段', long: '長期' }`

---

- **STRAT-F-02** `models/strategyModel.ts`：純 API 呼叫（無狀態）

  - `fetchLatestStrategy(stockId: string): Promise<StockStrategyDTO | null>`
    → `GET /api/v1/strategies/{stockId}`；後端 `data: null` 時回傳 `null`
  - 回傳直接使用後端 camelCase，不做額外轉換

---

- **STRAT-F-03** `useStrategyViewModel.ts`：管理單支股票的策略讀取狀態

```typescript
interface UseStrategyViewModelReturn {
  strategy:  StockStrategyDTO | null;
  loading:   boolean;
  error:     string | null;
  load:      (stockId: string) => Promise<void>;
}
```

  - `load()` 呼叫 `fetchLatestStrategy`，結果存入 `strategy`
  - 每次開啟 Modal 時呼叫一次（不常駐輪詢）

---

- **STRAT-F-04** `StockStrategyModal`：策略詳情子視窗

  **觸發方式**：持股列表與關注清單的「再平衡建議」欄位內，新增策略圖示按鈕（`Icon name="insights"`，`size={16}`）；有策略資料時圖示亮（`--accent`），無資料時淡（`--muted`）；點擊開啟 Modal，`aria-label="查看交易策略"`

  **Modal 規格**：
  - 使用現有 `Modal` 元件，`size="sm"`
  - 標題：`{stockId} {stockName} 交易策略`，右上角顯示策略日期（`date`）
  - **載入中**：`LoadingPanel` spinner
  - **無資料**：「尚未產生策略，請透過 Claude chat 執行策略分析」（`--muted` 文字）
  - **有資料**：三個區塊橫向排列（Grid 3 欄）

  | 區塊 | 顯示內容 |
  |------|---------|
  | 進場區間 | `NT$ {entryPriceMin} ～ {entryPriceMax}` |
  | 止損 | `NT$ {stopLossPrice}（{stopLossPct}%）`，色彩 `--up` |
  | 止盈 | `NT$ {takeProfitPrice}（+{takeProfitPct}%）`，色彩 `--down` |

  下方全寬區塊：持有建議 Badge（`holdingPeriod` → `短線/波段/長期`）+ AI 短評文字（`--muted`，`line-height: 1.6`）

  - 底部 `updatedAt` 顯示「最後更新：YYYY/MM/DD HH:mm」（`--dim`，`text-sm`）
  - CSS 定義於 `StockStrategyModal.css`，延用 `.ft-panel`、`--up`、`--down`、`--accent` token

---

## 已完成

### QUOTE-F — Table 報價來源與異常狀態顯示

- **QUOTE-F-01** `types/index.ts`：新增 `QuoteSource`、`QuoteStatus` 型別；`HoldingDTO`、`WatchlistItemDTO`、`HoldingPriceDTO` 新增 `quoteSource?`、`quoteStatus?`、`quoteMessage?`
- **QUOTE-F-02** `holdingModel.ts` / `watchlistModel.ts`：`RawHolding`、`RawWatchlistItem`、`HoldingPriceDTO` 補三個 quote 欄位；`toHoldingDTO()`、`toWatchlistItemDTO()` 直接帶入
- **QUOTE-F-04** `useHoldingsViewModel.ts` / `HoldingsTable.tsx` / `WatchlistTable.tsx`：`refreshPrices()` 新增保留上輪價格邏輯（`currentPrice <= 0 && quoteStatus !== 'ok'` 時不覆蓋）；無效報價時現價、漲跌、損益欄顯示 `—`
- **QUOTE-F-05** `StockOverviewPage.tsx`：`computeQuoteSummary()` 純函式 + `QuoteSummaryBadge` 元件；庫存持股與關注清單 panel header 標題後顯示 `SJ n  TW n  YF n  ER n`（零值隱藏），hover Tooltip 顯示完整來源支數與異常分拆；後端尚未回傳 quote 欄位時 badge 不顯示（向下相容）

### OPS-F — 設定子視窗：API Switch 診斷工具

- **OPS-F-01** `models/systemModel.ts`（新增）：`fetchSystemStatus()`、`testStockQuote()`、`testHoldingPrices()`、`testMarketIndices()` 四個診斷 API，各自記錄 `elapsedMs`、`ok`、`error`、`degraded`（後端降級回應與前端 timeout 分開標示）
- **OPS-F-02** `viewmodels/useSystemDiagnosticsViewModel.ts`（新增）：各測試獨立 `loading` 旗標；`runAllTests()` 以 `Promise.all` 並行執行；`anyTesting` 旗標統一 disabled 按鈕
- **OPS-F-03** `SettingsModal.tsx` / `SettingsModal.css`：Modal 尺寸改 `960 × 720px`（固定值）；扁平 section 重構為三 Tab（股票清單 ｜ 每日快照 ｜ API 診斷）；Tab 改條件渲染（非選中 Tab 不 mount，避免背景打 API）；`SystemStatusDisplay` 加 optional chaining 防禦後端結構不符時 crash
- **OPS-F-04** UX：loading icon 補 `aria-label`；按鈕區 `flex-wrap` 防擠壓；不顯示敏感資訊

### FIN-F — 基本面 DTO 更新與 UI 對齊

- **FIN-F-01** `types/index.ts`：`StockProfileDTO` 移除 `forwardPE`、`roa`、`debtToEquity`、`currentRatio`、`freeCashflow`、`analystRating`、`analystCount`、`targetPrice`；識別欄位 `code` → `stockId`、`pe` → `peRatio`、`pb` → `pbRatio`；所有欄位統一為 `T | null`（移除 `?` optional）；新增 `updatedAt: string | null`
- **FIN-F-02** `holdingModel.ts`：`RawProfile` 移除同批欄位，52W 改 `number | null`，新增 `updatedAt`；`fetchStockProfile` 直接傳遞 null 值（無 `?? undefined` 轉換、無 `(r as any)` 強轉），欄位名稱與 DTO 一一對齊
- **FIN-F-03** `StockExpandPanel.tsx`：格式函式型別改 `number | null`；移除 `fmtRating`；`ProfilePanel` 標題列改 flex row，右側顯示同步日期（`updatedAt` 非 null）或「尚未同步」（muted）；移除廢棄欄位區塊（前瞻P/E、ROA、自由現金流、財務健康、分析師共識）；`ChipProfileSection` 有籌碼時加「最後資料：MM/DD」，無籌碼且 `updatedAt === null` 顯示「資料同步中，請稍候」

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
