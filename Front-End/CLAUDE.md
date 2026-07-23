# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Commands

All commands run from `frontend/`:

```bash
npm run dev        # 開發伺服器（預設 http://localhost:5173，port 被佔用會自動遞增）
npm run build      # tsc -b && vite build
npm run lint       # ESLint
npm run format     # Prettier（src/**/*.{ts,tsx}）
npm run preview    # 預覽 build 產出（需先 build）
npx tsc -p tsconfig.app.json --noEmit   # 型別檢查（與 CI 一致，不產生輸出檔）
```

> **⚠️ 每次程式碼異動後、提交前必跑**：
> ```bash
> npx tsc -p tsconfig.app.json --noEmit
> ```
> CI/CD（`npm run build`）執行的是 `tsc -b && vite build`。`tsc -b` 會追 project references 進入 `tsconfig.app.json`（`"include": ["src"]`）做完整檢查。
>
> **⚠️ 絕對不要用 `npx tsc --noEmit`（不加 `-p`）**：根目錄 `tsconfig.json` 有 `"files": []`，plain `tsc --noEmit` 不追 references，實際上**一個 src 檔案都不會檢查**，永遠 pass，無法攔截任何錯誤。
>
> 常見破壞 CI 的原因：
> - 宣告但未使用的變數 / 函式 / 型別（`noUnusedLocals`）
> - 宣告但未使用的函式參數（`noUnusedParameters`）
> - 引入但未使用的 import（同上規則）

**安裝新套件**：因為 `react@canary` 與部分套件的 peer dep 宣告衝突，須加 `--legacy-peer-deps`：
```bash
npm install <package> --legacy-peer-deps
```

**Vite 快取問題**（出現 504 Outdated Optimize Dep）：
```bash
Remove-Item -Recurse -Force node_modules/.vite
npm run dev
```

後端在 `../Back-End/python-backend/`，前端 API baseURL 預設指向 `http://localhost:8000/api/v1`，可透過 `.env` 的 `VITE_API_BASE_URL` 覆寫。

後端開發需求（API 異動 / 新 API / 資料異常）記錄於 `../Back-End/Task_Backend.md` 最後段。

---

## Architecture

### MVVM 分層

```
src/
├── api/axios.ts              # Axios 單例，統一 baseURL / timeout / 錯誤攔截
├── types/index.ts            # 全域 DTO 與 Payload 型別（唯一真實來源）
├── models/                   # 純 API 呼叫函式（無狀態）
├── viewmodels/               # React hooks，封裝 state + CRUD，供 View 使用
├── stores/                   # Zustand 跨頁全域 store
├── utils/                    # 純函式工具（不含 React，不持有狀態）
└── views/
    ├── layout/               # MainLayout、SideNav（展開/收折）、SettingsModal
    ├── pages/                # 各頁面元件及其子元件、CSS
    └── components/           # 跨頁面共用元件
```

- **Model**：只負責 `fetch/create/update/delete`，直接回傳 DTO，不持有狀態。
- **ViewModel**：`useState` + `useCallback`，暴露 `loading / saving / error` 及 CRUD 方法。每個頁面自行 instantiate，不跨頁共用。
- **View**：不直接呼叫 API，所有副作用透過 ViewModel。

### Model 層注意事項

**所有 Model 必須使用 `api/axios.ts` 的單例**，不可直接 `import axios from 'axios'`（繞過 baseURL / timeout / 錯誤攔截器）。

**報價欄位命名陷阱**：`models/quoteModel.ts` 的 `fetchQuotesByCodes` 回傳 `QuoteDTO`，其中 `changePercent` 是後端欄位名稱。對應到 `HoldingDTO` 時必須手動轉換為 `changePct`，兩者名稱不同：

```ts
changePct: q.changePercent   // ← 必須轉換，直接用 q.changePct 會是 undefined
```

### ViewModel 清單

