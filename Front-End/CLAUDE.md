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

---

## Architecture

### MVVM 分層

```
src/
├── api/axios.ts              # Axios 單例，統一 baseURL / timeout / 錯誤攔截
├── types/index.ts            # 全域 DTO 與 Payload 型別（唯一真實來源）
├── models/                   # 純 API 呼叫函式（無狀態）
├── viewmodels/               # React hooks，封裝 state + CRUD，供 View 使用
└── views/
    ├── layout/               # MainLayout、SideNav（展開/收折）、TopBar
    ├── pages/                # 各頁面元件及其子元件、CSS
    └── components/           # 跨頁面共用元件
```

- **Model**：只負責 `fetch/create/update/delete`，直接回傳 DTO，不持有狀態。
- **ViewModel**：`useState` + `useCallback`，暴露 `loading / saving / error` 及 CRUD 方法。
- **View**：不直接呼叫 API，所有副作用透過 ViewModel。

### 路由（App.tsx）

| Path | Page |
|------|------|
| `/` | StockOverviewPage（台股總覽） |
| `/assets` | AssetsPage（外幣資產） |
| `/plan` | PlanPage（投報計畫） |
| `/report` | ReportPage（績效報告） |
| `/settings` | SettingsPage |

所有頁面包在 `MainLayout`（含 SideNav + TopBar）內。全域通知透過 `<ToastContainer />`（zustand store）。

### 設計系統

- **所有顏色、字型、間距變數定義在 `styles/tokens.css`**，禁止在元件中自定義顏色。
- 深色主題：`--bg: #090303`（body）→ `--surface: #0b0b11`（Sidebar/TopBar）→ `--panel: #25252b`（卡片）。
- 字型：`--font-sans`（IBM Plex Sans，介面文字）、`--font-mono`（IBM Plex Mono，所有數值欄位）。
- 漲跌色：漲 `--up` (#B87A7A 偏紅)、跌 `--down` (#7CA88D 偏綠)，配套 `-bg`、`-bd` 變體。
- Icon：全站使用 **Material Symbols Rounded**（Google Fonts），透過 `views/components/Icon.tsx` 統一包裝。

### 關鍵共用元件

| 元件 | 用途 |
|------|------|
| `PanelHeader` | 各頁頂部橫幅（含統計 stat + 流動資金輸入） |
| `Modal` | 通用 Dialog（sm/md/lg 三種尺寸，ESC 關閉） |
| `DataTable` | 可排序 / 可搜尋的通用表格元件 |
| `FormInputs` | `TextInput`、`NumberInput`、`SelectInput`、`TextareaInput` |
| `Toast` | 全域通知（`toast.success/error`，zustand store） |
| `LoadingPanel` | 骨架屏 / spinner |
| `Icon` | `<Icon name="edit" size={18} />` 包裝 Material Symbol |

### CSS 慣例

- 全域共用 class 定義於 `styles/global.css`（`.btn-ghost`、`.btn-icon`、`.ft-table`、`.ft-panel` 等）。
- 元件專屬 CSS 放在同目錄（e.g. `SideNav.css`）。
- `.ft-table tbody td` 數值欄統一加 `className="num-value"`（`--font-mono`、`--text-value`）。
- Table 操作按鈕用 `.btn-icon`（無邊框、icon only），加 `.accent` class 表示主要動作。

### TypeScript 規則

- `tsconfig.app.json` 開啟 `noUnusedLocals` / `noUnusedParameters`，刪除未使用的 import 才能通過編譯。
- DTO 型別（後端回傳）與 Payload 型別（前端送出）都定義在 `types/index.ts`。
- `verbatimModuleSyntax: true`，type-only import 須用 `import type { … }`。
