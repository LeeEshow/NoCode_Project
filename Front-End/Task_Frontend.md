# 個人理財雲端系統 — 前端開發任務清單

> 參考文件：Front-End\CLAUDE.md

**指派後端開發**：遇到以下情況，請把後端開發需求寫入 D:\Project\NoCode_Project\Back-End\Task_Backend.md 任務清單的最後段
> 1. 前端設計變更，影響後端API資料結構
> 2. 新增功能需後端開發新API
> 3. 前端發現API資訊異常，需要後端排錯時

---

## Bug 修正

- [x] **4-D 設計修正：DynamicRisk 自動計算公式錯誤（單位不匹配）**
  - **問題**：原實作以 `std(tag日報酬) × √252`（年化標準差，約 0.01～0.30）直接作為 DynamicRisk，但 `baseRisk` 為人工相對係數（0.1～3.0），兩者量綱差距約 1200x，導致建議值（0.017 / 0.024 / 0.033）遠小於 baseRisk（0.6），套入風險矩陣後 Risk_total 嚴重低估
  - **修法**：改以 `baseRisk` 為錨點，乘上波動比與市場狀態倍率（見 REQUIREMENTS.md 進階優化 § DynamicRisk 自動計算）
    ```
    recent_vol = std(近 20 日 tag_daily_return)
    base_vol   = std(近 90 日 tag_daily_return)
    vol_ratio  = recent_vol / base_vol

    建議 Risk-On    = baseRisk × 1.3 × vol_ratio
    建議 Risk-Off   = baseRisk × 1.8 × vol_ratio
    建議流動性枯竭  = baseRisk × 2.5 × vol_ratio
    ```
  - **修改位置**：`TagManagerTab.tsx` 的自動計算邏輯；`correlationCalc.ts` 的 `stdDev` 函式可直接複用
  - **注意**：`baseRisk` 須由呼叫端傳入計算函式（Inline 表單編輯時已持有該 Tag 的 baseRisk 值）

- [x] **Code-Review Bug-A：`triggered` 旗標使用錯誤門檻（監控層 vs 決策層不一致）**
  - **問題**：`useRiskViewModel.ts:71` 的 `triggered` 使用靜態 `baseThreshold`；`useRebalanceViewModel.ts:90` 的再平衡決策卻使用 `dynamicThreshold = baseThreshold × volatilityFactor`
  - **症狀**：高波動市場（volatilityFactor > 1）時，收折列顯示「⚠ N 標籤偏差」，但再平衡建議欄顯示「持平」，邏輯矛盾，使用者困惑
  - **修法**：將 `useRebalanceViewModel` 計算出的 `dynamicThreshold` 透過 props 傳入 `useRiskViewModel`（新增第五參數 `dynamicThreshold?: number`，預設 fallback `baseThreshold`），`triggered` 改用此值判斷

- [x] **Code-Review Bug-B：ADV 流動性過濾靜默失效**
  - **問題**：`useRebalanceViewModel.ts:109` 取 `klines[h.stockCode]`，但 klines 懶加載（未展開個股時為空 `{}`），導致 `adv = 0`，`if (adv > 0)` guard 永不進入，`isLiquidityLimited` 永遠 `false`
  - **症狀**：流動性過濾功能完全無效；使用者從不看到 ⚠ 流動性不足警示；建議交易量未被日均量限制
  - **修法**：「計算再平衡」觸發時，先批次 fetch 所有持股的 klines（`ensureExpandData` 迴圈或新增 `fetchAllKlines`），確認全部載入後再執行 `useRebalanceViewModel` 計算
  - **修改位置**：`useRebalanceSnapshotViewModel.ts` 的 `triggerCalculation`；`useHoldingsViewModel.ts` 可能需新增 `fetchAllKlines()` 方法

- [x] **Code-Review Bug-C：市場狀態切換中未鎖定再平衡按鈕**
  - **問題**：`RiskPanel.tsx:641`，「計算再平衡」按鈕的 `disabled={calculating}` 未含 `marketStateChanging`
  - **症狀**：使用者切換市場狀態時若同時點擊「計算再平衡」，計算使用舊的 `dynamicRisk` 值，結果不正確
  - **修法**：`disabled={calculating || marketStateChanging}`

- [x] **Code-Review Issue-D：集中度超標判斷在 View 層（MVVM 違反）**
  - **問題**：`TagManagerTab.tsx:272` 的 `g.combinedWeight > concentrationLimit` 業務邏輯在 View 層執行
  - **修法**：`useRiskViewModel` 回傳的 `OverlappingTagGroup` 新增 `isConcentrationBreached: boolean` 欄位（由 viewmodel 與 `concentrationLimit` 比對後設定），View 層只讀取旗標
  - **修改位置**：`useRiskViewModel.ts`（接收 `concentrationLimit` 參數）、`types/index.ts`（擴充 `OverlappingTagGroup`）、`TagManagerTab.tsx`（移除判斷邏輯）、`StockOverviewPage.tsx`（傳 `concentrationLimit` 給 viewmodel）

