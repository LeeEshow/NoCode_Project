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