| Hook | 頁面 / 用途 |
|------|------------|
| `useHoldingsViewModel` | 持股 CRUD、樂觀排序、即時報價輪詢 |
| `useWatchlistViewModel` | 關注清單 CRUD、樂觀排序、分組（`renameGroup` / `deleteGroup` / `reorderWithGroup`）；`groupOrder` 維護展示順序 |
| `useTagViewModel` | Tag CRUD、AssetTag、MarketState、相關性矩陣、批次重算動態風險 |
| `useRebalanceRulesViewModel` | 再平衡規則 CRUD |
| `useRebalanceSnapshotViewModel` | 再平衡快照（建立 / 列表 / 選取） |
| `useTransactionsViewModel` | 交易紀錄 CRUD（含持股展開列） |
| `useStockListViewModel` | 股票搜尋 / 市場指數 |
| `useMarketViewModel` | 法人籌碼、基本面等市場資料 |
| `useAssetsViewModel` | 外幣 / 債券 / 海外股資產 CRUD |
| `usePlanViewModel` | 年度投報計畫 CRUD |
| `useReportViewModel` | 績效快照查詢（含日期範圍、分段） |
| `usePreferencesViewModel` | 使用者偏好雙層持久化（localStorage + 後端） |
| `useEnsurePlanStore` | 初始化 `planStore`（每頁掛載一次） |
| `useDownsideRiskViewModel` | 下行風險：MDD / VaR-CVaR（需手動呼叫 `.fetch()`；`StockOverviewPage` 用） |
| `useScenarioViewModel` | 情境分析：投資組合 Beta / 壓力測試（需手動呼叫 `.fetch()`；`StockOverviewPage` 用） |
| `useSystemDiagnosticsViewModel` | 系統診斷：報價/持倉/指數測試、Shioaji 重新初始化輪詢（`SettingsModal` 用） |
| `useTradingStrategyViewModel` | AI 交易策略載入 / dismiss（樂觀更新）/ remove；`strategies` 以 `Record<stockCode, DTO>` 快取，掛載時 `load()` 一次；API 失敗靜默（非核心功能） |
| `useRiskViewModel` | **純計算**：riskTotal、tagStats 偏差、重疊群組 |
| `useRebalanceViewModel` | **純計算**：volatilityFactor、dynamicThreshold、再平衡建議 |

### 純計算 ViewModel（副作用為零）

這類 hook 不 fetch、不持有 `loading/error`，完全以 `useMemo` 從傳入參數計算，可在元件內多次呼叫無副作用：

| Hook | Signature | 說明 |
|------|-----------|------|
| `useRiskViewModel` | `(holdings, tags, baseThreshold, correlationEntries, dynamicThreshold?, concentrationLimit?) → RiskResult` | 計算 riskTotal、tagStats 偏差、重疊群組 |
| `useRebalanceViewModel` | `(holdings, tagStats, rules, klines, sparklines) → RebalanceResult` | 計算 volatilityFactor、dynamicThreshold、再平衡建議 |

`StockOverviewPage` 的組裝順序：先 `computeVolatilityFactor` → 得 `preDynamicThreshold` → 傳入 `useRiskViewModel` → 再傳入 `useRebalanceViewModel`。

### Axios 錯誤處理

`api/axios.ts` 的 response interceptor 將所有 HTTP 錯誤統一轉換為 `new Error(string)`，catch 區塊中 `err` 一定是 `Error` 實例，直接使用 `(err as Error).message`。

### React 單向資料流原則（A-01）

**禁止儲存 Derived State**。原始資料（`stocks`、`plans`、`cash`）存入 state；可計算的值（`totalValue`、`returnRate`）一律用 `useMemo`。違反此原則會導致 UI 不同步與 race condition。

**`useMemo` 使用邊界**：回傳 primitive（`string`、`number`、`boolean`）且運算式簡單（單一函式呼叫、兩個 primitive 四則運算、簡單條件）時，**不需** `useMemo`——memo 的依賴比較成本比運算本身更高。多次陣列迭代、物件建構、複雜計算才使用。

**`setState` updater 不得有 side effect**：`setState(prev => { localStorage.setItem(...); return next; })` 在 React Strict Mode 下 updater 執行兩次，side effect 重複。localStorage 寫入等應在 event handler 中直接執行：
```ts
function toggle() {
  const next = !current;
  setState(next);
  try { localStorage.setItem(KEY, String(next)); } catch {}
}
```

**`localStorage` 存取必須 try-catch**：`getItem()` / `setItem()` 在 Safari / Firefox incognito 模式或 quota 超出時會拋錯，所有 localStorage 呼叫都需包在 `try-catch` 中。

---

### Zustand Stores（跨頁全域狀態）