- [x] **4-C / 4-D Bug：`klines` 懶加載導致自動計算失效（同一根因，一併修正）**
  - **影響範圍**：
    - `RiskPanel` 的「重新計算 ρ」→ 全部回傳 1.00
    - `TagManagerTab` Inline 編輯表單的「自動計算」DynamicRisk → toast「K線資料不足少於20日」
  - **根因**：兩處皆呼叫 `calcTagDailyReturns(holdings, klines)`，但 `klines` 懶加載（僅在使用者展開個股時 fetch），初始為空 `{}`，導致 `stockReturns` 空 Map → 報酬序列長度 0
  - **修法**：統一改用 `sparklines`（頁面載入時已全量取得，`Record<string, number[]>`）
    1. `correlationCalc.ts` 新增 `calcTagDailyReturnsFromSparklines(holdings, sparklines: Record<string, number[]>)`，將收盤價序列轉日報酬率，其餘邏輯與原函式相同
    2. `TagManagerTab.tsx` Props：`klines: Record<string, KLineDTO[]>` 改為 `sparklines: Record<string, number[]>`；自動計算改呼叫 `calcTagDailyReturnsFromSparklines`；移除未使用的 `KLineDTO` import
    3. `RiskPanel.tsx` Props：`klines` 改為 `sparklines: Record<string, number[]>`；`handleAutoCalcRho` 改呼叫 `calcTagDailyReturnsFromSparklines`；傳給 `TagManagerTab` 的 prop 同步改為 `sparklines`；移除 `KLineDTO` import
    4. `StockOverviewPage.tsx`：對 `RiskPanel` 改傳 `sparklines={holdings.sparklines}`，移除 `klines={holdings.klines}`


---

## 待辦

> 目前無待辦項目。

### UI/UX 優化（已全部完成，詳見「已完成」區塊）

- [x] **UI-4 風險設定 Tab — 各設定項 Tooltip 說明**
  - 使用 `@radix-ui/react-tooltip`（UI-3 導入後啟用），綁定於各設定標題旁的 `ⓘ` icon
  - Tooltip 字體：`font-size: var(--text-sm)`（比一般 UI 文字小一級），`max-width: 220px`，`text-wrap: balance`
  - 各項文案：
    | 設定項 | 文案 |
    |---|---|
    | 市場狀態 | 選擇你判斷目前市場所處的狀態，系統會依此調整各 Tag 的風險係數，影響 Risk 總值計算 |
    | 偏離門檻 | Tag 實際配置偏離目標幾 % 才觸發再平衡建議。設越小越敏感，設越大表示容忍更多偏差 |
    | 流動性上限 | 單次再平衡每檔的交易量，不超過該股平均日成交量的這個比例，避免大單衝擊市場價格 |
    | ADV 計算天數 | 計算平均日成交量時回溯幾天。天數多較平滑，天數少較貼近近期真實成交狀況 |
    | 集中度上限 | 同性質 Tag 合計持股比例的警戒線，超過此值代表資產過度集中在同類標的 |
    | 波動率倍數（唯讀）| 近 20 日波動相對過去 90 日的倍數。大於 1 表示近期比平常動盪，偏離門檻會自動放寬 |
    | 相關性矩陣 | 各 Tag 之間漲跌的連動程度（ρ）。越接近 1 代表同漲同跌、分散效果差；越接近 0 代表彼此獨立 |
  - `ⓘ` icon 加 `aria-label="說明"` + `aria-hidden="false"`；Tooltip 內容以 `role="tooltip"` 綁定

- [x] **UI-5 Risk 收折列 Mini 進度條 + 標題顏色**
  - `Risk：0.56` 旁加 56px 橫條（max=2.0），顏色隨風險高低變化（綠/藍/橘/紅）
  - 「風險/再平衡模組」文字改用 `var(--text)` 全域白色

- [x] **UI-6 TagManagerTab 批次動態風險重算按鈕**
  - 「⟳ 批次自動計算」按鈕呼叫後端 `POST /tags/recalculate-dynamic-risk`（後端實作見 Task_Backend.md）
  - 完成後重新 fetch tags，toast 顯示更新數量

