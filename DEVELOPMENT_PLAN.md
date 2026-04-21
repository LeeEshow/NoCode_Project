# 個人理財雲端系統 — 開發計畫

> 最後更新：2026-04-21
> 狀態：架構重建中

---

## 一、專案概述

建立一套個人理財管理的雲端 Web 系統，主要功能為台股投資組合追蹤、買賣紀錄管理、即時股價整合，以及長期投報計畫試算。

---

## 二、技術架構

### 前端
- **框架**：React.js (TypeScript)
- **架構模式**：MVVM（Model 層負責 API 呼叫 + 反序列化，ViewModel 層透過 Custom Hook 實作）
- **資料夾結構**：`api/` / `types/` / `models/` / `viewmodels/` / `views/`
- **UI 元件庫**：React Bootstrap 5（react-bootstrap）
- **圖表庫**：lightweight-charts（K線、MA線、走勢迷你圖）、Recharts（複利走勢）
- **狀態管理**：Zustand
- **HTTP Client**：Axios

### 後端
- **語言 / 框架**：Node.js / Express.js (TypeScript)
- **架構**：薄 API 層（routes/ → controllers/ → models/），不含業務邏輯
- **設計原則**：Model 自行存取 Firestore + 反序列化，Controller 直接呼叫 Model，所有計算在前端完成
- **資料夾結構**：`routes/` / `controllers/` / `models/` / `middleware/` / `global/`
- **DB SDK**：Firebase Admin SDK
- **快取**：node-cache（In-memory TTL 60s，用於市場指數 API）

### 資料庫
- **主資料庫**：Google Cloud Firestore（NoSQL 文件型資料庫）
  - 免費額度：50,000 reads/天、20,000 writes/天、1 GiB 儲存
  - 個人使用永久免費，無需信用卡
- **開發環境**：Firebase Emulator Suite（本地模擬 Firestore，不需 Docker DB container）

### 外部 API
- **台股即時/歷史股價**：Yahoo Finance API（非官方相容端點，免費無限制）
- **台股基本資料 / 搜尋**：TWSE 開放資料 API
- **加權指數 / 台指期**：TWSE 大盤指數 API + Yahoo Finance
- **美股指數**（NASDAQ、S&P500、道瓊、費城半導體）：Yahoo Finance
- **台灣出口景氣燈號**：國家發展委員會（NDC）公開資料爬蟲

### 身分驗證
- **開發階段**：無驗證（本地端直接存取）
- **正式階段**：Google Cloud **Identity-Aware Proxy（IAP）**
  - 部署至 GCP 後由 IAP 擋在前層，僅允許授權 Google 帳號存取
  - 後端無需實作登入/JWT，大幅簡化

### 部署
- **開發階段**：
  - Backend：`npm run dev`（ts-node-dev 熱重載，`http://localhost:3001`）
  - Frontend：`npm run dev`（Vite，`http://localhost:5173`）
  - Firestore：Firebase Emulator Suite 本地模擬（`firebase emulators:start`）
- **正式階段**：
  - Backend：**Google Cloud Run**（Node.js Linux 容器，完整支援）
  - Frontend：Firebase Hosting
  - DB：Google Cloud Firestore + IAP 身分驗證

---

## 三、Firestore 資料結構設計

Firestore 採 Collection / Document 階層結構，以下為各集合定義。

> **Document ID 設計原則**：有自然唯一鍵者直接用作 ID（如股票代號、asset_type、asset_type_year），其餘由 Firestore 自動產生。

---

### Collection: `settings`
單一 Document，ID 固定為 `main`

```
settings/
  main {
    cost_method:  string   // 'preserve_method' | 'return_method'
    updated_at:   Timestamp
  }
```
> - `preserve_method`（預設）= 成本保留法
> - `return_method` = 獲利歸還法

---

### Collection: `stocks`
Document ID = 股票代號（e.g. `2330`）

```
stocks/
  {stockId} {
    id:         string     // '2330'
    name:       string     // '台積電'
    market:     string     // 'TSE' | 'OTC'
    created_at: Timestamp
  }
```

---

### Collection: `transactions`
Document ID = Firestore 自動產生