| Store | 用途 |
|-------|------|
| `planStore` | 當年度原始輸入：`execCapital / reinvest / forexValue / liveStockValue`。由 `useEnsurePlanStore` 初始化一次；`StockOverviewPage` 在 `holdings.items` 變動後呼叫 `updateStockValue()` 同步。整年報酬率以 `useMemo` 在 `StockOverviewPage` 計算，**不存於 store** |
| `snapshotStore` | 流動資金 `cashBalance`、`vix`、`marketStateAuto`，今日快照優先，無則 fallback 最近一筆。`PanelHeader` 掛載時自動呼叫 `load()`，含 `PanelHeader` 的頁面無需另行觸發 |

### 使用者偏好（`usePreferencesViewModel`）

**雙層持久化**：localStorage 立即讀寫（確保無閃爍）→ 500ms debounce 後同步後端（`PUT /preferences`）。  
`prefs.chart`：K 線圖顯示元素。`prefs.expandTab`：已廢棄，展開列每次開啟重設為 `'kline'`。`prefs.wlCollapsedGroups`：關注清單已折疊群組的 Set，由 `setWlCollapsedGroups` 更新。

### 路由（App.tsx）

| Path | Page |
|------|------|
| `/` | StockOverviewPage（台股總覽）— eager load |
| `/assets` | AssetsPage（外幣資產）— lazy load |
| `/plan` | PlanPage（投報計畫）— lazy load |
| `/report` | ReportPage（績效報告）— lazy load |
| `*` | 重導向至 `/` |

非首頁三個頁面使用 `React.lazy()` + `Suspense` 按需載入，減少初始 bundle。所有頁面包在 `MainLayout`（SideNav + `<Outlet>`）內。設定頁不是路由，是 SideNav 底部齒輪按鈕觸發的 `SettingsModal`。全域通知透過 `<ToastContainer />`（zustand store）。

### 輪詢與 stale closure

在 `setInterval` 內呼叫 ViewModel 方法，使用 `utils/useLatest.ts` 的 `useLatest` hook 持有最新 instance：

```ts
import { useLatest } from '../../utils/useLatest';

const vmRef = useLatest(vm);
useEffect(() => {
  const id = setInterval(() => {
    if (!isTradingHours()) return;   // 盤中判斷必須在 callback 內，不能在外層
    vmRef.current.refreshPrices();
  }, 5000);
  return () => clearInterval(id);
}, []); // 空 deps，不重建 interval
```

`useLatest` 在 render 階段同步更新 ref（`ref.current = value`），讓 callback 永遠能讀到最新值，不需手動維護兩行 `useRef` + 指派。**重要限制**：`ref.current` 只能在 callback（setInterval、事件處理器）內讀取，不能在 render 路徑讀取，否則違反 React 的 render 純函式原則。

同樣的模式也用於 RiskPanel 的穩定 callback（`rulesVmRef`、`tagVmRef`）與 `useHoldingsViewModel` / `useWatchlistViewModel` 的展開資料讀取（`stateRef`），確保空依賴陣列下仍能存取最新 ViewModel。

**盤中輪詢架構**（`StockOverviewPage` 每 5s）：

| 輪詢呼叫 | Endpoint | 原因 |
|----------|----------|------|
| `holdings.refreshPrices()` | `POST /stocks/quotes` | 前端帶 codes，零 Firestore 讀取 |
| `watchlist.silentReload()` | `GET /watchlist` | 必須保留：後端注入 `judgment`（買進/等待）訊號，改用 `/stocks/quotes` 會導致 signal 不再刷新 |
| `market.silentReload()` | `GET /market/indices` | 市場指數更新 |

`useHoldingsViewModel.refreshPrices` 從 `stateRef.current.items` 取 codes，而非另外 fetch Firestore，是 Firestore 讀取量優化的核心。`codes.length === 0` 時提前 return，不發請求。

### Tag 與風險模型

