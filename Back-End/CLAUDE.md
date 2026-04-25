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

所有路由前綴 `/api/v1`，依資產類型分域：

| 路由 | 功能 |
|------|------|
| `/holdings` | 持股組合（含 recalculate） |
| `/transactions` | 交易紀錄（買賣） |
| `/stocks` | 股票查詢（搜尋、報價、歷史、基本面） |
| `/market` | 大盤指數、匯率 |
| `/plan` | 投資計畫與年度紀錄 |
| `/settings` | 用戶設定（成本計算方式） |
| `/foreign-currencies` | 外幣持倉 |
| `/bonds` | 債券組合 |
| `/snapshots` | 每日快照 |
| `/watchlist` | 自選股（含目標價） |

### Response Format

所有回應統一由 `src/global/apiResponse.ts` 處理：
- 成功：`{ success: true, data: ... }`
- 失敗：`{ success: false, error: "訊息" }`

Error 透過 `next(err)` 傳至 `src/middleware/errorHandler.ts`，未知錯誤回傳 500。

### Firebase / Firestore

- 初始化於 `src/global/firebase.ts`，使用 `GOOGLE_APPLICATION_CREDENTIALS` 環境變數
- Collection 與對應的 Model 一對一，document 欄位使用 **snake_case**
- Firestore Timestamp 與 ISO string 在 Model 層互轉
- `holdings` 支援 `batchUpsert()` 批次寫入（用於重新計算持倉）

### 資料模型重點

- **成本計算**：`settings` 中的 `cost_method` 決定算法：`preserve_method`（FIFO）或 `return_method`（加權平均）
- **台股符號**：TSE 上市掛 `.TW`，OTC 上櫃掛 `.TWO`
- **外部資料**：Yahoo Finance v8 Chart API（報價/歷史）、v10 Quote Summary API（基本面）

### Caching

`src/global/cache.ts` 提供泛型 `getOrSet<T>()` wrapper（基於 NodeCache）：
- 股票報價：60s TTL
- 公司基本資料：300s TTL
- 股票清單：3600s TTL

### Environment Variables

```env
FIRESTORE_PROJECT_ID=nocode-finance
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json
PORT=3001
```

需有 `serviceAccountKey.json`（Firebase service account）才能連接 Firestore。
