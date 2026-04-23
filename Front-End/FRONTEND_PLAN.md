# 個人理財雲端系統 — 前端開發計畫

> 版本：1.0（2026-04-22）
> 技術棧：React 18 / TypeScript / Vite / React Bootstrap 5

---

## 一、技術架構

### 前端
- **框架**：React.js (TypeScript)
- **架構模式**：MVVM（Model 層負責 API 呼叫 + 反序列化，ViewModel 層透過 Custom Hook 實作）
- **資料夾結構**：`api/` / `types/` / `models/` / `viewmodels/` / `views/`
- **UI 元件庫**：React Bootstrap 5（react-bootstrap）
- **圖表庫**：ECharts（`echarts-for-react`）— 統一處理 K線、MA線、SparkLine、長條圖、多股比較曲線、績效走勢圖；按需引入（`echarts/core`）降低 bundle 體積
- **狀態管理**：Zustand
- **HTTP Client**：Axios
- **設計原則**：前端設計原則請尊循 Frontend-Reat.md 設計指南

### 前端負責的計算（後端不處理）

| 計算項目 | 所在位置 |
|---------|---------|
| 庫存均價（成本保留法 / 獲利歸還法） | `holdingModel.ts` |
| 未實現損益、成長率 | `holdingModel.ts` |
| MARC 複利試算（`buildMARCRows()`） | `planModel.ts` |
| 年度報酬率 | `planModel.ts` |
| MARC 目標線插值（績效報告） | `useSnapshotViewModel.ts` |
| 外幣 / 債券台幣換算 | `foreignCurrencyModel.ts` / `bondModel.ts` |

---

## 二、UI/UX 設計風格與規範

> 所有設計 Token 集中管理於 `frontend/src/styles/`，各頁面元件禁止自行宣告顏色 / 字型變數，一律引用以下規範。

### 2.1 整體風格

| 項目 | 規格 |
|------|------|
| 設計語言 | **Dark Mono Terminal** — 深色底、等寬字型為主視覺骨幹 |
| 色彩策略 | 低彩度深色背景 × 中性文字色系 × 紅/綠漲跌雙色點綴 |
| 字型策略 | 數值 / 代碼用 IBM Plex Mono；介面文字用 IBM Plex Sans |
| 邊框策略 | 細線（1px）分隔，hover 時升亮至 `--border-hi` |
| 動畫策略 | 微互動 `0.12s ease`；側欄展開 `0.2s cubic-bezier(0.4,0,0.2,1)` |

---

### 2.2 背景色規範

| Token | 值 | 用途 |
|-------|-----|------|
| `--bg` | `#090909` | 最底層 body 背景 |
| `--surface` | `#0D0D0F` | Sidebar、TopBar 背景 |
| `--panel` | `#1A1A1E` | 卡片（指數小卡 / Panel）、Table 背景 |

---

### 2.3 邊框色規範

| Token | 值 | 用途 |
|-------|-----|------|
| `--border` | `#1E1E22` | 一般邊框（Panel、Table row、nav 分隔） |
| `--border-hi` | `#2A2A30` | hover 狀態邊框、按鈕邊框 |

---

### 2.4 文字色規範

| Token | 值 | 用途 |
|-------|-----|------|
| `--text` | `#C9D1D9` | 主文字（代碼、Section Title、股票代號） |
| `--text-value` | `#D7DFE6` | 數值統一色（指數 / Table num-value） |
| `--muted` | `#8B949E` | 次要文字（按鈕文字、banner label） |
| `--dim` | `#6B7681` | 輔助文字（Nav 圖示、分隔線文字） |
| `--label` | `#7A8490` | 小標題（指數卡片標題 card-label、股票中文名稱 stock-name） |
| `--thead-text` | `#7A8FA0` | Table 表頭欄位文字 |

---

### 2.5 漲跌 / Accent 色規範

| Token | 值 | 用途 |
|-------|-----|------|
| `--up` | `#B87A7A` | 漲（紅）文字色 |
| `--up-bg` | `rgba(184,122,122,0.10)` | 漲背景（Tag / badge） |
| `--up-bd` | `rgba(184,122,122,0.22)` | 漲邊框 |
| `--down` | `#7CA88D` | 跌（綠）文字色 |
| `--down-bg` | `rgba(124,168,141,0.10)` | 跌背景 |
| `--down-bd` | `rgba(124,168,141,0.22)` | 跌邊框 |
| `--flat` | `#6E7681` | 平盤色 |
| `--accent` | `#6A8FB5` | 互動 Accent（選中 Nav、hover 按鈕） |
| `--accent-bg` | `rgba(106,143,181,0.10)` | Accent 背景 |
| `--accent-bd` | `rgba(106,143,181,0.26)` | Accent 邊框 |