- [x] **UI-3 Radix UI Primitives 導入 + 視覺品質層升級**
  - **決策**：採用 **Radix UI Primitives**（headless，行為 + a11y 由 Radix 處理，樣式完全沿用現有 `tokens.css` / `global.css`）
  - **已完成替換**：
    - `@radix-ui/react-dialog` → `Modal.tsx`（Overlay + Content + Title；Radix 自動處理 body scroll lock、ESC 關閉、Focus trap）
    - `@radix-ui/react-slider` → `RiskPanel.tsx` 三個 slider（基礎偏離門檻 / 流動性上限 / 集中度上限）
    - `@radix-ui/react-select` → `RiskPanel.tsx` 收折列快照下拉
    - `@radix-ui/react-tooltip` → 已於 UI-4 完成
  - **視覺品質層**：
    - `Modal.css`：backdrop `blur(4px)` 毛玻璃 + `[data-state]` 驅動 overlay fade / modal scale+translateY 動畫
    - `global.css`：`.btn-ghost` 加 hover 微填充、`:active scale(0.97)`、disabled 透明度；`.btn-ghost--accent` 正式定義（accent glow）；`.btn-icon:active scale(0.95)`；新增 `.rd-slider` / `.rd-select-trigger/content/item` CSS 類別
    - `FormInputs.css`：`.fi-input:focus` 加 `box-shadow: 0 0 0 2px var(--accent-bd)` focus glow
  - **不替換**：`.btn-icon` / `.btn-ghost` Button、Badge、ECharts、DnD Kit、原生 `<input type="text/number">`

---

## 已完成

### UI/UX 優化

- **UI-3 Radix UI Primitives 導入 + 視覺品質層**：詳見待辦區 ✓ 標記
- **UI-6 TagManagerTab 批次動態風險重算按鈕**：「⟳ 批次自動計算」呼叫 `POST /tags/recalculate-dynamic-risk`，完成後 re-fetch tags，toast 顯示更新數量
- **UI-5 Risk 收折列 Mini 進度條 + 標題顏色**：56px 橫條（max=2.0），顏色依風險高低四段；「風險/再平衡模組」改 `var(--text)` 白色
- **UI-4 風險設定 Tab Tooltip**：7 個設定項旁 `ⓘ` 圖示，`@radix-ui/react-tooltip`，`text-sm`，220px max-width
- **UI-2 RiskPanel 收折列重組**：收折列加入市場狀態 Badge、偏差標籤數（N 標籤偏差）、快照下拉（`MM/DD HH:mm`）；快照選單從 `HoldingsTable` 標題欄移至 `RiskPanel` 右側，`HoldingsTable` 欄標題改為靜態「再平衡建議」
- **UI-1 RiskPanel 展開 Tab 重構**：展開區改雙 Tab（標籤配置 / 風險設定）；TagManagerTab 移除「計算再平衡」按鈕，進度條改 `var(--accent)` 單色；相關性矩陣移至風險設定 Tab 並常態展示；`計算再平衡` 按鈕 + 相關性警示移至 Tab 2

### Bug 修正

- **4-C/4-D klines 懶加載**：改用 sparklines（頁面載入時全量取得）；新增 `calcTagDailyReturnsFromSparklines` 取代 `calcTagDailyReturns`
- **4-D 公式單位不匹配**：改為 `baseRisk × stateMultiplier × (std20/std90)`，以 baseRisk 為錨點

### 全專案圖表配色設定（前置作業）

- **0-A CSS Token**：`tokens.css` 新增 `--chart-1` ～ `--chart-6` 莫蘭迪色 CSS 變數
- **0-B JS Theme**：`theme.ts` 新增 `chartColors` 陣列（6 色）；`MultiLineChart` 加 `color: chartColors` 全域調色板；舊 chartColors 物件更名為 `chartUiColors`

### Phase 3 ＋ 4 — 再平衡決策層 + 進階優化

- **3-A** RiskPanel 展開動畫（grid `0fr/1fr` + CSS transition）
- **3-B** `useRebalanceViewModel`（純 useMemo：ADV、流動性上限、再平衡建議 buy/sell/hold）
- **3-C** `useRebalanceSnapshotViewModel`（快照 CRUD + triggerCalculation + `ready` flag）
- **3-D** HoldingsTable 再平衡建議欄（buy/sell/hold + 流動性不足 ⚠）
- **3-E** `useRebalanceRulesViewModel`（debounce PUT），RiskPanel 流動性上限 slider + 計算再平衡
- **3-F** VolatilityFactor 自動計算（std20/std90 以 sparklines 計算），動態門檻唯讀顯示
- **4-A** ADV 改用 `advLookbackDays`（預設 20 日均量），RiskPanel 新增天數輸入框
- **4-B** `OverlappingTagGroup.combinedWeight` 定量警示，集中度上限 slider + TagManagerTab 超標提示
- **4-C** `correlationCalc.ts`（Pearson ρ），「重新計算 ρ」按鈕 + 預覽 + diff > 0.2 橘色標示 + 確認流程
- **4-D** TagManagerTab「自動計算」DynamicRisk（`baseRisk × stateMultiplier × vol_ratio`）
- **4-E** 每月再平衡提醒（`snapshots` 載入後判斷本月是否已執行）

