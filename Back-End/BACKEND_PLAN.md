# 個人理財雲端系統 — 後端開發計畫

> 版本：1.0（2026-04-22）
> 技術棧：Node.js / Express.js / TypeScript / Firestore

---

## 一、技術架構

### 語言 / 框架
- **語言**：TypeScript
- **框架**：Express.js
- **架構**：薄 API 層（routes/ → controllers/ → models/），不含業務邏輯
- **設計原則**：後端設計原則請尊循 Skill/Backend-Node.md 設計指南

### 資料庫
- **主資料庫**：Google Cloud Firestore（NoSQL 文件型資料庫）
  - 免費額度：50,000 reads/天、20,000 writes/天、1 GiB 儲存
  - 個人使用永久免費，無需信用卡
- **開發環境**：Firebase Emulator Suite（本地模擬 Firestore，不需 Docker DB container）


### 主要套件

| 套件 | 用途 |
|------|------|
| `express` | Web 框架 |
| `cors` | CORS 支援 |
| `dotenv` | 環境變數 |
| `firebase-admin` | Firestore SDK |
| `node-cache` | In-memory Cache（TTL） |
| `axios` | 呼叫外部 API（Yahoo Finance、NDC） |
| `typescript` | TypeScript 編譯器 |
| `ts-node-dev` | 開發熱重載 |

### 快取策略（node-cache）

| 資料 | Cache Key | TTL |
|------|-----------|-----|
| 市場指數 | `market:indices` | 60s |
| 股票報價 | `stock:quote:{id}` | 60s |
| 股票基礎數據 | `stock:profile:{id}` | 300s |
| 即時匯率 | `market:forex-rates` | 300s |
| 全股清單 | `stocks:all-list` | 3600s |
| 景氣燈號 | `market:export-indicator` | 3600s |

### 統一 Response 格式
```typescript
{ success: true,  data: ... }   // 成功
{ success: false, error: "..." } // 失敗
```

### 外部 API 來源

| 資料 | 來源 |
|------|------|
| 台股即時 / 歷史股價 | Yahoo Finance API（`{id}.TW` / `{id}.TWO`） |
| 台股搜尋 | TWSE / TPEX 開放資料 API |
| 大盤指數 / 台指期 | Yahoo Finance（`^TWII`、`TWF=F`） |
| 美股指數 | Yahoo Finance（`^IXIC`、`^GSPC`、`^DJI`、`^SOX`） |
| 即時匯率 | Yahoo Finance（`{CODE}TWD=X`） |
| 台灣出口景氣燈號 | NDC 國發會 公開資料爬蟲 |

### 身分驗證
- **開發階段**：無驗證（本地端直接存取）
- **正式階段**：Google Cloud Identity-Aware Proxy（IAP）

### 部署
| 環境 | 方式 |
|------|------|
| 開發 | `npm run dev`（ts-node-dev，Port 3001） |
| 正式 | Google Cloud Run（Node.js Linux 容器） |

---

## 二、Firestore 資料結構設計

> Document ID 設計原則：有自然唯一鍵者直接用作 ID，其餘由 Firestore 自動產生。

### Collection: `settings`
Document ID 固定為 `main`
```
settings/main {
  cost_method: string   // 'preserve_method' | 'return_method'
  updated_at:  Timestamp
}
```

### Collection: `stocks`
Document ID = 股票代號
```
stocks/{stockId} {
  id:         string    // '2330'
  name:       string    // '台積電'
  market:     string    // 'TSE' | 'OTC'
  created_at: Timestamp
}
```

### Collection: `transactions`
Document ID = Firestore 自動產生
```
transactions/{autoId} {
  stock_id:        string
  type:            string    // 'buy' | 'sell'
  date:            Timestamp
  shares:          number    // 張數（可 0.5）
  price_per_share: number    // 元/股
  fee:             number
  note:            string
  created_at:      Timestamp
}
```
> 建議建立複合索引：`stock_id ASC + date ASC`

### Collection: `holdings`
Document ID = 股票代號（與 stocks 一對一）
```
holdings/{stockId} {
  stock_id:        string
  shares_held:     number
  avg_cost:        number
  total_cost:      number
  realized_profit: number
  cost_method:     string    // 計算當下使用的方法（紀錄用）
  updated_at:      Timestamp
}
```

