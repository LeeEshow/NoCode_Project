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
npx tsc --noEmit   # 型別檢查（不產生輸出檔，用於驗證變更）
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
├── stores/                   # Zustand 跨頁全域 store（見下方說明）
└── views/
    ├── layout/               # MainLayout、SideNav（展開/收折）、TopBar
    ├── pages/                # 各頁面元件及其子元件、CSS
    └── components/           # 跨頁面共用元件
```

- **Model**：只負責 `fetch/create/update/delete`，直接回傳 DTO，不持有狀態。
- **ViewModel**：`useState` + `useCallback`，暴露 `loading / saving / error` 及 CRUD 方法。每個頁面自行 instantiate 所需的 viewmodel，不跨頁共用。
- **View**：不直接呼叫 API，所有副作用透過 ViewModel。

### Zustand Stores（跨頁全域狀態）

ViewModels 是頁面內 local state；跨頁需要共用的狀態放在 `stores/`：

| Store | 用途 |
|-------|------|
| `planStore` | 投報計畫當年度 `currentYearReturnPct / currentYearReturnValue`，由 `useEnsurePlanStore` 在首頁懶載入後寫入，供 PanelHeader stat 讀取 |
| `snapshotStore` | 流動資金 `cashBalance`，今日快照優先，無則 fallback 最近一筆；PanelHeader 輸入框直接操作此 store |

`useEnsurePlanStore`（viewmodels）：負責確保 `planStore` 只被初始化一次，在 `StockOverviewPage` 掛載時呼叫。

### 使用者偏好（`usePreferencesViewModel`）

**雙層持久化**：localStorage 立即讀寫（確保 UI 無閃爍）→ 500ms debounce 後同步後端（`PUT /preferences`）。  
`prefs.chart`：K 線圖顯示元素（showK / showMA5 / showMA20 / showMA60 / showVolume / zoomLock）  
`prefs.expandTab`：不再用於持久化（已改為展開列 local state，每次展開重設為 `'kline'`）

### 路由（App.tsx）

| Path | Page |
|------|------|
| `/` | StockOverviewPage（台股總覽） |
| `/assets` | AssetsPage（外幣資產） |
| `/plan` | PlanPage（投報計畫） |
| `/report` | ReportPage（績效報告） |
| `/settings` | SettingsPage |

所有頁面包在 `MainLayout`（含 SideNav + TopBar）內。全域通知透過 `<ToastContainer />`（zustand store）。

---

## 設計系統

### 雙層 Token 架構

CSS 層與 JS 層各一份，**兩邊修改時必須同步**：

- **CSS 變數**：`styles/tokens.css`（所有頁面適用）
- **JS 常數**：`styles/theme.ts`（ECharts / Canvas 等無法讀取 CSS 變數的場景）
  - 使用方式：`import { colors } from '../../../styles'`

### 核心色票

深色主題層次：`--bg: #101010`（body）→ `--surface: #0a0a0f`（Sidebar/TopBar）→ `--panel: #212126`（卡片）

漲跌色：漲 `--up` `#B87A7A`（偏紅）、跌 `--down` `#7CA88D`（偏綠），配套 `-bg`、`-bd` 變體。  
互動色：`--accent: #6A8FB5`，配套 `-bg`、`-bd` 變體。

字型：CSS 層為 **Open Sans**（`tokens.css` 的 `--font-sans` / `--font-mono` 皆指向 Open Sans）。`theme.ts` JS 層寫 IBM Plex — 僅用於 ECharts 字型宣告，不影響 CSS 渲染。

Icon：全站使用 **Material Symbols Rounded**（Google Fonts），透過 `views/components/Icon.tsx` 統一包裝：`<Icon name="lock" size={18} />`

### CSS 慣例

- 禁止在元件中自定義顏色，只用 CSS 變數。
- 全域共用 class 定義於 `styles/global.css`（`.btn-ghost`、`.btn-icon`、`.ft-table`、`.ft-panel`、`.ft-section-header` 等）。
- 元件專屬 CSS 放在同目錄（e.g. `SideNav.css`）。
- `.ft-table tbody td` 數值欄統一加 `className="num-value"`（`--font-mono`、`--text-value`）。
- Table 操作按鈕用 `.btn-icon`（無邊框、icon only），加 `.accent` class 表示主要動作。

---

## 關鍵共用元件

| 元件 | 用途 |
|------|------|
| `PanelHeader` | 各頁頂部橫幅（含統計 stat + 流動資金輸入） |
| `Modal` | 通用 Dialog（sm/md/lg 三種尺寸，ESC 關閉） |
| `DataTable` | 可排序 / 可搜尋的通用表格元件 |
| `FormInputs` | `TextInput`、`NumberInput`、`SelectInput`、`TextareaInput` |
| `Toast` | 全域通知（`toast.success/error`，zustand store） |
| `LoadingPanel` | 骨架屏 / spinner |
| `Icon` | `<Icon name="edit" size={18} />` 包裝 Material Symbol |
| `SparkLine` | 90 日走勢迷你折線圖（Recharts） |
| `KLineChart` | 互動式 K 線圖（ECharts，含 MA 線、成交量、滾輪鎖定） |

---

## ECharts 使用規則

K 線圖（`KLineChart`）和籌碼圖（`HoldingsTable` 內的 `ChipChart`）使用 ECharts 5：

- 每個使用 ECharts 的模組頂層必須呼叫 `echarts.use([...])` 註冊所需元件（Tree-shaking）。
- 同一模組不得重複 `echarts.use`，否則 React StrictMode 下會警告。
- Tooltip 若被父層 `overflow: hidden` 裁切，在 option 中加 `tooltip: { appendTo: () => document.body }`。
- ECharts candlestick 資料格式：`[open, close, lowest, highest]`（注意 close 在 low 之前）。

---

## 拖拉排序（DnD Kit）

持股表格（`HoldingsTable`）與關注清單（`WatchlistTable`）支援拖拉重排：

- 使用 `@dnd-kit/core` + `@dnd-kit/sortable`。
- `PointerSensor` 設定 `activationConstraint: { distance: 5 }` 避免誤觸點擊事件。
- 拖拉完成後呼叫後端 reorder API，本地排序即時生效（optimistic），API 失敗靜默。

---

## TypeScript 規則

- `tsconfig.app.json` 開啟 `noUnusedLocals` / `noUnusedParameters`，刪除未使用的 import 才能通過編譯。
- DTO 型別（後端回傳）與 Payload 型別（前端送出）都定義在 `types/index.ts`。
- `verbatimModuleSyntax: true`，type-only import 須用 `import type { … }`。
