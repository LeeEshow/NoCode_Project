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
- **圖表庫**：lightweight-charts（K線、MA線、走勢迷你圖）、Recharts（複利走勢）
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

**待UI/UX討論**

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
├── ReturnRateChart            ← Recharts LineChart（3 條線）
└── SnapshotTable              ← 明細表 + 編輯 Modal
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