---

### 2.6 字型規範

| Token | 值 | 用途 |
|-------|-----|------|
| `--font-sans` | `'IBM Plex Sans', sans-serif` | 介面文字、按鈕、nav label |
| `--font-mono` | `'IBM Plex Mono', monospace` | 數值、代號、badge |

**Google Fonts 引入**（`index.html <head>`）：
```html
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
```

---

### 2.7 字級規範

| Token | 值 | 使用場景 |
|-------|-----|---------|
| `--text-2xs` | `10px` | 日期標註、session 標籤 |
| `--text-sm` | `12px` | Table 表頭、card-label、stock-name、change-tag |
| `--text-md` | `13px` | Table body、按鈕、Nav label、badge |
| `--text-base` | `14px` | 一般內文、futures-val |
| `--text-lg` | `15px` | Section Title、body 預設 |
| `--text-xl` | `16px` | 指數主數值（card-value） |

---

### 2.8 圓角規範

| Token | 值 | 用途 |
|-------|-----|------|
| `--radius-xs` | `3px` | badge、小 tag |
| `--radius-sm` | `4px` | 按鈕（btn-ghost、op-btn） |
| `--radius-md` | `6px` | Panel、Nav item |
| `--radius-lg` | `10px` | 指數小卡（market-card / futures-card） |

---

### 2.9 佈局規範

| 項目 | 規格 |
|------|------|
| Sidebar 收折寬 | `52px`（`--nav-collapsed-w`）— 僅顯示圖示 |
| Sidebar 展開寬 | `192px`（`--nav-expanded-w`）— 圖示 + 標籤 |
| Sidebar 自動展開 | 視窗 ≥ 1200px 自動展開，< 1200px 收折 |
| TopBar 高度 | `52px`（`--topbar-h`） |
| Main padding-top | `72px`（需留 TopBar 空間） |
| Panel margin-bottom | `16px` |

---

### 2.10 Style 資料夾使用方式

```
frontend/src/styles/
├── tokens.css    ← CSS 自訂屬性（唯一來源）
├── global.css    ← 全域樣式、共用 class（ft-panel, ft-table, btn-ghost 等）
├── theme.ts      ← TypeScript 版 tokens（供 ECharts / 內聯樣式使用）
└── index.ts      ← 統一 export 入口
```

**CSS 引入（`main.tsx`）：**
```ts
import './styles/global.css';  // 已含 tokens.css
```

**TypeScript 引入（圖表 / 內聯樣式）：**
```ts
import theme, { colors, chartColors } from '../styles';

// ECharts 例
option.series[0].lineStyle = { color: colors.up };
option.backgroundColor = colors.bg;
```

---

## 三、路由設計

```
/              → StockOverviewPage（台股總覽）
/plan          → PlanPage（投報計畫）
/assets        → AssetsPage（外幣 & 債券）
/report        → ReportPage（績效報告）
/settings      → SettingsPage（設定）
```

### SideNav 分組結構

```
LOGO
─────────────────
台股總覽              → /
─────────────────
外幣 & 債券           → /assets
─────────────────
資產規劃
  ├── 投報計畫        → /plan
  └── 績效報告        → /report
─────────────────
預留擴充（未來）
─────────────────
底部：設定            → /settings
```

---

## 四、各頁面元件結構

### 台股總覽頁（`/`）

```
StockOverviewPage
├── MarketIndicesRow           ← 8 個指數卡片
├── UnrealizedProfitSummary    ← 損益摘要列
└── HoldingsTable
    ├── SparkLineCell          ← 迷你走勢圖
    ├── ExpandableRow          ← inline K線 + 數據
    ├── TransactionHistoryModal（📋）
    └── AddTransactionModal（➕）
```

### 投報計畫頁（`/plan`）

```
PlanPage
└── Tabs [台股 | 債券 | 外幣 | 總覽彙總]
    └── Tab: 台股
        ├── PlanParamsForm     ← MARC 參數表單
        ├── MARCTable          ← 複利試算表
        ├── MARCSummaryCards   ← 20/30年摘要
        └── YearlyRecordsTable ← 年度結算
            └── YearlyRecordModal
```

### 外幣 & 債券頁（`/assets`）