- **HoldingTagDTO** 內嵌於 `HoldingDTO.tags[]`，由 `GET /holdings` 回傳，不需獨立 fetch。`holdingModel.ts` 的 `toHoldingDTO()` 負責映射，確保 `tags: raw.tags ?? []`。
- **全局 Tag（TagDTO）** 由 `useTagViewModel` 管理，包含 CRUD（`/tags`）、AssetTag、MarketState 切換、相關性矩陣、`recalculateDynamicRisk`。
- **Risk 計算**：`useRiskViewModel` 依 `correlationEntries` 建 ρ 查找表，未設定 pair 預設 ρ=1.0。`dynamicRisk` 優先，`targetWeight` 為 null 的 Tag 不計算 delta/triggered。
- **相關性矩陣**：`utils/correlationCalc.ts` 提供 `calcTagDailyReturnsFromSparklines`（sparklines→日報酬序列）與 `buildCorrelationEntries`（計算 Pearson ρ）；`stdDev` 也從此處 export。
- **下行風險**：`utils/downsideRisk.ts` 提供 `computeMaxDrawdown`（MDD/恢復天數）、`computeVarCVar`（95% VaR/CVaR，需至少 60 筆日快照）、`computeDrawdownSeries`（每日回撤序列，供圖表使用）。
- **投報計畫目標**：`utils/planGoal.ts` 的 `computePlanGoal(rows, config) → PlanGoalResult` 計算 B2 當年進度（線性插值，基準為去年底實際資產）與 B3 達成第 30 年目標所需年化報酬。
- **交易時段判斷**：`utils/tradingHours.ts` 的 `isTradingHours()` 回傳目前是否為台股盤中（週一至五 09:00–13:30 台灣時間）；報價輪詢 callback 內必須呼叫此函式，不可在外層判斷（stale closure 問題）。
- **FX 曝險**：`utils/fxExposure.ts` 的 `computeFxExposure(items, liveStockValue, cashBalance) → FxExposureResult` 計算各幣別曝險金額、占總資產比重（%）與 ±1% 匯率衝擊（NT$）；`AssetsPage` 在 `useMemo` 內呼叫。
- **債券存續期間**：`utils/bondDuration.ts` 的 `computeBondSensitivity(items)` 計算加權存續期間（年）與升/降息 1% 估算損益；`AssetsPage` 使用，僅含 `assetType === 'bond'` 的項目。
- **情境分析**：`utils/portfolioBeta.ts` 的 `computePortfolioBeta(snapshots, kbars)` 計算投資組合 β（以加權指數日K為市場基準）；`utils/stressTest.ts` 的 `computeStressScenarios(tagStats, totalAssetValue)` 計算 Tag 集中度壓力情境。兩者由 `useScenarioViewModel` 封裝，`StockOverviewPage` 透過 `onScenarioTabOpen` prop 觸發 fetch。
- **AI 交易策略狀態**：`utils/tradingStrategy.ts` 的 `resolveStrategyStatus(s, currentPrice) → StrategyStatus` 純函式，依 `dismissed`、`expiresAt`、`tradeType` 與現價判斷 `active / triggered / expired / dismissed`；`HoldingsTable`、`WatchlistTable`、`WatchlistCardGrid`、`useTradingStrategyViewModel` 共同引用。

### 頁面切換動畫（ECGLoader + Overlay）

路由切換時由兩層組成，皆以 `useLocation().pathname` 偵測：
- **全屏遮罩**（`MainLayout`，z-index 9998）：立即遮蓋，700ms 後淡出，新頁面在背景靜默 mount + fetch
- **ECGLoader**（`views/components/ECGLoader/`，z-index 9999）：股價折線 SVG 動畫，首次 mount 不觸發（`isFirstRender` ref guard）

**禁止**改用 `useNavigation()`——本專案用 `<BrowserRouter>` 而非 data router。

### React View Transitions（頁內狀態動畫）

**用途**：僅用於頁面內部狀態切換（展開列、視圖切換），**不**用於路由跳頁（交由 ECGLoader + Overlay 處理）。

**觸發條件**：`<ViewTransition>` 只在 `startTransition`、`useDeferredValue`、或 `Suspense` 觸發的更新中啟動，一般 `setState` 不會觸發動畫。

**目前使用位置**：

| 位置 | 動畫 | 觸發方式 |
|------|------|---------|
| `HoldingsTable` 展開列 | `enter="slide-up" default="none"` | `startTransition(() => onToggle(code))` |
| `WatchlistTable` 展開列 | `enter="slide-up" default="none"` | `startTransition(() => onToggle(code))` |
| `StockOverviewPage` 視圖切換（關注清單表格 ↔ 小卡） | `enter="fade-in" default="none"` | `startTransition(() => setWlViewMode(mode))` |

**`default="none"` 必須加**：不加的話，路由跳頁時 startTransition 也會觸發所有 VT 的 cross-fade，與 ECGLoader 視覺打架。`default="none"` 讓每個 VT 只響應明確宣告的觸發（`enter` / `exit`）。

**CSS 變數與 keyframes**（定義於 `styles/global.css` 末段）：

```css
--vt-duration-exit:  150ms;
--vt-duration-enter: 210ms;
--vt-duration-move:  650ms;   /* slide-up 展開動畫持續時間 */
```

