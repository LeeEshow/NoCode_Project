# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

```bash
# 開發模式（熱重載）
npm run dev

# 編譯 TypeScript
npm run build

# 正式模式（需先 build）
npm start

# 程式碼檢查
npm run lint

# 格式化
npm run format
```

## Architecture Overview

個人理財系統後端，使用 **Express 5 + TypeScript + Firebase Firestore**，提供台股相關資產管理 API。

### Layered Pattern

```
Routes (src/routes/)
  → Controllers (src/controllers/)
    → Models (src/models/)
      → Firestore (via src/global/firebase.ts)
```

### API 結構

所有路由前綴 `/api/v1`：

| 路由 | 功能 |
|------|------|
| `/holdings` | 持股組合（GET all/by id、PUT reorder、POST recalculate） |
| `/transactions` | 交易紀錄（CRUD，支援 `?stock_id=` 篩選） |
| `/stocks` | 搜尋、即時報價、歷史 K 線、基本面、三大法人籌碼 |
| `/market` | 大盤指數、匯率（8 幣別）、台灣景氣燈號 |
| `/plan` | 投資計畫（新版 `/plan/config`）與年度結算 `/plan/yearly-records` |
| `/settings` | 成本計算方式（`preserve_method` FIFO / `return_method` 加權平均） |
| `/foreign-assets` | 外幣資產（活存/定存/債券，取代已棄用的舊路由） |
| `/snapshots` | 每日快照（含後端自動計算 `/snapshots/record`） |
| `/watchlist` | 自選股（含目標價、買進/觀望判斷、排序） |
| `/preferences` | 使用者偏好設定（圖表顯示控制） |
| `/bonds` | **@deprecated**，已由 `/foreign-assets` 取代 |
| `/foreign-currencies` | **@deprecated**，已由 `/foreign-assets` 取代 |

### Response Format

所有回應統一由 `src/global/apiResponse.ts` 處理：
- 成功：`{ success: true, data: ... }`
- 失敗：`{ success: false, error: "訊息" }`

錯誤一律 `throw new AppError(statusCode, message)` 再由 `next(err)` 傳至 `src/middleware/errorHandler.ts`，未知錯誤回傳 500。

### Firebase / Firestore

- 初始化於 `src/global/firebase.ts`，使用 `GOOGLE_APPLICATION_CREDENTIALS` 環境變數（單例）
- Collection 與 Model 一對一，document 欄位使用 **snake_case**，Model 層負責與 camelCase 互轉
- Firestore Timestamp 在 Model 層轉為 ISO string 再回傳
- `holdings` 支援 `batchUpsert()` 批次寫入（前端計算完整批回寫）
- `daily_snapshots` 的 `record()` 使用 merge，冪等設計，同日重複呼叫只更新

### Firestore Collections 對應

| Collection | Document ID | Model |
|------------|-------------|-------|
| `holdings` | `stock_id` | `Holding` |
| `transactions` | auto | `Transaction` |
| `settings` | `main` | `Settings` |
| `plan_config` | `main` | `PlanConfig`（新版） |
| `investment_plans` | `asset_type` | `InvestmentPlan`（舊版） |
| `yearly_records` | `{assetType}_{year}` | `YearlyRecord` |
| `daily_snapshots` | `YYYY-MM-DD` | `DailySnapshot` |
| `watchlist` | `stock_id` | `Watchlist` |
| `foreign_assets` | auto | `ForeignAsset` |
| `preferences` | `default` | `Preferences` |
| `foreign_currencies` | 幣別代碼 | `ForeignCurrency`（deprecated） |
| `bonds` | auto | `Bond`（deprecated） |

### 外部資料來源

- **Yahoo Finance v8 Chart API** — 即時報價、歷史 K 線（`src/global/yahooFinance.ts`）
- **Yahoo Finance v10 Quote Summary API** — 本益比、殖利率、市值、營收等基本面
- **TWSE T86 API** — 三大法人買賣超（近 20 交易日籌碼）
- **TWSE / TPEX 清單 API** — 股票搜尋（上市掛 `.TW`、上櫃掛 `.TWO`）
- **NDC 景氣燈號 API** — 台灣景氣對策信號

### Caching

`src/global/cache.ts` 提供泛型 `getOrSet<T>(key, factory, ttlSeconds, shouldCache?)` wrapper（基於 NodeCache）：
- 股票報價：60s TTL
- 公司基本資料、籌碼、匯率：300s TTL
- 股票清單（搜尋用）：3600s TTL

`src/global/rateHelper.ts` 提供 `getLiveRateMap()` 取得即時匯率 Map（currency code → 台幣），供外幣資產與快照計算使用。

### 關鍵設計決策

- 對外部 API（報價、籌碼）使用 `Promise.allSettled` 靜默失敗，不影響整體回應
- `stock_id` 為台灣股票代碼（如 `2330`），Yahoo Finance symbol 由 `Stock.resolveSymbol()` 動態加後綴（`.TW` 或 `.TWO`）
- `foreign-assets` 的 `type` 欄位為 `'活存' | '定存' | '債券'`，`maturityDate` 活存時為 `null`

### Environment Variables

```env
FIRESTORE_PROJECT_ID=nocode-finance
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json
PORT=3001
```

需有 `serviceAccountKey.json`（Firebase service account）才能連接 Firestore。
