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
| F-04 | `GET/PUT /api/v1/preferences` — `chart.zoomLock` 欄位支援（`DEFAULT_PREFERENCES` 加入 `zoomLock: false`；`fromSnapshot` 加入 `?? false` fallback） |
| S-01 | 新增 Python FastAPI 微服務 `shioaji-service/`（Shioaji SDK 包裝），Node.js 透過 `shioajiClient.ts` 呼叫 |
| S-02 | 股票清單改由 Shioaji `api.Contracts.Stocks` 提供（取代 TWSE / TPEX API） |
| S-03 | 即時股價改由 Shioaji `api.snapshots()` 提供（取代 Yahoo Finance v8 chart） |
| S-04 | K 線歷史改由 Shioaji `api.kbars()` + Python 端聚合日K 提供（修正 B-01 OHLC 欄位異常） |
| S-05 | 台股大盤 / 台指期改由 Shioaji `Indexs["TSE001"]` / `Futures["TXFC0"]` snapshot 提供（取代 Yahoo Finance + HTML 爬蟲） |
| B-01 | K 線 OHLC 欄位異常 — 已隨 S-04 修正（Shioaji kbars 欄位明確，消除 Yahoo Finance null 補零問題） |

---

## 待辦

### 架構遷移計畫：Node.js → 單一 Python FastAPI 後端

**目標：** 將現有 Node.js 主後端整合進 Python FastAPI，消除雙服務架構，最終部署為單一容器。
**前提：** 前端 API 介面完全不變（路由路徑、回應結構、欄位名稱一律維持現狀）。

---

#### Phase 1 — FastAPI 基礎建設與無 DB 路由

| ID | 說明 |
|----|------|
| M-01 | 專案目錄重整：新增 `routers/`、`models/`、`global/` 子目錄，拆分現有 `main.py` |
| M-02 | 統一回應格式：實作 `ApiResponse.success(data)` / `ApiResponse.error(msg)`，對齊 `{ success, data/error }` |
| M-03 | 全域錯誤處理：實作 `AppError(status_code, message)` + FastAPI Exception Handler，對齊現有 errorHandler |
| M-04 | TTL 快取工具：以 `cachetools.TTLCache` 實作 `get_or_set(key, factory, ttl)` wrapper |
| M-05 | `/api/v1/stocks` 路由群：search、quote、history、profile、chip（Shioaji + Yahoo Finance + TWSE T86） |
| M-06 | `/api/v1/market` 路由群：indices、forex-rates、export-indicator（Shioaji + Yahoo Finance + NDC） |

---

#### Phase 2 — Firestore 整合與 DB 路由遷移

| ID | 說明 |
|----|------|
| M-07 | Firestore 初始化：`google-cloud-firestore` 單例，支援 `GOOGLE_APPLICATION_CREDENTIALS` 與 Workload Identity |
| M-08 | `Settings` Model + `/api/v1/settings`（GET/PUT，`cost_method` 欄位） |
| M-09 | `Holdings` Model + `/api/v1/holdings`（GET all/by id、PUT reorder、POST recalculate、batchUpsert） |
| M-10 | `Transaction` Model + `/api/v1/transactions`（CRUD，支援 `?stock_id=` 篩選） |
| M-11 | `Watchlist` Model + `/api/v1/watchlist`（GET/POST/PUT/DELETE，含即時報價注入與排序） |
| M-12 | `Preferences` Model + `/api/v1/preferences`（GET/PUT，Partial merge，`zoomLock` 預設 false） |
| M-13 | `ForeignAsset` Model + `/api/v1/foreign-assets`（GET/POST/PUT/DELETE，含即時匯率注入） |
| M-14 | `DailySnapshot` Model + `/api/v1/snapshots`（GET/POST/PUT，`record` 冪等寫入） |
| M-15 | `PlanConfig` + `YearlyRecord` Model + `/api/v1/plan`（config GET/PUT、yearly-records CRUD） |
| M-16 | 匯率工具：`get_live_rate_map()` — 即時匯率 Map，供 foreign-assets 與 snapshots 使用 |
| M-17 | @deprecated 路由保留：`/api/v1/bonds`、`/api/v1/foreign-currencies`（向後相容空殼，回傳現有資料） |

---

#### Phase 3 — 部署與 Node.js 退役

| ID | 說明 |
|----|------|
| M-18 | Cloud Run Dockerfile：單一容器，`--min-instances=1`（Shioaji 常駐需求） |
| M-19 | Secret Manager 整合：`SJ_API_KEY`、`SJ_SECRET_KEY`、`SJ_CA_*` 改由 Secret Manager 注入 |
| M-20 | Workload Identity 設定：移除容器內 `serviceAccountKey.json`，改用 GCP IAM |
| M-21 | 端對端驗證：逐一比對所有 `/api/v1/*` 端點回傳結構與現有 Node.js 一致 |
| M-22 | Node.js 後端退役：關閉 `backend/` 服務，移除 `shioajiClient.ts` 中間層 |

---

**技術選型對照**

| Node.js 現有 | Python 替代 |
|-------------|------------|
| Firebase Admin SDK | `google-cloud-firestore` |
| axios | `httpx`（非同步）|
| node-cache | `cachetools.TTLCache` |
| TypeScript interface | Pydantic Model |
| AppError + errorHandler | `HTTPException` + `@app.exception_handler` |
| ApiResponse | FastAPI `JSONResponse` wrapper |

---

## Bug 回報（前端發現 API 異常）

> 目前無待處理 Bug。
