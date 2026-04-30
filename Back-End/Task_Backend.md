# 個人理財雲端系統 — 後端開發任務清單

> 版本：1.2（2026-04-30）
> 參考文件：Back-End\CLAUDE.md

---

## 已完成

### SL：全股清單 DB 化（非即時，手動同步）✅

**需求背景：**
全股清單（上市 + 上櫃）由即時查詢 Shioaji 改為預存 DB，搜尋直接讀 DB。
使用者可在前端設定頁手動觸發同步，後端執行 Shioaji → DB 寫入。

| ID | 狀態 | 說明 |
|----|------|------|
| SL-01 | ✅ | **DB Schema**：新增 `StockList` Model（`src/models/StockList.ts`），Firestore `stock_list` Collection（欄位 `code`/`name`/`market`），meta 存於 `stock_list_meta/current`（`count`/`updated_at`） |
| SL-02 | ✅ | **同步邏輯**：`POST /api/v1/stocks/list/refresh` — 呼叫 Shioaji `/stocks`（`sjGetAllStocks()`），批次寫入 DB（400 筆/batch），回傳 `{ count, updatedAt }`，同步清除 NodeCache |
| SL-03 | ✅ | **Meta 查詢**：`GET /api/v1/stocks/list/meta` — 讀 `stock_list_meta/current`，回傳 `{ count, updatedAt \| null }` |
| SL-04 | ✅ | **搜尋改接 DB**：`Stock.fetchAllStockList()` 優先讀 Firestore（DB 非空時），DB 未初始化則 fallback TWSE/TPEX 外部 API |

**實作位置：**
- `src/models/StockList.ts`（新增）
- `src/global/shioajiClient.ts`：新增 `sjGetAllStocks()`
- `src/models/Stock.ts`：`fetchAllStockList()` 改呼叫 DB，原 API 邏輯移至 `fetchFromExternalAPIs()`
- `src/controllers/stocksController.ts`：新增 `listRefresh`、`listMeta`
- `src/routes/stocks.ts`：新增 `GET /list/meta`、`POST /list/refresh`

---

### RT-01：庫存持股輕量價格端點（供前端 5 秒輪詢使用）✅

**需求背景：**
前端每 5 秒靜默刷新庫存股價，需要輕量端點只回傳即時價格相關欄位。

| ID | 狀態 | 說明 |
|----|------|------|
| RT-01 | ✅ | **新增** `GET /api/v1/holdings/prices` — 回傳所有有持股標的的即時價格，格式 `[{ stockCode, currentPrice, change, changePct, unrealizedProfit }]`；走 `apiSwitch`（Shioaji / Yahoo fallback），`unrealizedProfit` 後端計算 |

**實作位置：**
- `src/controllers/holdingsController.ts`：新增 `getPrices`
- `src/routes/holdings.ts`：新增 `GET /prices`（置於 `/:stockId` 之前）

---

### SS：快照新增庫存持股清單欄位（對應前端 P6-SS）✅

**需求背景：**
每次觸發快照記錄時，同步將當下的庫存持股清單（含即時股價）寫入快照文件，供日後歷史比對使用。

| ID | 狀態 | 說明 |
|----|------|------|
| SS-01 | ✅ | **型別擴充**：`SnapshotHolding` 介面新增；`DailySnapshotInput.holdings?: SnapshotHolding[]`；`DailySnapshotDoc.holdings: SnapshotHolding[]` |
| SS-02 | ✅ | **寫入邏輯**：`snapshotsController.record()` 在 `priceResults` forEach 中同步組裝 `SnapshotHolding[]`，取價失敗 `currentPrice = 0`，只記錄 `sharesHeld > 0` 的標的 |
| SS-03 | ✅ | **反序列化**：`DailySnapshot.deserialize()` 補 `holdings` 欄位，舊文件缺失時 fallback `[]` |

**實作位置：**
- `src/models/DailySnapshot.ts`：型別擴充 + `record()` + `deserialize()`
- `src/controllers/snapshotsController.ts`：`record()` 組裝 holdings，`create()` 傳遞前端 holdings

---

## 待辦

> 暫無待辦

---

## Bug 回報（前端發現 API 異常）

> 暫無 Bug 待辦