**SideNav 隔離**：`views/layout/SideNav.tsx` 的根元素設有 `style={{ viewTransitionName: 'site-nav' }}`，搭配 `global.css` 的 `::view-transition-group(site-nav) { animation: none }` 確保 SideNav 在任何 VT 期間保持靜止。SideNav 的 `navigate()` 呼叫須包在 `startTransition` 內，否則不觸發 VT：
```ts
startTransition(() => navigate(to));
```

**root 壓制**：`global.css` 包含 `::view-transition-old(root), ::view-transition-new(root) { animation: none }` 防止瀏覽器預設的全頁 cross-fade 覆蓋 ECGLoader。

---

## 設計系統

### 雙層 Token 架構

| 位置 | 用途 | 同步對象 |
|------|------|---------|
| `styles/tokens.css` CSS 變數 | UI 顏色（背景、文字、邊框、漲跌、accent）、字型、尺寸 | 對應 `theme.ts` 的 `colors` 物件，異動時兩邊同步 |
| `styles/theme.ts` JS 常數 | 同上 `colors`，plus `chartColors`、`chartUiColors` | `colors` 需與 tokens.css 同步；`chartColors` **只存在於此**，tokens.css 沒有對應變數 |

`App.css` / `index.css` 是 Vite 樣板殘留，請勿修改。

### 圖表配色（`chartColors`）

**唯一來源：`styles/theme.ts` 的 `chartColors` 陣列**，`tokens.css` 沒有 `--chart-*` 變數（已移除，因為 ECharts 走 Canvas 渲染，讀不到 CSS 變數）。

```ts
// 修改圖表配色只改 theme.ts，不需動 tokens.css
export const chartColors = [ /* 6 色暗礦色板 */ ] as const;
```

用途：
- `MultiLineChart` / `ReportChart` → `color: [...chartColors]` 傳入 ECharts 全域調色板
- `useRiskViewModel` → Tag 進度條循環配色（`chartColors[idx % chartColors.length]`）
- `StockExpandPanel` ChipChart → 三大法人固定 index：外資 `[0]`、投信 `[1]`、自營商 `[3]`

### 核心色票（實際值）

深色主題層次：`--bg: #111111` → `--surface: #080808` → `--panel: #1d1d1d`

| Token | 值 | 用途 |
|-------|----|------|
| `--text` | `#cdd6e0` | 主文字 |
| `--text-value` | `#c8d2de` | 數值欄（`.num-value`） |
| `--muted` | `#7a8390` | 次要文字 |
| `--dim` | `#4e5e6e` | 輔助文字（對比 ≈ 6:1） |
| `--label` | `#5e6c7a` | 小標題 |
| `--up` | `#B87A7A` | 漲（偏紅），配套 `-bg`、`-bd` |
| `--down` | `#7CA88D` | 跌（偏綠），配套 `-bg`、`-bd` |
| `--accent` | `#6A8FB5` | 互動色，配套 `-bg`、`-bd` |

**字型**：`tokens.css` 與 `theme.ts` 兩邊皆為 `'Open Sans', sans-serif`（sans 與 mono 相同）。Google Fonts 只載入 Open Sans，禁止在 `theme.ts` 引用未載入的字型（如 IBM Plex）。

### 語義色彩用途

| 用途 | Token |
|------|-------|
| 買入建議 / WeightRatio 不足 | `--accent` (`#6A8FB5`) |
| 賣出建議 / WeightRatio 超標 | `--up` (`#B87A7A`) |
| WeightRatio 正常 | `--down` (`#7CA88D`) |

### CSS 慣例

- 元件內禁止自定義顏色值，只用 CSS 變數。
- 全域共用 class 定義於 `styles/global.css`；元件專屬 CSS 放在同目錄。
- 數值欄加 `className="num-value"`（monospace + `--text-value`）。
- 持股數量單位全系統統一為「**股**」；再平衡建議格式：`賣 200 股  約 NT$8,000`。

**常用 global class：**

