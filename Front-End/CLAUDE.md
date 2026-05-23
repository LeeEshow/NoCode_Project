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
npx tsc --noEmit   # 型別檢查（不產生輸出檔，用於驗證變更）
```

**安裝新套件**：因為 `react@canary` 與部分套件的 peer dep 宣告衝突，須加 `--legacy-peer-deps`：
```bash
npm install <package> --legacy-peer-deps
```

**Vite 快取問題**（出現 504 Outdated Optimize Dep）：
```bash
Remove-Item -Recurse -Force node_modules/.vite
npm run dev
```

後端在 `../Back-End/backend/`，前端 API baseURL 預設指向 `http://localhost:3001/api/v1`，可透過 `.env` 的 `VITE_API_BASE_URL` 覆寫。

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

### ViewModel 清單

| Hook | 頁面 / 用途 |
|------|------------|
| `useHoldingsViewModel` | 持股 CRUD、樂觀排序、即時報價輪詢 |
| `useWatchlistViewModel` | 關注清單 CRUD、樂觀排序 |
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

---

### Zustand Stores（跨頁全域狀態）

| Store | 用途 |
|-------|------|
| `planStore` | 當年度原始輸入：`execCapital / reinvest / forexValue / liveStockValue`。由 `useEnsurePlanStore` 初始化一次；`StockOverviewPage` 在 `holdings.items` 變動後呼叫 `updateStockValue()` 同步。整年報酬率以 `useMemo` 在 `StockOverviewPage` 計算，**不存於 store** |
| `snapshotStore` | 流動資金 `cashBalance`、`vix`、`marketStateAuto`，今日快照優先，無則 fallback 最近一筆。`PanelHeader` 掛載時自動呼叫 `load()`，含 `PanelHeader` 的頁面無需另行觸發 |

### 使用者偏好（`usePreferencesViewModel`）

**雙層持久化**：localStorage 立即讀寫（確保無閃爍）→ 500ms debounce 後同步後端（`PUT /preferences`）。  
`prefs.chart`：K 線圖顯示元素。`prefs.expandTab`：已廢棄，展開列每次開啟重設為 `'kline'`。

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

### Tag 與風險模型

- **HoldingTagDTO** 內嵌於 `HoldingDTO.tags[]`，由 `GET /holdings` 回傳，不需獨立 fetch。`holdingModel.ts` 的 `toHoldingDTO()` 負責映射，確保 `tags: raw.tags ?? []`。
- **全局 Tag（TagDTO）** 由 `useTagViewModel` 管理，包含 CRUD（`/tags`）、AssetTag、MarketState 切換、相關性矩陣、`recalculateDynamicRisk`。
- **Risk 計算**：`useRiskViewModel` 依 `correlationEntries` 建 ρ 查找表，未設定 pair 預設 ρ=1.0。`dynamicRisk` 優先，`targetWeight` 為 null 的 Tag 不計算 delta/triggered。
- **相關性矩陣**：`utils/correlationCalc.ts` 提供 `calcTagDailyReturnsFromSparklines`（sparklines→日報酬序列）與 `buildCorrelationEntries`（計算 Pearson ρ）；`stdDev` 也從此處 export。
- **交易時段判斷**：`utils/tradingHours.ts` 的 `isTradingHours()` 回傳目前是否為台股盤中（週一至五 09:00–13:30 台灣時間）；報價輪詢 callback 內必須呼叫此函式，不可在外層判斷（stale closure 問題）。

### 頁面切換動畫（ECGLoader + Overlay）

路由切換時的過場動畫由兩個層次組成，皆以 `useLocation().pathname` 偵測路由變更：

**1. 全屏遮罩（`MainLayout`）**
- 路由變更時，`var(--bg)` 深色遮罩（z-index 9998）立即蓋住整個頁面
- 700ms 後以 300ms 淡出，新頁面才顯露
- 新頁面元件在背景靜默 mount + fetch，遮罩提供視覺緩衝

**2. 股價折線動畫（`views/components/ECGLoader/ECGLoader.tsx`）**
- 固定定位於頁面正中央（z-index 9999），顯示在遮罩上方
- xorshift32 偽隨機 + 動量衰減 + 均值回歸，在 module 載入時生成 300 點股價走勢路徑（固定 seed，結果一致）
- SVG 以 `clip-path: inset(0 100% 0 0)` → `inset(0 0% 0 0)` 左→右展開；路徑下方有半透明漸層填色
- 紅色發光圓點（`.ecg-loader__dot`）跟隨趨勢從左下往右上移動，模擬行情頭燈
- 底部有刻度點（每 40 SVG 單位一個），同步隨 clip-path 顯現
- 總時長：500ms 展開 + 200ms 淡出 = 700ms
- 首次 mount 不觸發（`isFirstRender` ref guard）
- **注意**：使用 `useLocation()`，不可改用 `useNavigation()`（需 data router，本專案用 `<BrowserRouter>`）

---

## 設計系統

### 雙層 Token 架構（CSS ↔ JS 必須同步）