### Phase 2 後期 — 市場狀態切換 + 相關性矩陣 UI

- **2-G 市場狀態切換 UI**：`MarketState` 型別、`fetchMarketState/setMarketState` Model、`useTagViewModel` 加 `marketState/changeMarketState/marketStateChanging`；`TagManagerTab` 市場狀態 Radio group（切換後重載 `dynamicRisk`）；Inline 表單加可摺疊「市場狀態係數」三欄
- **2-H 相關性矩陣 UI**：`CorrelationEntry/TagCorrelationMatrix` 型別、`fetchCorrelationMatrix/saveCorrelationMatrix` Model、`useTagViewModel` 加 `correlationMatrix/loadCorrelationMatrix/saveCorrelationMatrix`；`TagManagerTab` 底部 N×N 可收折上三角矩陣（onBlur 整筆覆寫）；`useRiskViewModel` 第四參數 `correlationEntries`，改用 `dynamicRisk` + ρ 查找表（未設定預設 1.0）；RiskPanel `onExpand` 觸發 `loadCorrelationMatrix`

### Phase 2 — 風險模型監控層

- **2-A 型別**：`types/index.ts` 新增 `TagStat`、`OverlappingTagGroup`
- **2-B useRiskViewModel**：純 `useMemo` 計算 — totalAsset → 股票權重 → Tag 當前配置 → 風險矩陣（Σ_ij 使用 `tag.dynamicRisk`，ρ=1 初期）→ Risk_total → 偏差觸發 → 同質重疊偵測；回傳 `{ riskTotal, tagStats, overlappingGroups, hasWarning }`
- **2-C StockOverviewPage 接線**：加 `baseThreshold` state（預設 0.05），呼叫 `useRiskViewModel`，傳新 props 至 `RiskPanel` 與 `HoldingsTable`
- **2-D RiskPanel 收折列**：`Risk：{riskTotal.toFixed(2)}`，`hasWarning` 時顯示 ⚠ 警示 icon（`--up` 色）；數值以 `aria-live="polite"` 包覆
- **2-E RiskPanel 展開表格**：`TagManagerTab` 接收 `tagStats[]`，進度條（純 CSS 120px、莫蘭迪色循環）、狀態欄（actual/target%）、說明欄（未設定 / 配置正常 / 偏差 / 建議再平衡）；slider 接線 `baseThreshold`
- **2-F 標籤設定 Tab 重疊警示**：`StockExpandPanel` 加 `overlappingGroups` prop，篩選涉及此股的群組，顯示 `--accent` 色警示方塊

### Phase 1 — Tag 標籤功能

- **1-A Model 層**：`tagModel.ts` 完成 `fetchTags / createTag / updateTag / deleteTag / addHoldingTag / updateHoldingTag / deleteHoldingTag`
- **1-B 型別定義**：`TagDTO`、`HoldingTagDTO`、`FallbackBehavior`、各 Payload 型別；`HoldingDTO` 擴充 `tags[]`
- **1-C useTagViewModel**：`loadTags / addTag / updateTag / removeTag`；刪除失敗時 `toast.error`
- **1-D useHoldingsViewModel**：`addHoldingTag / updateHoldingTag / removeHoldingTag`；`toHoldingDTO` 正確帶入 `tags[]`（修正重整後遺失 bug）
- **1-E RiskPanel**：可收折面板，Tag 表格（進度條 / 狀態 / 說明欄 Phase 2 補）、Inline 新增 / 編輯表單、偏離門檻 slider
- **1-F 標籤設定 Tab**：`StockExpandPanel` 新增第四個 Tab，WeightRatio 管理（onBlur 存檔、合計驗證、自動平均分配）
- **1-G 交易紀錄 Tab**：`StockExpandPanel` 新增交易紀錄 Tab，嵌入 `TransactionHistoryPanel`
- **1-H 移除 RiskSettingsModal**：刪除舊 Modal，清除殘留 import 與 state

### 頁面切換動畫（View Transitions）

- **CSS Recipes**：`global.css` 加入 timing 變數、fade / slide / nav-forward / nav-back / morph keyframes 與動畫 class、reduced-motion fallback
- **SideNav 持久隔離**：`<nav>` 設 `viewTransitionName: 'site-nav'`（CSS `animation: none`），導覽點擊改用 `startTransition(() => navigate(to))`
- **各頁面 ViewTransition**：`StockOverviewPage / AssetsPage / PlanPage / ReportPage` 各自以 `enter="fade-in" exit="fade-out" default="none"` 包裝，所有頁面為橫向導覽，採 fade 效果
- **React 升級**：`react@canary`（19.3.0-canary）+ `react-dom@canary`；`tsconfig.app.json` 加入 `"react/canary"` 型別

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