### Collection: `investment_plans`
Document ID = asset_type
```
investment_plans/tw_stock {
  asset_type:         string    // 'tw_stock' | 'bond' | 'forex'
  annual_invest:      number
  r_base:             number    // e.g. 0.08
  pi_base:            number    // e.g. 0.02
  pi_shock:           number    // e.g. 0.00
  inflation_scenario: string    // 'low' | 'base' | 'high'
  k_risk:             number    // e.g. 1.00
  start_year:         number
  plan_years:         number    // 固定 30
  created_at:         Timestamp
  updated_at:         Timestamp
}
```
> MARC Model 預設值：`r_base=0.08`、`pi_base=0.02`、`pi_shock=0.00`、`inflation_scenario='base'`、`k_risk=1.00`

### Collection: `foreign_currencies`
Document ID = 幣別代碼
```
foreign_currencies/{code} {
  currency_code:   string    // 'USD' | 'JPY' | 'EUR' | 'CNY' | 'HKD' | 'GBP' | 'AUD' | 'SGD'
  amount:          number
  use_manual_rate: boolean
  manual_rate:     number    // 1 外幣 = N 台幣
  updated_at:      Timestamp
}
```

### Collection: `watchlist`
Document ID = 股票代號
```
watchlist/{stockId} {
  stock_id:     string    // '2330'
  target_price: number    // 元/股
  note:         string
  created_at:   Timestamp
  updated_at:   Timestamp
}
```
> 「判斷」欄由前端 ViewModel 依即時報價與目標價比較自動計算（即時報價 ≤ 目標價 → 買進；否則 → 觀望）

### Collection: `bonds`
Document ID = Firestore 自動產生
```
bonds/{autoId} {
  name:          string
  coupon_rate:   number    // e.g. 0.045 = 4.5%
  maturity_date: string    // 'YYYY-MM-DD'
  currency:      string    // 'USD' | 'TWD' | ...
  face_value:    number
  note:          string
  created_at:    Timestamp
  updated_at:    Timestamp
}
```

### Collection: `yearly_records`
Document ID = `{asset_type}_{year}`
```
yearly_records/tw_stock_2025 {
  asset_type:        string
  year:              number
  prev_year_total:   number
  amount_invested:   number
  stock_value:       number
  cash_balance:      number
  foreign_value_twd: number    // 外幣 + 債券換算台幣合計
  return_amount:     number
  return_rate:       number    // e.g. 0.1211
  settled_at:        Timestamp
  note:              string
  created_at:        Timestamp
}
```

### Collection: `daily_snapshots`
Document ID = 日期字串（`YYYY-MM-DD`）
```
daily_snapshots/2026-04-22 {
  date:              string
  total_invested:    number
  stock_value:       number
  cash_balance:      number
  forex_value:       number    // 外幣 + 債券換算台幣合計（快照當下即時匯率）
  unrealized_profit: number
  realized_profit:   number
  total_return:      number
  return_rate:       number    // e.g. 0.1371
  recorded_at:       Timestamp
  note:              string
}
```
> **記錄時機**：每日 14:00（台灣時間）由 Cloud Scheduler 觸發 `POST /snapshots/record`

### Firestore 免費額度估算

| 項目 | 免費額度/天 | 本專案預估 |
|------|-----------|----------|
| 讀取 | 50,000次 | < 500次 |
| 寫入 | 20,000次 | < 50次 |
| 儲存 | 1 GiB | < 1 MB |

---

## 三、API 設計

### Base URL
- 開發：`http://localhost:3001/api/v1`
- 正式：`https://api.yourapp.com/api/v1`

### 股票

| Method | Endpoint | 說明 | Cache |
|--------|----------|------|-------|
| GET | `/stocks/search?q=` | 搜尋股票（TWSE） | 全股清單 3600s |
| GET | `/stocks/:id/quote` | 即時報價 | 60s |
| GET | `/stocks/:id/history?days=90` | 歷史 K 線 | — |
| GET | `/stocks/:id/profile` | 股票基礎數據 | 300s |

### 市場指數