```
AssetsPage
├── ForexSection
│   ├── ForexTable             ← RadioButton 匯率切換
│   └── AddForexModal
├── BondSection
│   ├── BondTable
│   └── BondModal（新增 / 編輯）
└── AssetsTotalFooter          ← 外幣 + 債券台幣合計
```

### 績效報告頁（`/report`）

```
ReportPage
├── SnapshotSummaryCards       ← 4 張摘要卡片
├── SnapshotControlBar         ← 日期範圍 / 快速選擇 / 操作按鈕
├── ReturnRateChart            ← ECharts LineChart（3 條線）
└── SnapshotTable              ← 明細表 + 編輯 Modal
```
---

## 五、共用元件規範

### 5.1 DataTable — 通用資料表格元件

> 所有頁面的 Table（庫存持股、關注清單、外幣清單、債券清單、快照明細等）**一律使用此元件**，禁止重新定義 table 樣式。

**位置：** `frontend/src/components/DataTable/`

```
DataTable/
├── DataTable.tsx    ← 元件本體（泛型，含排序 + 搜尋）
├── DataTable.css    ← 樣式（使用 styles/tokens.css 變數）
└── index.ts         ← re-export
```

#### Props API

```tsx
interface DataTableColumn<T extends object> {
  key:       keyof T;                       // 對應資料欄位
  label:     string;                        // 表頭顯示文字
  align?:    'left' | 'right' | 'center';   // 預設 left
  sortable?: boolean;                       // 是否可排序
  render?:   (row: T) => React.ReactNode;   // 自訂 cell 渲染（選填）
  width?:    string;                        // 固定欄寬（選填）
}

interface DataTableProps<T extends object> {
  title:              string;               // Panel 標題
  columns:            DataTableColumn<T>[]; // 欄位定義
  data:               T[];                  // 資料陣列
  rowKey:             keyof T;              // 每列唯一鍵（React key）
  onRowClick?:        (row: T) => void;     // 點擊列 callback
  searchPlaceholder?: string;               // 搜尋框 placeholder
  searchKeys?:        Array<keyof T>;       // 指定搜尋欄位；未填則搜尋全部
  headerActions?:     React.ReactNode;      // 右側自訂按鈕（如「+ 新增」）
  emptyText?:         string;               // 空資料文字
}
```

#### 功能說明

| 功能 | 行為 |
|------|------|
| **欄位排序** | 點擊表頭升冪 → 再點降冪 → 再點清除排序；數值欄位按數字排，文字欄位按 `zh-TW` locale |
| **排序指示** | 未排序：雙向箭頭（dim色）；升冪：上箭頭；降冪：下箭頭；排序中欄位標題轉 accent 色 |
| **搜尋** | 表頭右側放大鏡圖示 → 點擊展開搜尋框（max-width 動畫）→ 即時 keyword 篩選；ESC / 失焦且無字 → 收起 |
| **空狀態** | 無資料顯示 `emptyText`；有搜尋詞但無結果顯示「找不到「xxx」的相關資料」 |

#### 使用範例

```tsx
import DataTable, { DataTableColumn } from '../components/DataTable';

interface HoldingRow {
  code:      string;
  name:      string;
  price:     number;
  costAvg:   number;
  shares:    number;
  returnPct: number;
}

const columns: DataTableColumn<HoldingRow>[] = [
  { key: 'code',      label: '代號 / 名稱', render: row => (
      <><div className="stock-code">{row.code}</div>
        <div className="stock-name">{row.name}</div></>
  )},
  { key: 'price',     label: '即時報價', align: 'right', sortable: true,
    render: row => <span className="num-value">{row.price.toLocaleString()}</span> },
  { key: 'returnPct', label: '損益 %',   align: 'right', sortable: true,
    render: row => (
      <span className={`num-value ${row.returnPct >= 0 ? 'txt-up' : 'txt-down'}`}>
        {row.returnPct >= 0 ? '+' : ''}{row.returnPct.toFixed(2)}%
      </span>
    )},
];

<DataTable
  title="庫存持股"
  columns={columns}
  data={holdings}
  rowKey="code"
  onRowClick={row => openDetail(row.code)}
  searchKeys={['code', 'name']}
  headerActions={<button className="btn-ghost" onClick={openAddModal}>+ 新增</button>}
/>
```

---

## 六、開發環境

```bash
# 安裝
npm install

# 開發（Port 5173）
npm run dev

# 建置
npm run build

# 環境變數（.env）
VITE_API_BASE_URL=http://localhost:3001/api/v1
```