| Class | 用途 |
|-------|------|
| `.ft-panel` | 卡片容器 |
| `.ft-section-header` | Panel 標題列（flex，左右各放 title / actions） |
| `.ft-section-title` | 標題文字（700, `--text`） |
| `.ft-table` / `.ft-table-scroll` | 標準表格 / 橫向捲動包裝 |
| `.num-value` | 數值欄（monospace, `--text-value`） |
| `.cell-primary` | 主要數值（`--text` 色，覆蓋 td 預設） |
| `.btn-ghost` | 外框按鈕；hover 填 `accent-bg`，active scale(0.97) |
| `.btn-ghost--accent` | accent 邊框/色彩變體，hover 加 glow |
| `.btn-icon` / `.btn-icon.accent` | Icon-only 操作按鈕 |
| `.txt-up / .txt-down / .txt-flat` | 漲跌色 utility |
| `.stock-code / .stock-name` | 代碼（粗體）/ 名稱（小字 muted） |
| `.drag-handle` | 拖拉控點 |
| `.ft-toggle` / `.ft-toggle__track` | CSS-only toggle switch（hidden checkbox + label trick）；`input:checked` 時 track 變 `--accent-bg`，thumb 平移 16px |

**Icon 規則**：所有圖示一律使用 `<Icon name="..." size={N} />` 元件（`views/components/Icon.tsx`，包裝 Material Symbols Rounded）。**禁止**直接在 JSX 中使用 Unicode 符號作為圖示（如 `⚠`、`＋`、`▷`、`⟳`、`💡`、`📉`）。以下為常用圖示名稱對照：

| 用途 | Material icon name |
|------|--------------------|
| 新增 | `add` |
| 警告 / 偏差 | `warning` |
| 提醒時程 | `schedule` |
| 系統建議 / AI 策略 | `tips_and_updates` |
| 跌幅趨勢 | `trending_down` |
| 漲幅趨勢 / 台股總覽 SideNav | `trending_up` |
| 執行 / 播放 | `play_arrow` |
| 重新整理 | `sync` |
| 展開（收折中） | `expand_more` |
| 收折（展開中） | `expand_less` |
| 觀察區狀態 | `adjust` |
| 配置正常 | `check` |
| 超出上限 | `close` |
| 交易區（向上） | `north` |
| 曝險比 Badge | `speed` |
| 投報計畫 SideNav | `savings` |

例外：`▲`/`▼` 作為**股價漲跌**的文字符號（HoldingsTable、WatchlistTable、MarketIndicesRow 等）不需替換；`✓`/`✗` 在純文字模板字串中（非 JSX）不需替換。

**`<Icon>` 元件支援 `aria-hidden` prop**（已加入型別宣告）。按鈕內有文字標籤時，圖示為裝飾性，**必須**加 `aria-hidden="true"`；純圖示按鈕（`.btn-icon`）則須在 `<button>` 上加 `aria-label`：
```tsx
// 有文字標籤 → icon 裝飾性
<button className="btn-ghost" onClick={openAdd}>
  <Icon name="add" size={20} aria-hidden="true" /> 新增
</button>

// 純圖示 → button 加 aria-label
<button className="btn-icon" onClick={prev} aria-label="上一頁">
  <Icon name="chevron_left" size={24} />
</button>
```

### Radix UI Primitives

使用 headless primitives，行為 / a11y 由 Radix 提供，樣式由專屬 CSS class 控制（定義於 `global.css`）：

| Primitive | 使用位置 | CSS class |
|-----------|----------|-----------|
| `@radix-ui/react-dialog` | `Modal.tsx` | `.ft-modal-backdrop` / `.ft-modal` / `.ft-modal--{sm,md,lg}` / `.ft-modal__header` / `.ft-modal__body` / `.ft-modal__footer`；接受可選 `className` prop 可附加自訂 class（如 `SettingsModal` 的 `settings-modal` 覆寫固定 80vw×80vh） |
| `@radix-ui/react-slider` | `RiskPanel.tsx` | `.rd-slider` / `.rd-slider__track` / `.rd-slider__range` / `.rd-slider__thumb` |
| `@radix-ui/react-select` | `RiskPanel.tsx` | `.rd-select-trigger` / `.rd-select-content` / `.rd-select-item` |
| `@radix-ui/react-tooltip` | `RiskPanel.tsx`、`PanelHeader.tsx`、`StockOverviewPage.tsx`、`PlanPage.tsx` | inline style，`appendTo: document.body`；`PanelHeader.css` 的 `.ph-stat__sub-tooltip` 為 ph-stat 次要數值 tooltip 樣式（Portal 渲染，不受 overflow 裁切） |

`Tooltip.Trigger asChild` 搭配非可聚焦元素（`<div>`、`<span>`）時，**必須**加 `tabIndex={0}`，確保鍵盤使用者能聚焦並觸發 tooltip：
```tsx
<Tooltip.Trigger asChild>
  <div className="ph-stat" tabIndex={0}>…</div>
</Tooltip.Trigger>
```

