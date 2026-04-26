# 個人理財雲端系統 — 後端開發任務清單

> 版本：1.0（2026-04-22）
> 參考文件：Back-End\CLAUDE.md

---

## 已完成項目

| ID | 說明 |
|----|------|
| P1-01 | Yahoo Finance 工具函式整合（axios 封裝，node-cache TTL 60s） |
| P1-02 | `GET /market/indices` — 台股 / 台指期 / NASDAQ / S&P500 / 道瓊 / SOX |
| P1-03 | `GET /market/export-indicator` — 台灣景氣燈號（NDC，TTL 3600s） |
| P1-04 | `GET /stocks/search?q=` — 股票搜尋 |
| P3B-01～04 | `ForeignAsset` Model + Controller + 路由；舊 foreign-currencies / bonds 標記 @deprecated |
| P4B-01～06 | `DailySnapshot` / `PlanConfig` Model + Controller + 路由 |
| E-01 | 台指期盤中/夜盤 null 值處理（`Promise.allSettled` 靜默處理） |
| E-02 | `holdings` 回應加入 `stockName` 欄位 |
| E-03 | 台指期資料回傳 null → 改爬 Yahoo Finance TW SSR HTML（`WTX&`），實測 `{ price: 39766, change: 544, changePercent: 1.39 }` |
| E-04 | 景氣燈號回傳空值 → NDC 為 AngularJS SPA，改為先 GET 取 CSRF token，再 POST `/n/json/data/eco/indicators` 解析 `SR0005` |
| F-02 | `GET/PUT /api/v1/preferences` — 使用者偏好設定持久化（Firestore `preferences/default`，含 chart 顯示元素，預設全 true，支援 Partial merge） |
| F-03 | `GET /api/v1/stocks/:stockId/profile` 加入 revenue/grossMargin/roe/roa；新增 `GET /api/v1/stocks/:stockId/chip`（TWSE T86，近 20 交易日三大法人買賣超，單位：張） |

---

## 待辦

### F-04 `GET/PUT /api/v1/preferences` — `chart.zoomLock` 欄位支援

**日期：** 2026-04-26
**關聯前端變更：** `ChartPreferences` 新增 `zoomLock: boolean`（K 線圖滾輪鎖定）

**需求：**
Firestore `preferences/default` 文件的 `chart` 子物件需能存取 `zoomLock` 欄位：
- `GET /preferences` 回傳時，若文件不含 `zoomLock`，請在後端 merge 預設值 `false` 後回傳
- `PUT /preferences` 支援接收並寫入 `chart.zoomLock`（現有 Partial merge 邏輯應已支援，請確認）

**預期回傳結構：**
```json
{
  "chart": {
    "showK": true,
    "showMA5": true,
    "showMA20": true,
    "showMA60": true,
    "showVolume": true,
    "zoomLock": false
  },
  "expandTab": "kline"
}
```

---

## Bug 回報（前端發現 API 異常）

### B-01 `GET /stocks/:stockId/history` — K 線 OHLC 欄位數值異常

**發現日期：** 2026-04-26
**發現位置：** 台股總覽 → 庫存持股展開列 → K 線圖 Tooltip

**現象：**
前端在 K 線圖 Tooltip 顯示開盤價時，發現數值明顯不合理：
- `open` 顯示 `117`，對一檔 2000+ 元的股票（如 2330 台積電）完全不合理
- `lowest: 2185`，`highest: 2105` — lowest > highest，資料邏輯矛盾

**前端 mapping 確認正確：**
```
API RawHistoryPoint → KLineDTO → KLineBar → ECharts [open, close, low, high]
Tooltip 讀取順序：[o, c, l, h] = [open, close, lowest, highest]
```
前端欄位對應無誤，數值異常源自 API 回傳的原始資料。

**排查方向：**
1. 確認 Yahoo Finance（或資料來源）回傳的 OHLC 欄位名稱是否與 `RawHistoryPoint` 定義一致
2. 確認 `open / low / high` 未被混用或錯序對應
3. 確認 `days: 180` 範圍內所有資料點的 `low <= close <= high` 邏輯成立
