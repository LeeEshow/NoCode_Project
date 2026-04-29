# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案結構

```
Back-End/
├── backend/          # Node.js + TypeScript（Express 5）主後端
└── shioaji-service/  # Python + FastAPI 微服務（Shioaji SDK 包裝）
```

---

## backend/ — Node.js 主後端

### 常用指令

```bash
cd backend

npm run dev     # 開發模式（ts-node-dev 熱重載）
npm run build   # 編譯 TypeScript → dist/
npm start       # 正式模式（需先 build）
npm run lint    # ESLint 檢查
npm run format  # Prettier 格式化
```

### 架構層次

```
Routes (src/routes/)
  → Controllers (src/controllers/)
    → Models (src/models/)
      → Firestore (src/global/firebase.ts)
      → Shioaji 微服務 (src/global/shioajiClient.ts)
      → Yahoo Finance (src/global/yahooFinance.ts)
```

### API 結構（前綴 `/api/v1`）

| 路由 | 功能 |
|------|------|
| `/holdings` | 持股組合（GET all/by id、PUT reorder、POST recalculate） |
| `/transactions` | 交易紀錄（CRUD，支援 `?stock_id=` 篩選） |
| `/stocks` | 搜尋、即時報價、歷史日K、基本面、三大法人籌碼 |
| `/market` | 大盤指數、匯率（8 幣別）、台灣景氣燈號 |
| `/plan` | 投資計畫（`/plan/config`）與年度結算（`/plan/yearly-records`） |
| `/settings` | 成本計算方式（FIFO / 加權平均） |
| `/foreign-assets` | 外幣資產（活存／定存／債券） |
| `/snapshots` | 每日快照（`/snapshots/record` 後端自動計算） |
| `/watchlist` | 自選股（含目標價、買進/觀望判斷、排序） |
| `/preferences` | 使用者偏好（圖表顯示控制、zoomLock） |
| `/bonds` | **@deprecated** → 已由 `/foreign-assets` 取代 |
| `/foreign-currencies` | **@deprecated** → 已由 `/foreign-assets` 取代 |

### 回應格式

統一由 `src/global/apiResponse.ts` 處理：
- 成功：`{ success: true, data: ... }`
- 失敗：`{ success: false, error: "訊息" }`

錯誤一律 `throw new AppError(statusCode, message)`，由 `src/middleware/errorHandler.ts` 接收，未知錯誤回傳 500。

### 外部資料來源分工

| 資料 | 來源 |
|------|------|
| 股票清單（TSE + OTC）| Shioaji `api.Contracts.Stocks` |
| 即時股價 | Shioaji `api.snapshots()` |
| 歷史日K | Shioaji `api.kbars()` + Python 端聚合 |
| 台股大盤（TWII）| Shioaji `api.Contracts.Indexs["TSE001"]` |
| 台指期（TXF）| Shioaji `api.Contracts.Futures["TXFC0"]` |
| 股票基本面（本益比、殖利率、市值等）| Yahoo Finance v10 quoteSummary |
| 美股指數（NASDAQ / S&P500 / 道瓊 / SOX）| Yahoo Finance v8 chart |
| 匯率（8 幣別對台幣）| Yahoo Finance v8 chart |
| 三大法人籌碼 | TWSE T86 API |
| 景氣燈號 | NDC API（CSRF + POST） |

Node.js 透過 `src/global/shioajiClient.ts` 以 HTTP 呼叫 Shioaji 微服務，`SHIOAJI_SERVICE_URL` 環境變數指定位址。

### Globals（src/global/）

| 檔案 | 用途 |
|------|------|
| `firebase.ts` | Firestore 單例初始化 |
| `shioajiClient.ts` | 呼叫 Python Shioaji 微服務的 axios client |
| `yahooFinance.ts` | Yahoo Finance v8 / v10 axios 封裝 |
| `cache.ts` | `getOrSet<T>(key, factory, ttlSeconds, shouldCache?)` wrapper（NodeCache） |
| `rateHelper.ts` | `getLiveRateMap()` — 即時匯率 Map（currency code → 台幣） |
| `apiResponse.ts` | 統一回應格式 |

### Caching TTL

- 股票報價：60s
- 股票清單（搜尋用）：3600s
- 基本面、籌碼、匯率：300s

### Firestore Collections

| Collection | Document ID | 備註 |
|------------|-------------|------|
| `holdings` | `stock_id` | 支援 `batchUpsert()` 批次寫入 |
| `transactions` | auto | |
| `settings` | `main` | |
| `plan_config` | `main` | 新版投資計畫 |
| `investment_plans` | `asset_type` | 舊版 |
| `yearly_records` | `{assetType}_{year}` | |
| `daily_snapshots` | `YYYY-MM-DD` | `record()` 使用 merge，同日重複呼叫冪等 |
| `watchlist` | `stock_id` | |
| `foreign_assets` | auto | `type`: `'活存'｜'定存'｜'債券'`，活存時 `maturityDate: null` |
| `preferences` | `default` | |

Collection 與 Model 一對一；document 欄位 **snake_case**，Model 層負責與 camelCase 互轉；Timestamp 在 Model 層轉為 ISO string。

### 環境變數（backend/.env）

```env
FIRESTORE_PROJECT_ID=nocode-finance
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json
PORT=3001
SHIOAJI_SERVICE_URL=http://localhost:8000
```

需有 `serviceAccountKey.json`（Firebase service account）才能連接 Firestore。

---

## shioaji-service/ — Python Shioaji 微服務

### 常用指令

```bash
cd shioaji-service

python -m pip install -r requirements.txt
python -m uvicorn main:app --port 8000 --reload  # 開發模式
```

### 設計重點

- Shioaji `api.login()` 在 FastAPI **lifespan** 啟動時執行一次，整個程序生命週期共用同一連線。
- **不可在每次 request 重新 login**（login 需下載合約清單，耗時數秒）。
- 歷史日K：`api.kbars()` 只提供 1 分鐘 K 棒，服務端依台灣日期（UTC+8）聚合為日K：`open`=第一根、`high`=最大、`low`=最小、`close`=最後一根、`volume`=加總。

### 端點

| 端點 | 說明 |
|------|------|
| `GET /health` | 健康檢查 |
| `GET /stocks` | 全股清單（TSE + OTC） |
| `GET /stocks/{code}/snapshot` | 即時快照（open/high/low/close/volume/change） |
| `GET /stocks/{code}/kbars?days=` | 歷史日K（預設 90 天，上限由 Node.js controller 控管） |
| `GET /market/twii` | 台股大盤加權指數 |
| `GET /market/futures` | 台指期近月合約（TXFC0） |

### 環境變數（shioaji-service/.env）

```env
SJ_API_KEY=你的永豐金API_KEY
SJ_SECRET_KEY=你的永豐金SECRET_KEY
```

### Cloud Run 部署注意

- 必須設 `--min-instances=1`，避免 cold start 重新 login。
- API Key 建議存放於 Google Secret Manager，以環境變數形式注入。
- Node.js 服務的 `SHIOAJI_SERVICE_URL` 填 Python 服務的 Cloud Run 內部 URL。