Modal 動畫：`data-state="open/closed"` 搭配 CSS `@keyframes overlay-in/out`、`modal-in/out`，定義於 `Modal.css`。

---

## 關鍵共用元件

| 元件 | 用途 |
|------|------|
| `PanelHeader` | 各頁頂部橫幅；掛載時呼叫 `snapshotStore.load()`；顯示流動資金輸入欄與曝險比徽章（`liveStockValue / (liveStockValue + cashBalance)`），顏色由 `snapshotStore.marketStateAuto` 推導的門檻判斷，VIX 資訊顯示於 Tooltip。流動資金欄無文字標籤，以 `placeholder="流動部位"` + `aria-label="流動部位"` 替代。左側 `panel-header__left` 支援**橫向捲動 + 滑鼠拖拉**（`overflow-x: auto`，scrollbar 隱藏，mousedown/mousemove 拖拉邏輯在 `PanelHeader.tsx`）；右側 `panel-header__right`（流動資金 + 曝險比）`flex-shrink: 0` 永遠可見 |
| `ECGLoader` | 頁面切換心電圖動畫，位於 `views/components/ECGLoader/`，由 `MainLayout` 掛載 |
| `StockExpandPanel` | 持股 / 關注清單展開列，含 K線 / 法人基本面 / 交易紀錄 / 標籤設定 四個 Tab |
| `Modal` | Radix Dialog 封裝（sm/md/lg，ESC 關閉，backdrop blur 動畫） |
| `ConfirmDialog` | 刪除確認，傳入 `onConfirm / onCancel` |
| `Toast` | `import { toast } from '../components/Toast'`，呼叫 `.success/.error/.info` |
| `LoadingPanel` | 骨架屏 / spinner |
| `FormInputs` | 表單元件庫：`FormField` / `TextInput` / `NumberInput` / `SelectInput` / `RadioGroup` / `TextareaInput`；CSS class 前綴 `fi-`，焦點 glow 定義於 `FormInputs.css` |
| `SparkLine` | 90 日走勢迷你折線圖（ECharts） |
| `KLineChart` | 互動式 K 線圖（ECharts，含 MA、成交量、滾輪鎖定） |
| `MultiLineChart` | 多系列折線圖（ECharts），`color: chartColors` 全域調色板 |
| `MarketIndicesRow` | 頁頂市場指數橫列 |
| `RiskPanel` | 風險再平衡模組（可收折），使用 Radix Slider / Select，設定區採 2 欄 CSS Grid |
| `DataTable` | 通用排序 / 搜尋表格（`views/components/DataTable/`）；props：`columns / data / rowKey / onRowClick / searchKeys / headerActions`；中文排序以 `'zh-TW'` locale |
| `StatusBadge` | 狀態徽章；`variant: 'up' \| 'down' \| 'flat' \| 'accent' \| 'muted'`；class `ft-badge ft-badge--{variant}` |
| `WatchlistCardGrid` | 關注清單小卡模式（`views/pages/stock/`）；支援 `strategies` / `onOpenStrategy` props；小卡右上角紅點（`triggered`）或藍點（`active`）由 `resolveStrategyStatus` 判斷；點擊小卡觸發 `TradingStrategyModal` |
| `TradingStrategyModal` | AI 交易策略詳情（`views/pages/stock/`）；size="sm"；`strategy=null` 時顯示空狀態；「忽略」按鈕呼叫 `onDismiss()` 後立即 `onClose()`（樂觀更新已在 ViewModel 完成） |
| `SummaryCard` | 數值卡片；props：`label / value / sub / valueClass`；class `sc-card ft-panel` |

**ph-stat 設計規則**（PanelHeader 左側統計項目）：次要數值（hover 顯示）**必須用 Radix Tooltip Portal**（`.ph-stat__sub-tooltip`），不得用 CSS-only absolute（被 overflow 容器裁切）。`Tooltip.Trigger asChild` 時 `<div>` 須加 `tabIndex={0}`。定位：`sideOffset={-8} side="bottom"`；Tooltip 背景固定為 `#232b36`，禁用 `var(--surface)`（對比不足）。

**PlanParamRow 拖拉規則**：`onMouseDown` 遇到 `INPUT / BUTTON / SELECT / TEXTAREA / LABEL` 直接 return，避免干擾卡片內互動元素。