```
transactions/
  {autoId} {
    stock_id:        string     // '2330'
    type:            string     // 'buy' | 'sell'
    date:            Timestamp
    shares:          number     // 張數（可 0.5）
    price_per_share: number     // 元/股
    fee:             number     // 手續費
    note:            string
    created_at:      Timestamp
  }
```
> 查詢時常用 `where('stock_id', '==', id)` + `orderBy('date')`，建議建立複合索引。

---

### Collection: `holdings`
Document ID = 股票代號（e.g. `2330`），與 stocks 一對一

```
holdings/
  {stockId} {
    stock_id:        string
    shares_held:     number     // 持有張數
    avg_cost:        number     // 均價（元/股）
    total_cost:      number     // 總投入成本（元）
    realized_profit: number     // 已實現損益（元）
    cost_method:     string     // 計算當下使用的方法（紀錄用）
    updated_at:      Timestamp
  }
```

---

### Collection: `investment_plans`
Document ID = asset_type（e.g. `tw_stock`）

```
investment_plans/
  tw_stock {                   // 台股計畫（現階段）
    asset_type:   string       // 'tw_stock' | 'bond' | 'forex'（預留）
    annual_invest: number      // 每年投入金額
    yield_rate:   number       // 預期殖利率（e.g. 0.10）
    start_year:   number       // 起始年份
    plan_years:   number       // 計畫年數（預設 30）
    created_at:   Timestamp
    updated_at:   Timestamp
  }
  bond { ... }                 // 預留：債券計畫
  forex { ... }                // 預留：外幣計畫
```

---

### Collection: `yearly_records`
Document ID = `{asset_type}_{year}`（e.g. `tw_stock_2026`）

```
yearly_records/
  tw_stock_2025 {
    asset_type:      string    // 'tw_stock' | 'bond' | 'forex'
    year:            number    // 2025
    prev_year_total: number    // 前年結算總資產
    amount_invested: number    // 本年已投入
    stock_value:     number    // 資產現值
    cash_balance:    number    // 活存
    return_amount:   number    // 報酬金額
    return_rate:     number    // 報酬率（e.g. 0.1211）
    settled_at:      Timestamp
    note:            string
    created_at:      Timestamp
  }
  tw_stock_2026 { ... }
```

---

### Firestore 免費額度說明

| 項目 | 免費額度/天 | 本專案預估用量 |
|------|-----------|-------------|
| 讀取次數 | 50,000次 | < 500次（個人使用） |
| 寫入次數 | 20,000次 | < 50次（交易紀錄） |
| 刪除次數 | 20,000次 | 極少 |
| 儲存空間 | 1 GiB | < 1 MB |

> 個人使用場景永久免費，完全不需升級付費方案。

---

## 四、成本計算邏輯規格

### 買入時（兩種方法相同）
```
新均價 = (原總成本 + 本次買入金額) ÷ (原持有股數 + 本次買入股數)
本次買入金額 = 股數 × 單價 + 手續費
```

### 賣出時

**方法一：獲利歸還法**
```
剩餘總成本 = 原總成本 - 本次賣出收益
本次賣出收益 = 股數 × 成交價 - 手續費
剩餘均價 = 剩餘總成本 ÷ 剩餘股數
已實現損益（獨立記錄）= 賣出收益 - 賣出成本比例
```

**方法二：成本保留法（預設）**
```
剩餘總成本 = 原總成本（不變）
剩餘均價 = 原總成本 ÷ 剩餘股數
已實現損益 = 本次賣出收益（整筆計入）
```

### 範例驗算（00894）
- 持有：2張，均價 31.7元，總成本 63,400元
- 賣出：0.5張，成交價 40.5元，收益 20,250元
- 方法一：剩餘均價 = (63,400 - 20,250) ÷ 1,500 = **28.77元**
- 方法二：剩餘均價 = 63,400 ÷ 1,500 = **42.27元**

---

## 五、指數資訊規格

首頁 TOP 區域以小方塊卡片呈現，來源與說明如下：