- **CSS 變數**：`styles/tokens.css`
- **JS 常數**：`styles/theme.ts`，使用 `import { colors } from '../../../styles'`

兩邊必須同步，異動時一起更新。`App.css` / `index.css` 是 Vite 樣板殘留，請勿修改。

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

圖表色板（莫蘭迪 6 色）：CSS 變數 `--chart-1` ～ `--chart-6`；JS 陣列 `chartColors` 從 `styles` 匯出，供 ECharts 及 TagStat 進度條循環使用。

**字型**：`tokens.css` 與 `theme.ts` 兩邊皆為 `'Open Sans', sans-serif`（sans 與 mono 相同）。Google Fonts 只載入 Open Sans，禁止在 `theme.ts` 引用未載入的字型（如 IBM Plex）。

### CSS 慣例

- 元件內禁止自定義顏色值，只用 CSS 變數。
- 全域共用 class 定義於 `styles/global.css`；元件專屬 CSS 放在同目錄。
- 數值欄加 `className="num-value"`（monospace + `--text-value`）。

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

Icon：`<Icon name="edit" size={18} />` 包裝 Material Symbols Rounded。

### Radix UI Primitives

使用 headless primitives，行為 / a11y 由 Radix 提供，樣式由專屬 CSS class 控制（定義於 `global.css`）：

| Primitive | 使用位置 | CSS class |
|-----------|----------|-----------|
| `@radix-ui/react-dialog` | `Modal.tsx` | `.ft-modal-backdrop` / `.ft-modal` / `.ft-modal--{sm,md,lg}` / `.ft-modal__header` / `.ft-modal__body` / `.ft-modal__footer`；接受可選 `className` prop 可附加自訂 class（如 `SettingsModal` 的 `settings-modal` 覆寫固定 80vw×80vh） |
| `@radix-ui/react-slider` | `RiskPanel.tsx` | `.rd-slider` / `.rd-slider__track` / `.rd-slider__range` / `.rd-slider__thumb` |
| `@radix-ui/react-select` | `RiskPanel.tsx` | `.rd-select-trigger` / `.rd-select-content` / `.rd-select-item` |
| `@radix-ui/react-tooltip` | `RiskPanel.tsx`、`PanelHeader.tsx` | inline style，`appendTo: document.body` |

Modal 動畫：`data-state="open/closed"` 搭配 CSS `@keyframes overlay-in/out`、`modal-in/out`，定義於 `Modal.css`。

Radix Slider 用法（`aria-labelledby` 連結 label）：
```tsx
<span id="lbl-threshold">偏離門檻</span>
<Slider.Root aria-labelledby="lbl-threshold" ...>
  <Slider.Track className="rd-slider__track">
    <Slider.Range className="rd-slider__range" />
  </Slider.Track>
  <Slider.Thumb className="rd-slider__thumb" />
</Slider.Root>
```

---

## 關鍵共用元件

| 元件 | 用途 |
|------|------|
| `PanelHeader` | 各頁頂部橫幅；掛載時呼叫 `snapshotStore.load()`；顯示流動資金輸入欄與曝險比徽章（`liveStockValue / (liveStockValue + cashBalance)`），顏色由 `snapshotStore.marketStateAuto` 推導的門檻判斷，VIX 資訊顯示於 Tooltip |
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

**SettingsModal 佈局**：size="md"，無 tab 結構，兩個扁平 section（股票清單 / 每日快照），內容用 `.settings-section` / `.settings-row` rows，**不使用 `.ft-panel`**。CSS 定義於 `views/layout/SettingsModal.css`。

**ReportPage 圖表**（非共用元件，位於 `pages/report/ReportChart.tsx`，已加 `React.memo`）：Bar（累計投入）+ Line（報酬率）混合 ECharts 圖，雙 Y 軸，支援雙段比較，含 markLine 目標線。

**ReportPage 佈局**：
- 上方 Panel：日期範圍控制（段一必填、段二可選）+ ReportChart
- 下方 Panel：Tab 段一 / 段二，各自獨立快照明細表（30 筆一頁）
- `toChartData()` 以第一筆實際快照日期為 dayIndex 基準（非 startDate），避免左側空洞

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

- `tsconfig.app.json` 開啟 `noUnusedLocals / noUnusedParameters`，未使用的 import 必須刪除才能通過編譯。
- DTO 型別（後端回傳）與 Payload 型別（前端送出）都定義在 `types/index.ts`（唯一真實來源）。
- `verbatimModuleSyntax: true`，type-only import 須用 `import type { … }`。
- `erasableSyntaxOnly: true`，禁止使用需要 emit 的語法（`enum`、`namespace`、帶初始值的建構子參數屬性、experimentalDecorators）。
- `skipLibCheck: true`，`.d.ts` 不做型別檢查；`"react/canary"` 在 `types` 陣列中啟用 ViewTransition 型別（保留以備未來使用）。
- ECharts option 物件內的 series 若需動態 push 不同型別，用 `any[]` 並以 `// eslint-disable-next-line @typescript-eslint/no-explicit-any` 抑制警告。
