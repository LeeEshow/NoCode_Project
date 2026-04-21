# 個人理財雲端系統 — 開發計畫

> 最後更新：2026-04-21
> 狀態：規劃階段

---

## 一、專案概述

建立一套個人理財管理的雲端 Web 系統，主要功能為台股投資組合追蹤、買賣紀錄管理、即時股價整合，以及長期投報計畫試算。

---

## 二、技術架構

### 前端
- **框架**：React.js (TypeScript)
- **架構模式**：MVVM（ViewModel 層透過 Custom Hook 實作）
- **UI 元件庫**：React Bootstrap 5（react-bootstrap）
- **圖表庫**：lightweight-charts（K線、MA線、走勢迷你圖）、Recharts（複利走勢）
- **狀態管理**：Zustand
- **HTTP Client**：Axios

### 後端
- **執行環境**：Node.js
- **框架**：Express.js (TypeScript)
- **架構**：RESTful API
- **DB SDK**：Firebase Admin SDK（取代 ORM）
- **快取**：node-cache（In-memory TTL cache，取代 Redis，個人規模足夠）
- **排程**：node-cron（定時預熱股價 cache）

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
  - Backend + Frontend 本地直接啟動（`npm run dev`）
  - Firestore 使用 Firebase Emulator Suite 本地模擬（不需 Docker DB）
  - 若需容器化：Docker Compose 只需 Backend + Frontend 兩個服務
- **正式階段**：Google Cloud Platform（Cloud Run + Firestore + IAP）
  - 無需 Cloud SQL、無需 Memorystore，大幅降低維運成本

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

> **Cache 策略**：所有指數資料存入 Redis，TTL 60秒，避免頻繁呼叫外部 API。

---

## 六、API 設計

### Base URL
- 開發：`http://localhost:3001/api/v1`
- 正式：`https://api.yourapp.com/api/v1`

### 股票相關
| Method | Endpoint | 說明 |
|--------|----------|------|
| GET | `/stocks/search?q={keyword}` | 搜尋股票（串接 TWSE） |
| GET | `/stocks/{id}/quote` | 取得即時報價（Yahoo Finance，Redis cache） |
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

### Phase 0：環境建置
- [ ] P0-01：建立 Monorepo 結構（`/frontend`、`/backend`）
- [ ] P0-02：Backend — 初始化 Express + TypeScript
- [ ] P0-03：Backend — 安裝 firebase-admin SDK + node-cache
- [ ] P0-04：Firebase 專案建立 + Firestore 啟用 + Service Account 金鑰下載
- [ ] P0-05：Firebase Emulator Suite 安裝與設定（本地 Firestore 模擬）
- [ ] P0-06：Frontend — 初始化 React + TypeScript + React Bootstrap
- [ ] P0-07：ESLint / Prettier 統一設定
- [ ] P0-08：Yahoo Finance API 連線測試
- [ ] P0-09：（可選）Docker Compose 設定 — 僅 Backend + Frontend 兩服務

### Phase 1：後端核心 API
- [ ] P1-01：Yahoo Finance 整合層（統一封裝呼叫 + Redis cache TTL 60s）
- [ ] P1-02：指數 API（台股大盤/TWSE、台指期、NASDAQ、S&P500、道瓊、SOX）
- [ ] P1-03：台灣出口景氣燈號爬蟲（NDC 資料）
- [ ] P1-04：股票搜尋 API（串接 TWSE 開放資料）
- [ ] P1-05：即時報價 API（Yahoo Finance，Redis cache）
- [ ] P1-06：歷史 K 線 API（90天，Yahoo Finance）
- [ ] P1-07：股票基礎數據 API（Yahoo Finance fundamentals）
- [ ] P1-08：交易紀錄 CRUD API
- [ ] P1-09：庫存計算引擎（方法一＋方法二）
- [ ] P1-10：庫存查詢 API（含即時股價整合）
- [ ] P1-11：投報計畫 CRUD + 複利試算邏輯
- [ ] P1-12：年度結算 CRUD API
- [ ] P1-13：使用者設定 API + 切換算法重算