| 卡片名稱 | 資料來源 | 顯示欄位 |
|---------|---------|---------|
| 台股大盤（加權指數） | TWSE API + Yahoo Finance | 即時指數、漲跌、漲跌幅 |
| 台指期（盤中） | Yahoo Finance（^TWII future） | 期貨指數、漲跌 |
| 台指期（盤後/夜盤） | Yahoo Finance | 夜盤指數、漲跌 |
| NASDAQ | Yahoo Finance（^IXIC） | 即時指數、漲跌幅 |
| S&P 500 | Yahoo Finance（^GSPC） | 即時指數、漲跌幅 |
| 道瓊工業指數 | Yahoo Finance（^DJI） | 即時指數、漲跌幅 |
| 費城半導體指數（SOX） | Yahoo Finance（^SOX） | 即時指數、漲跌幅 |
| 台灣出口景氣燈號 | NDC 國發會 公開資料爬蟲 | 最新月份、燈號顏色、景氣分數 |

> **Cache 策略**：市場指數資料使用 node-cache（In-memory TTL），指數 60秒、景氣燈號 3600秒，避免頻繁呼叫外部 API。

---

## 六、API 設計

### Base URL
- 開發：`http://localhost:3001/api/v1`
- 正式：`https://api.yourapp.com/api/v1`

### 股票相關
| Method | Endpoint | 說明 |
|--------|----------|------|
| GET | `/stocks/search?q={keyword}` | 搜尋股票（串接 TWSE） |
| GET | `/stocks/{id}/quote` | 取得即時報價（Yahoo Finance，node-cache） |
| GET | `/stocks/{id}/history?days=90` | 取得歷史K線資料（Yahoo Finance） |
| GET | `/stocks/{id}/profile` | 取得股票基礎資料 |

### 市場指數
| Method | Endpoint | 說明 |
|--------|----------|------|
| GET | `/market/indices` | 取得所有指數卡片資料（含台股、台指期、美股、SOX） |
| GET | `/market/export-indicator` | 取得台灣出口景氣燈號（最新月） |

### 交易紀錄
| Method | Endpoint | 說明 |
|--------|----------|------|
| GET | `/transactions` | 取得所有交易紀錄 |
| GET | `/transactions?stock_id={id}` | 依股票篩選 |
| POST | `/transactions` | 新增交易 |
| PUT | `/transactions/{id}` | 修改交易 |
| DELETE | `/transactions/{id}` | 刪除交易 |

### 庫存
| Method | Endpoint | 說明 |
|--------|----------|------|
| GET | `/holdings` | 取得所有庫存（含即時股價） |
| GET | `/holdings/{stock_id}` | 取得單一股票庫存 |
| POST | `/holdings/recalculate` | 重新計算所有庫存（切換算法時觸發） |

### 投報計畫
| Method | Endpoint | 說明 |
|--------|----------|------|
| GET | `/plan` | 取得投報計畫參數與試算結果 |
| PUT | `/plan` | 更新投報計畫參數 |
| GET | `/plan/yearly-records` | 取得所有年度實際結算 |
| POST | `/plan/yearly-records` | 新增年度結算 |
| PUT | `/plan/yearly-records/{year}` | 更新年度結算 |

### 使用者設定
| Method | Endpoint | 說明 |
|--------|----------|------|
| GET | `/settings` | 取得設定 |
| PUT | `/settings` | 更新設定（含 cost_method） |

---

## 七、前端頁面規格

### 整體 Layout
```
┌─────────┬──────────────────────────────────────┐
│  LOGO   │                                      │
│─────────│         主要內容區域                  │
│ 📈 台股  │                                      │
│ 📊 資產  │                                      │
│─────────│                                      │
│ ＋ 待擴充│                                      │
│  （預留）│                                      │
│─────────│                                      │
│ ⚙ 設定  │                                      │
└─────────┴──────────────────────────────────────┘
```
- 左側 NavBar 固定，寬度 ~220px
- 使用 React Bootstrap `Container-fluid` + `Row` + `Col` 實作
- NavBar 採**分組結構**設計，各資產類別為獨立群組，方便日後新增：

```
群組一：台灣市場（現階段）
  └─ 台股總覽

群組二：資產規劃
  └─ 資產計畫

群組三：預留擴充（未來）
  └─ 債券市場（Bond）     ← 待新增
  └─ 外幣/外匯資產        ← 待新增
  └─ 其他資產類別         ← 待新增

底部固定：
  └─ 設定
```
> **擴充原則**：新資產類別只需新增 NavBar 群組項目 + 對應頁面路由，不影響現有模組。

---

### 7.1 台股總覽（`/`）