| Method | Endpoint | 說明 | Cache |
|--------|----------|------|-------|
| GET | `/market/indices` | 全部指數卡片 | 60s |
| GET | `/market/export-indicator` | 台灣出口景氣燈號 | 3600s |
| GET | `/market/forex-rates` | 主要幣別對台幣匯率 | 300s |

### 交易紀錄

| Method | Endpoint | 說明 |
|--------|----------|------|
| GET | `/transactions` | 所有紀錄（可加 `?stock_id=` 過濾） |
| GET | `/transactions/:id` | 單筆紀錄 |
| POST | `/transactions` | 新增 |
| PUT | `/transactions/:id` | 修改 |
| DELETE | `/transactions/:id` | 刪除 |

### 庫存

| Method | Endpoint | 說明 |
|--------|----------|------|
| GET | `/holdings` | 所有庫存（含即時股價注入） |
| GET | `/holdings/:stockId` | 單一庫存 |
| POST | `/holdings/recalculate` | 整批重算寫回（前端計算後送陣列） |

### 投報計畫

| Method | Endpoint | 說明 |
|--------|----------|------|
| GET | `/plan` | 取得計畫參數 |
| PUT | `/plan` | 更新計畫參數 |
| GET | `/plan/yearly-records` | 所有年度結算 |
| POST | `/plan/yearly-records` | 新增年度結算 |
| PUT | `/plan/yearly-records/:year` | 更新年度結算 |

### 使用者設定

| Method | Endpoint | 說明 |
|--------|----------|------|
| GET | `/settings` | 取得設定 |
| PUT | `/settings` | 更新設定（含 cost_method） |

### 外幣管理

| Method | Endpoint | 說明 |
|--------|----------|------|
| GET | `/foreign-currencies` | 所有外幣持倉（含即時匯率） |
| PUT | `/foreign-currencies/:code` | 新增或更新（upsert） |
| DELETE | `/foreign-currencies/:code` | 刪除 |

### 債券管理

| Method | Endpoint | 說明 |
|--------|----------|------|
| GET | `/bonds` | 所有債券（含台幣估值） |
| POST | `/bonds` | 新增 |
| PUT | `/bonds/:id` | 修改 |
| DELETE | `/bonds/:id` | 刪除 |

### 關注清單

| Method | Endpoint | 說明 |
|--------|----------|------|
| GET | `/watchlist` | 所有關注清單（含即時報價注入） |
| POST | `/watchlist` | 新增關注股票 |
| PUT | `/watchlist/:stockId` | 更新目標價 / 備註 |
| DELETE | `/watchlist/:stockId` | 移除關注 |

### 每日快照

| Method | Endpoint | 說明 |
|--------|----------|------|
| POST | `/snapshots/record` | 觸發當日快照計算並寫入（冪等） |
| GET | `/snapshots?from=&to=` | 依日期範圍查詢 |
| GET | `/snapshots/:date` | 單日快照 |
| PUT | `/snapshots/:date` | 修正活存 / 備註 |

**`POST /snapshots/record` 執行邏輯：**
1. 讀取 `holdings`（持股 + 成本）
2. 呼叫 Yahoo Finance 取得各股當日收盤價
3. 計算 `stock_value`、`unrealized_profit`、`total_return`、`return_rate`
4. 讀取 `foreign_currencies` + `bonds`，取得即時匯率，計算 `forex_value`（台幣合計）
5. 沿用前次快照的 `cash_balance`（若無則為 0）
6. 寫入 `daily_snapshots/{today}`（merge，可重複觸發不重複寫）

---

## 四、GCP 部署規劃

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist/ ./dist/
CMD ["node", "dist/index.js"]
```

| 服務 | 方式 |
|------|------|
| Cloud Run | `gcloud run deploy`，Region: asia-east1 |
| Firestore | 正式環境安全規則設定 |
| Secret Manager | `FIRESTORE_PROJECT_ID` / `GOOGLE_APPLICATION_CREDENTIALS` |
| IAP | 授權指定 Google 帳號，後端無需實作 JWT |
| Cloud Scheduler | 每日 UTC 06:00（台灣 14:00）觸發 `POST /api/v1/snapshots/record` |