### Phase 2：前端 — Layout 與 Dashboard
- [ ] P2-01：React Router 設定
- [ ] P2-02：左側 NavBar 元件（固定，兩個主要頁面連結）
- [ ] P2-03：指數卡片元件（8張，Bootstrap Card）
- [ ] P2-04：未實現損益摘要列
- [ ] P2-05：持股 Table 元件（含 90天迷你走勢圖）
- [ ] P2-06：Table 展開 — K線 + MA線 + 成交量（inline expand）
- [ ] P2-07：Table 展開 — 股票基礎數據
- [ ] P2-08：歷史買賣紀錄 Modal（📋 圖示觸發，含編輯/刪除）
- [ ] P2-09：新增買賣紀錄 Modal（➕ 圖示觸發）

### Phase 3：前端 — 資產計畫頁
- [ ] P3-01：計畫參數設定區（可編輯）
- [ ] P3-02：複利試算表（逐年展開，里程碑標記）
- [ ] P3-03：20年/30年摘要卡片
- [ ] P3-04：年度實際結算表（可點擊編輯）
- [ ] P3-05：年度結算新增 Modal

### Phase 4：整合測試與優化
- [ ] P4-01：API 整合測試（iTick cache 驗證）
- [ ] P4-02：前後端整合測試
- [ ] P4-03：RWD 響應式設計調整
- [ ] P4-04：效能優化（Redis TTL 調整）

### Phase 5：GCP 部署
- [ ] P5-01：Cloud Run — Backend 部署
- [ ] P5-02：Firebase Hosting — Frontend 部署
- [ ] P5-03：Firestore 正式環境安全規則設定
- [ ] P5-04：環境變數與 Secret Manager 設定
- [ ] P5-05：Identity-Aware Proxy（IAP）設定與授權帳號
- [ ] P5-06：Domain 設定與 HTTPS

---

## 九、工作日誌

### 2026-04-21 — Session 001
**完成事項**：
- 確認系統功能範圍與需求
- 確認技術架構：React + Bootstrap + Node.js + MySQL
- 確認股票市場：台灣股市（台股）
- 確認持有單位：張（1張 = 1000股）
- 確認成本計算：加權平均，賣出提供「獲利歸還法」與「成本保留法」供 User 自選
- 確認 K 線展開互動設計（點擊列 inline 展開）
- 確認交易紀錄以 Offcanvas Drawer 呈現
- 確認底部快速買賣輸入區設計
- 確認指數卡片清單（8張）
- 調查 iTick API：支援台股/台指期/美股指數，REST+WebSocket，免費5次/分鐘
- 更新開發計畫文件（v2）

**Session 003 修訂**：
- 資料庫從 MySQL 8.0 改為 **Google Cloud Firestore**（NoSQL，免費額度足夠個人使用）
- 移除 Redis，改用 node-cache（In-memory TTL）取代
- 移除 Prisma ORM，改用 Firebase Admin SDK
- 開發環境改用 Firebase Emulator Suite 模擬 Firestore，不需 Docker DB container
- 部署架構簡化：Cloud Run + Firestore（移除 Cloud SQL + Memorystore）
- 完整重新設計 Firestore Collection/Document 結構（含多資產擴充設計）

**Session 002 修訂**：
- 股價來源改回 Yahoo Finance + TWSE（iTick 免費方案每分鐘僅5次，不敷使用）
- 身分驗證改用 GCP IAP，後端不實作登入
- 買賣輸入 UI 改為圖示按鈕 → Modal
- 歷史買賣紀錄改為圖示按鈕 → Modal
- NavBar 採分組結構，預留債券/外幣/其他資產擴充群組
- 資產計畫頁改為 Tab 架構（現有台股 Tab + 預留 Bond/Forex + 總覽彙總）
- DB Schema：investment_plan / yearly_records 加入 asset_type 欄位支援多資產

**待討論 / 下次繼續**：
- 確認電腦是否已安裝 Docker
- 開始 Phase 0 環境建置

---