#### TOP 區域 — 指數卡片
```
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ 台股大盤  │ │ 台指期盤中│ │ 台指期夜盤│ │  NASDAQ  │
│ 36,958   │ │ 37,621   │ │  37,510  │ │ 17,920   │
│ +154 +0.4%│ │ +120 +0.3%│ │ -50 -0.1%│ │ +120 +0.7%│
└──────────┘ └──────────┘ └──────────┘ └──────────┘
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│  S&P500  │ │  道瓊工業  │ │  費城半導體│ │ 出口景氣燈號│
│  5,220   │ │ 38,920   │ │  3,860   │ │  🟡 黃燈  │
│ +30 +0.6%│ │ +210 +0.5%│ │ +80 +2.1%│ │ 2026-03  │
└──────────┘ └──────────┘ └──────────┘ └──────────┘
```

#### 中間區域 — 未實現損益摘要列
- 總未實現損益金額、報酬率、當日變化

#### 主要 Table — 庫存股
| 欄位 | 說明 |
|------|------|
| 代號 | 股票代號（可點擊） |
| 名稱 | 股票名稱 |
| 即時報價 | 元/股（紅漲綠跌） |
| 漲跌 | 數值 + % |
| 走勢(90天) | 迷你折線圖 |
| 成本(均價) | 元/股 |
| 持有(張) | 張數 |
| 成長率 | %（紅漲綠跌） |
| 操作 | 交易紀錄按鈕 |

**Table 欄位（含操作圖示）：**

| 代號 | 名稱 | 即時報價 | 漲跌 | 走勢(90天) | 成本 | 持有(張) | 成長率 | 操作 |
|------|------|---------|------|-----------|------|---------|--------|------|
| 2330 | 台積電 | 2,025 | +5 +0.25% | ～圖～ | 1,886 | 0.03 | +7.37% | 📋 ➕ |

操作欄圖示：
- `📋`（或列表 icon）→ 點擊開啟**歷史買賣紀錄 Modal**
- `➕`（或新增 icon）→ 點擊開啟**新增買賣紀錄 Modal**

**Table 互動行為：**

1. **點擊股票列（代號或名稱欄）** → 在該列下方 inline 展開股票詳情：
   - K 線圖（日線，含 MA5/MA20/MA60）
   - 成交量長條圖
   - 股票基礎數據（本益比、殖利率、52週高/低、市值）
   - 再次點擊同列 → 收合

2. **點擊 `📋` 歷史紀錄圖示** → 彈出 Modal：
   - 顯示該股票完整歷史買賣清單
   - 每筆紀錄可編輯 / 刪除

3. **點擊 `➕` 新增圖示** → 彈出 Modal：
   - 欄位：買/賣、張數、單價、日期、手續費、備註
   - 送出後自動重算庫存並更新 Table

---

### 7.2 資產計畫（`/plan`）

> **擴充設計原則**：資產計畫以「資產類別 Tab」架構設計，目前只有「台股」Tab，未來可直接新增「債券」、「外幣」等 Tab，各 Tab 擁有獨立的計畫參數與試算表，底部提供**總資產整合彙總**。

#### Tab 結構
```
[ 台股 ]  [ 債券（預留） ]  [ 外幣（預留） ]  [ 總覽彙總 ]
```

#### 各資產 Tab 內部佈局（以台股 Tab 為例）

**左側 — 計畫參數**
- 每年投入金額（可編輯）
- 預期殖利率 % （可編輯）
- 起始年份
- 資產類別標籤（顯示用，未來各 Tab 有各自設定）

**中間 — 複利試算表（對應截圖左側大表）**
| 欄位 | 說明 |
|------|------|
| 年次 | 第 N 年 |
| 投資資本 | 累積投入本金 |
| 再投入 | 當年新投入 |
| 利息 | 當年利息收益 |
| 總資產 | 累積總資產 |
- 第10年、第15年、第20年、第30年高亮標記
- 顯示 20年/30年 總資產摘要卡片

**右側 — 年度實際結算（對應截圖右側小表）**
| 欄位 | 說明 |
|------|------|
| 年分 | 西元年 |
| 前年結算 | 前一年總資產 |
| 已投入 | 本年累計投入 |
| 股票現值 | 當前持股市值 |
| 活存 | 現金存款 |
| 報酬率 | 本年報酬率 |
| 結算時間 | 結算日期 |
- 可點擊行進行編輯
- 新增年度結算按鈕