**SettingsModal 佈局**：size="md"，無 tab 結構，三個扁平 section（股票清單 / 每日快照 / 系統診斷），內容用 `.settings-section` / `.settings-row` rows，**不使用 `.ft-panel`**。系統診斷 section 包含報價/持倉/指數測試與 Shioaji 重新初始化（輪詢最多 10 次×2s）。CSS 定義於 `views/layout/SettingsModal.css`。

**ReportPage 圖表**（非共用元件，位於 `pages/report/ReportChart.tsx`，已加 `React.memo`）：Line 折線圖（淨損益 / 相對報酬率）+ Bar 長條圖（每日交易買賣金額）混合 ECharts 圖，雙 Y 軸，支援雙段比較。無股票對比時顯示淨損益折線，Tooltip 內附報酬率%；有股票對比時切換為相對報酬率折線。`txBars` prop 傳入每日交易資料（買正賣負，重疊同位），點擊長條觸發 `onBarClick(date)`；圖例顯示/隱藏狀態持久化至 `localStorage`（key: `report_legend_selected`）。`transactionModel.fetchTransactionsInRange(start, end)` 依快照日期範圍拉取交易，`ReportPage` 彙整為 `DailyTxBar[]` 後傳入。

### Accessibility 必要項

- icon-only 按鈕加 `aria-label`（有文字標籤時 icon 加 `aria-hidden="true"`）
- 收折/展開面板：`aria-expanded`、`aria-controls`
- 表單欄位：`<label htmlFor>` 對應；驗證訊息：`aria-live="polite"` 包覆
- Tab 元件：`role="tablist"` / `role="tab"` / `role="tabpanel"` / `aria-selected`
- 數值欄：`font-variant-numeric: tabular-nums`
- 動畫：`@media (prefers-reduced-motion: reduce)` fallback
- Native select：明確設定 `background-color` 與 `color`

---

## ECharts 使用規則

- 每個使用 ECharts 的模組頂層必須呼叫 `echarts.use([...])` 一次（Tree-shaking）；同一模組不得重複。
- Tooltip 若被父層 `overflow: hidden` 裁切，加 `tooltip: { appendTo: () => document.body }`。
- ECharts candlestick 資料格式：`[open, close, lowest, highest]`（close 在 low 之前）。
- 多系列折線圖傳入 `color: [...chartColors]` 作為全域調色板。

**gap 虛線橋接模式**（遺失資料點的視覺連線）：

用兩層同色 line series 疊加。上層 solid（z=3，`connectNulls: false`）在連續段顯示；下層 dashed（z=2，`connectNulls: true`）橋接遺失區間——solid 蓋住下層的連續段，只有在空洞處才看得到虛線。命名以 `__` 開頭的 ghost series 須從 `legend.data` 與 tooltip formatter 的 params 中過濾掉。

```ts
// Tooltip formatter 中必須同時過濾 ghost 和非數字值（ECharts 空值可能回傳字串 '-'）
const ps = all.filter(p =>
  !p.seriesName.startsWith('__') &&
  typeof p.value === 'number' &&
  isFinite(p.value),
);
```

---

## 拖拉排序（DnD Kit）

- 使用 `@dnd-kit/core` + `@dnd-kit/sortable`。
- `PointerSensor` 設 `activationConstraint: { distance: 5 }` 避免誤觸點擊。
- 拖拉後呼叫後端 reorder API，本地排序 optimistic（API 失敗靜默）。

---

## TypeScript 規則

- `tsconfig.app.json` 開啟 `noUnusedLocals / noUnusedParameters`。**宣告但未使用的變數、函式、import 一律刪除**，否則 `tsc -b`（CI build）會失敗。重構或移除功能時，必須同步清理孤立的宣告。
- DTO 型別（後端回傳）與 Payload 型別（前端送出）都定義在 `types/index.ts`（唯一真實來源）。
- `verbatimModuleSyntax: true`，type-only import 須用 `import type { … }`。
- `erasableSyntaxOnly: true`，禁止使用需要 emit 的語法（`enum`、`namespace`、帶初始值的建構子參數屬性、experimentalDecorators）。
- `skipLibCheck: true`，`.d.ts` 不做型別檢查；`"react/canary"` 在 `types` 陣列中啟用 `ViewTransition` 型別（已正式用於展開列與視圖切換動畫）。
- ECharts option 物件內的 series 若需動態 push 不同型別，用 `any[]` 並以 `// eslint-disable-next-line @typescript-eslint/no-explicit-any` 抑制警告。
