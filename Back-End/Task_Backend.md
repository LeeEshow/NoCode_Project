# 個人理財雲端系統 — 後端開發任務清單

> 版本：1.0（2026-04-22）
> 參考文件：Back-End\CLAUDE.md

---

## Phase 0：環境建置

## Phase 1：後端核心 API

> 後端只負責資料存取與外部 API 代理，不含任何計算邏輯

### 市場資料（外部 API 代理 + node-cache）
- [x] P1-01：Yahoo Finance 工具函式整合（axios 封裝，node-cache TTL 60s）
- [x] P1-02：`GET /market/indices` — 台股 / 台指期 / NASDAQ / S&P500 / 道瓊 / SOX
- [x] P1-03：`GET /market/export-indicator` — 台灣出口景氣燈號（NDC 爬蟲，TTL 3600s）
- [x] P1-04：`GET /stocks/search?q=` — 股票搜尋（修正 resolveSymbol 快取 + TWSE 欄位相容）

---

## Phase 3：外幣資產 API 重構

> 原 `ForeignCurrency`（活存）+ `Bond`（債券）合併為統一的 `ForeignAsset` 資料模型

- [x] P3B-01：建立 `ForeignAsset` Firestore Model（CRUD）
- [x] P3B-02：建立 `foreignAssetsController`，GET 注入即時匯率（liveRate）
- [x] P3B-03：新增路由 `/api/v1/foreign-assets`（POST / PUT / DELETE / GET）
- [x] P3B-04：舊 `/api/v1/foreign-currencies` 與 `/api/v1/bonds` 標記 @deprecated

---

## Phase 4：投報計畫所需 API

- [x] P4B-01：`DailySnapshot` Firestore Model（新增 `findAll(year?)` 支援年度篩選）
- [x] P4B-02：`snapshotsController`（`GET /` 支援 `?year=`，`POST /` 接收前端資料）
- [x] P4B-03：路由 `/api/v1/snapshots` 更新
- [x] P4B-04：`PlanConfig` Firestore Model（collection `plan_config`，無資料時回傳預設值）
- [x] P4B-05：`planController` 新增 `getPlanConfig` / `updatePlanConfig`
- [x] P4B-06：路由 `/api/v1/plan/config`（GET / PUT）

---

## Bug / 調整

- [x] E-01：台指期盤中/夜盤 null 值處理（已由 `Promise.allSettled` 靜默處理）
- [x] E-02：`holdings` 回應加入 `stockName` 股票名稱欄位

---

## Bug：市場資料異常（2026-04-25）

### E-03：台指期（TXF）資料回傳 null

**位置：** `src/models/MarketIndex.ts`，`INDEX_SYMBOLS` 陣列

**問題：** Yahoo Finance symbol 設定為 `TWF=F`，但此 symbol 無效，Yahoo Finance 無法取得資料，導致 `Promise.allSettled` 靜默失敗，前端收到 `price: null`。

**調查結果（2026-04-25）：**
- `TWF=F` → Yahoo Finance 回傳 "No data found, symbol may be delisted"
- `TW=F` → 回傳 NY Mercantile 台幣外匯期貨，非台指期
- `IX0126.TW` → 回傳 "TIP TAIFEX TAIEX Futures Index"，但價格 21499 ≠ 實際台指期 ~39766
- Yahoo Finance v8 Chart API **不支援** 台指期（`WTX&`）symbol
- 台指期正確 Yahoo 網址：`tw.stock.yahoo.com/future/WTX&`，但其 v8/v7 API 均不開放此 symbol
- `^TWII`（台股大盤現貨）= 38932，與台指期（39766）差約 2%，可作為 proxy

**替代方案調查（2026-04-25）：**

| 來源 | 結果 |
|------|------|
| `wantgoo.com/futures/wtxp&` | Cloudflare 擋住 server-side curl；頁面資料透過 SignalR WebSocket 推送，無 REST API |
| `tw.stock.yahoo.com/future/WTX&` | curl 被擋，但 **Node.js 帶完整 Chrome headers 可取得 540KB SSR HTML**，其中含 `39,766.00` 價格字串（element id：`main-1-FutureHeader-Proxy`） |
| `openapi.taifex.com.tw` | API 可存取、無需 token，但**只有日結資料**（如 `/v1/DailyForeignExchangeRates`），無即時報價 endpoint |
| `^TWII`（台股大盤現貨） | Yahoo Finance v8 可取得，現值 38932，與台指期（39766）差 ~2% |

**可行方案（待選擇）：**

- [ ] **方案 A — 爬 Yahoo Finance TW（SSR HTML）**
  - 對 `https://tw.stock.yahoo.com/future/WTX%26` 發 GET，帶 Chrome-like headers
  - 用 regex 從 `main-1-FutureHeader-Proxy` 區塊解析價格、漲跌、漲跌幅
  - 優點：資料正確；缺點：依賴 SSR 結構，改版可能失效

- [ ] **方案 B — 改用 `^TWII` 當替代（proxy）**
  - 直接沿用現有 Yahoo Finance v8 架構，改 symbol 為 `^TWII`
  - 優點：簡單穩定；缺點：現貨非期貨，差 ~2%，需更改顯示 label

---

### E-04：景氣燈號（NDC 景氣燈號）回傳空值 ✅ 已修復

**位置：** `src/models/MarketIndex.ts`，`fetchExportIndicator()` 方法

**問題根因：** NDC 網站為 AngularJS SPA，直接 GET 路由網址只拿到 HTML，並非 JSON。真正的資料由前端 POST 至 `/n/json/data/eco/indicators`，且需帶 CSRF token + session cookie。

**修復內容：**
1. **舊做法**：GET `https://index.ndc.gov.tw/n/zh_tw/data/eco/indicators_table1` → 回傳 HTML，解析失敗
2. **新做法**：
   - Step 1：GET 同網址，從 `<meta name="csrf-token">` 擷取 token，並保留 `set-cookie`
   - Step 2：POST `https://index.ndc.gov.tw/n/json/data/eco/indicators`，帶 `X-CSRF-TOKEN` + `Cookie`
   - 從回應 `line` 物件中找 `code === 'SR0005'`（景氣分數）
   - `x` 欄位為 YYYYMM 格式（如 `202602`），轉為 `2026-02`
   - `y` 欄位為分數（如 40），透過 `scoreToLight()` 推算燈號
3. **詳細 log**：catch 區塊補上 HTTP status code 方便排查
4. 移除不再使用的 `chineseLabelToLight()` 與 `rocPeriodToIso()` 工具函式
