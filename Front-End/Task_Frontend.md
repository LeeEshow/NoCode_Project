# 個人理財雲端系統 — 前端開發任務清單

> 參考文件：Front-End\CLAUDE.md

**指派後端開發**：遇到以下情況，請把後端開發需求寫入 D:\Project\NoCode_Project\Back-End\Task_Backend.md 任務清單的最後段
> 1. 前端設計變更，影響後端API資料結構
> 2. 新增功能需後端開發新API
> 3. 前端發現API資訊異常，需要後端排錯時

---

## Phase 6：設定頁（`/settings`）

### P6-SL：股票清單手動更新（對應後端 SL-01 ～ SL-03）

**需求背景：**
全股清單改為非即時模式，資料預存在 DB，前端搜尋直接讀 DB。
使用者可在設定頁手動觸發 Shioaji → DB 同步，避免每次搜尋都打 Shioaji API。

**前端工作項目：**

- [x] **P6-SL-01**：`stockListModel.ts` 新增兩支 API 呼叫
  - `fetchStockListMeta(): Promise<{ count: number; updatedAt: string | null }>` — 取得清單筆數與上次更新時間（`GET /stocks/list/meta`）
  - `triggerStockListRefresh(): Promise<{ count: number; updatedAt: string }>` — 觸發後端同步（`POST /stocks/list/refresh`）

- [x] **P6-SL-02**：`useStockListViewModel.ts` — 封裝 meta 載入 + refresh 觸發
  - state：`{ count, updatedAt, loading, refreshing, error }`
  - `refresh()`：呼叫 triggerStockListRefresh，期間 `refreshing = true`，完成後更新 meta

- [x] **P6-SL-03**：`SettingsPage` 加入「股票清單」區塊
  - 顯示：上次更新時間、總筆數
  - 按鈕：「立即更新」（`refreshing` 時 disabled + spinner）
  - 成功：`toast.success('股票清單已更新，共 N 筆')`
  - 失敗：`toast.error(...)` 顯示錯誤訊息

**UI 規格：**
- 區塊標題用 `.ft-section-header` / `.ft-section-title`
- 按鈕用 `.btn-ghost`，loading 時內容改為 spinner icon
- 上次更新時間格式：`YYYY-MM-DD HH:mm`，無資料顯示「尚未更新」

---

## P-RT：盤中即時股價 5 秒輪詢（對應後端 RT-01）

**需求背景：**
台股盤中（週一至週五 09:00–13:30 台灣時間），每 5 秒自動刷新：
- 庫存持股即時股價（currentPrice / change / changePct / unrealizedProfit）
- 大盤加權指數、台指期
- Header 更新時間
盤後停止輪詢，避免無效打 API。

**架構設計：**
- `load()` 保留為「完整載入」（初始化、交易後刷新、手動全量重載）
- 新增 `refreshPrices()` 為「靜默價格刷新」，不設 `loading: true`，不重抓 sparklines
- 市場指數新增 `silentReload()`，不設 `loading: true`，更新 `lastUpdated`

**前端工作項目：**

- [x] **P-RT-01**：新增 `src/utils/tradingHours.ts`
  - `isTradingHours(): boolean` — 台灣時間週一至週五 09:00–13:30

- [x] **P-RT-02**：`holdingModel.ts` 新增 `fetchHoldingPrices()`
  - 呼叫 `GET /holdings/prices`，回傳 `{ stockCode, currentPrice, change, changePct, unrealizedProfit }[]`

- [x] **P-RT-03**：`useHoldingsViewModel` 新增 `refreshPrices()`
  - 呼叫 `fetchHoldingPrices()`，**不設 `loading: true`**
  - 只 patch `items` 的價格欄位，重算 `summary`
  - `expandedCode`、`sparklines`、`klines`、`chips`、拖拉順序全部保留不動

- [x] **P-RT-04**：`useMarketViewModel` 新增 `silentReload()`
  - 同 `load()` 但不設 `loading: true`，成功後更新 `lastUpdated`

- [x] **P-RT-05**：`StockOverviewPage` 加入 5 秒輪詢
  - `useEffect` + `setInterval(5000)`，條件：`isTradingHours()` 為 true
  - 每次 tick：同時呼叫 `holdings.refreshPrices()` + `market.silentReload()`
  - 組件 unmount 時 `clearInterval`

- [x] **P-RT-06**：「重新整理」Button 行為改為觸發靜默刷新
  - 點擊觸發：`holdings.refreshPrices()` + `market.silentReload()`
  - 不再呼叫 `holdings.load()`（不重載 sparklines、不顯示 skeleton）
  - 保留原本完整重載能力（`holdings.load()`）供交易後刷新使用

---

---

## Phase 6：設定頁（`/settings`）— 續

### P6-SS：手動記錄今日快照（對應後端 SS-01 ～ SS-03）

**需求背景：**
使用者可在設定頁手動觸發當天快照記錄，後端執行全自動計算（持股現值、外幣、債券）並寫入 DB。
快照同時記錄當下的庫存持股清單（代號、名稱、股數、均價、即時股價、未實現損益），供日後歷史比對使用。

**前端工作項目：**

- [x] **P6-SS-01**：`snapshotModel.ts` 新增 `triggerSnapshotRecord()`
  - 呼叫 `POST /api/v1/snapshots/record`，回傳 `DailySnapshotDTO`
  - 後端已實作此端點（含冪等 merge 設計，同日重複觸發只覆蓋不重複寫）

- [x] **P6-SS-02**：`SettingsPage` 新增「每日快照」區塊
  - 載入時呼叫 `GET /snapshots/:today` 查詢今日快照狀態
  - 顯示：今日是否已記錄（`recordedAt` 時間 or「尚未記錄」）
  - 按鈕：「記錄今日快照」（`recording` 時 disabled + spinner）
  - 成功：`toast.success('今日快照已記錄（YYYY-MM-DD）')`
  - 失敗：`toast.error(...)` 顯示錯誤訊息

- [x] **P6-SS-03**：`types/index.ts` 更新 `DailySnapshotDTO`（等後端 SS-02 完成後）
  - 新增 `SnapshotHoldingDTO`：`{ stockCode, stockName, sharesHeld, costAvg, currentPrice, stockValue, unrealizedProfit }`
  - `DailySnapshotDTO` 新增 `holdings?: SnapshotHoldingDTO[]`

**UI 規格：**
- 區塊標題用 `.ft-section-header` / `.ft-section-title`
- 按鈕用 `.btn-ghost`，loading 時內容改為 spinner icon
- 已記錄時間格式：`YYYY-MM-DD HH:mm`

---

## Bug / 待辦

> 無待辦事項