#### 「總覽彙總」Tab（預留）
- 各資產類別的總資產並排比較
- 整體資產配置圓餅圖
- 所有類別合計總資產與報酬率

---

## 八、開發任務清單

> ⚠️ **架構重建注意**：前後端資料夾已於 Session 006 刪除重建，所有程式碼相關項目重置為未完成。
> Firebase 雲端資源（P0-05）與本地工具安裝（P0-06）不受影響，維持已完成狀態。

### Phase 0：環境建置

#### 後端初始化
- [ ] P0-01：建立後端專案（`/backend`）— Express + TypeScript 初始化（`tsconfig.json` / `package.json`）
- [ ] P0-02：後端 — 安裝套件（`express` / `cors` / `dotenv` / `firebase-admin` / `node-cache` / `axios` / `typescript` / `ts-node-dev`）
- [ ] P0-03：後端 — 建立資料夾結構（`routes/` / `controllers/` / `models/` / `middleware/` / `global/`）
- [ ] P0-04：後端 — 建立基礎骨架（`index.ts` / `global/firebase.ts` / `global/cache.ts` / `global/apiResponse.ts` / `middleware/errorHandler.ts`）

#### Firebase（雲端資源 & 本地工具，不受程式碼刪除影響）
- [x] P0-05：Firebase 專案建立 + Firestore 啟用 + Service Account 金鑰下載
- [x] P0-06：Firebase Emulator Suite 安裝與設定（本地 Firestore 模擬）

#### 前端初始化
- [ ] P0-07：建立前端專案（`/frontend`）— Vite + React + TypeScript 初始化
- [ ] P0-08：前端 — 安裝套件（`react-bootstrap` / `axios` / `zustand` / `react-router-dom` / `lightweight-charts` / `recharts`）
- [ ] P0-09：前端 — 建立資料夾結構（`api/` / `types/` / `models/` / `viewmodels/` / `views/`）

#### 共用設定
- [ ] P0-10：前後端 ESLint + Prettier 統一設定
- [ ] P0-11：Yahoo Finance API 連線測試
- [ ] P0-12：（可選）Docker Compose 設定 — 僅 Backend + Frontend 兩服務

---

### Phase 1：後端核心 API
> 後端只負責資料存取與外部 API 代理，**不含任何計算邏輯**

#### 市場資料（外部 API 代理 + node-cache）
- [ ] P1-01：Yahoo Finance 工具函式整合（axios 封裝，node-cache TTL 60s）
- [ ] P1-02：`GET /market/indices` — 台股/台指期/NASDAQ/S&P500/道瓊/SOX 指數
- [ ] P1-03：`GET /market/export-indicator` — 台灣出口景氣燈號（NDC 爬蟲，node-cache TTL 3600s）
- [ ] P1-04：`GET /stocks/search?q=` — 股票搜尋（TWSE 開放資料）
- [ ] P1-05：`GET /stocks/:id/quote` — 即時報價（Yahoo Finance，node-cache TTL 60s）
- [ ] P1-06：`GET /stocks/:id/history?days=90` — 歷史 K 線（Yahoo Finance）
- [ ] P1-07：`GET /stocks/:id/profile` — 股票基礎數據

#### Firestore CRUD（Model 自行存取，Controller 直接呼叫）
- [ ] P1-08：交易紀錄 CRUD — `GET/POST/PUT/DELETE /transactions`
- [ ] P1-09：`GET /holdings` — 庫存查詢（Firestore 讀取 + 即時報價注入後回傳）
- [ ] P1-10：`POST /holdings/recalculate` — 庫存整批重算觸發（由前端計算後寫回）
- [ ] P1-11：投報計畫 CRUD — `GET/PUT /plan`
- [ ] P1-12：年度結算 CRUD — `GET/POST/PUT /plan/yearly-records`
- [ ] P1-13：使用者設定 CRUD — `GET/PUT /settings`

> **前端負責的計算（後端不處理）**
> - 庫存均價、未實現損益（成本保留法 / 獲利歸還法）
> - 複利試算、里程碑計算
> - 年度報酬率計算
> - 所有 ViewModel 內的業務邏輯

---

### Phase 2：前端 — Layout 與 Dashboard

#### 基礎骨架
- [ ] P2-01：`api/axios.ts` — Axios 實例 + 攔截器（baseURL 從 `.env` 讀取）
- [ ] P2-02：`types/` — 所有 DTO 與 Domain 型別定義（holding / transaction / market / plan / settings）
- [ ] P2-03：`App.tsx` — React Router 設定（BrowserRouter + Outlet 架構）
- [ ] P2-04：`views/layout/SideNav.tsx` — 左側 NavBar（固定，分組結構，預留擴充）
- [ ] P2-05：`views/layout/MainLayout.tsx` — Outlet 容器
- [ ] P2-06：`views/pages/` — 三頁骨架（StockOverviewPage / PlanPage / SettingsPage）

#### 台股總覽頁（`/`）— 市場指數區
- [ ] P2-07：`models/marketModel.ts` — 市場指數 API 呼叫 + 反序列化
- [ ] P2-08：`viewmodels/useMarketViewModel.ts` — 指數狀態管理
- [ ] P2-09：指數卡片元件（8張，Bootstrap Card，含漲跌顏色紅/綠）

#### 台股總覽頁（`/`）— 庫存 Table 區
- [ ] P2-10：`models/holdingModel.ts` — 庫存 API 呼叫 + 反序列化 + 衍生欄位（未實現損益 / 成長率 / isUp）
- [ ] P2-11：`viewmodels/useHoldingsViewModel.ts` — 庫存狀態管理 + 彙總計算（總損益 / 整體報酬率）
- [ ] P2-12：未實現損益摘要列（總損益金額 / 報酬率 / 當日變化）
- [ ] P2-13：持股 Table 元件（欄位定義、漲跌顏色、操作圖示欄）
- [ ] P2-14：持股 Table — 90天迷你走勢圖（lightweight-charts SparkLine）
- [ ] P2-15：持股 Table — inline 展開 K線 + MA5/MA20/MA60 + 成交量
- [ ] P2-16：持股 Table — inline 展開 股票基礎數據（本益比 / 殖利率 / 52週高低 / 市值）

#### 台股總覽頁（`/`）— 交易 Modal
- [ ] P2-17：`models/transactionModel.ts` — 交易紀錄 API 呼叫 + 反序列化
- [ ] P2-18：`viewmodels/useTransactionsViewModel.ts` — 交易狀態管理
- [ ] P2-19：歷史買賣紀錄 Modal（📋 圖示觸發，含逐筆編輯 / 刪除）
- [ ] P2-20：新增買賣紀錄 Modal（➕ 圖示觸發，含成本計算後寫回 holdings）

---

### Phase 3：前端 — 資產計畫頁（`/plan`）
- [ ] P3-01：`models/planModel.ts` — 計畫 API 呼叫 + 反序列化 + `buildCompoundRows()` 複利試算
- [ ] P3-02：`viewmodels/usePlanViewModel.ts` — 計畫狀態管理 + 試算結果聚合
- [ ] P3-03：計畫參數設定區（每年投入 / 殖利率 / 起始年份，可編輯表單）
- [ ] P3-04：複利試算表（逐年展開，第 10/15/20/30 年里程碑高亮標記）
- [ ] P3-05：20年/30年摘要卡片
- [ ] P3-06：年度實際結算表（可點擊列行內編輯）
- [ ] P3-07：年度結算新增 Modal

---

### Phase 4：整合測試與優化
- [ ] P4-01：前後端整合測試（API 連線 + Firestore Emulator 驗證）
- [ ] P4-02：node-cache 行為驗證（市場指數 TTL 60s / 景氣燈號 TTL 3600s）
- [ ] P4-03：RWD 響應式設計調整（Bootstrap 斷點測試）
- [ ] P4-04：效能優化（API 回應時間量測、node-cache 命中率）

---

### Phase 5：GCP 部署
- [ ] P5-01：Cloud Run — Backend 容器化部署（`Dockerfile` 建置 + `gcloud run deploy`）
- [ ] P5-02：Firebase Hosting — Frontend 部署（`npm run build` + `firebase deploy`）
- [ ] P5-03：Firestore 正式環境安全規則設定
- [ ] P5-04：環境變數與 Secret Manager 設定（`FIRESTORE_PROJECT_ID` / `GOOGLE_APPLICATION_CREDENTIALS`）
- [ ] P5-05：Identity-Aware Proxy（IAP）設定與授權 Google 帳號
- [ ] P5-06：Domain 設定與 HTTPS

---
