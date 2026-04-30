# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Layout

```
Back-End/
├── backend/          # Node.js Express API（主後端，port 3001）
├── Shioaji_API/      # Python FastAPI 微服務（永豐金即時報價，port 8000）
└── Task_Backend.md   # 開發任務清單與進度
```

---

## Node.js Backend (`backend/`)

### Common Commands

```bash
npm run dev     # 開發模式（ts-node + 熱重載）
npm run build   # 編譯 TypeScript → dist/
npm start       # 正式模式（需先 build）
npm run lint
npm run format
```

### Architecture

```
Routes (src/routes/)
  → Controllers (src/controllers/)
    → Models (src/models/)         ← Firestore CRUD + 外部 API 呼叫
      → src/global/               ← 共用工具
```

所有路由前綴 `/api/v1`，回應格式統一：
- 成功：`{ success: true, data: ... }`
- 失敗：`{ success: false, error: "訊息" }`（透過 `AppError` + `errorHandler.ts`）

### Global Utilities (`src/global/`)

| 檔案 | 用途 |
|------|------|
| `firebase.ts` | Firestore 單例初始化 |
| `cache.ts` | `getOrSet<T>(key, factory, ttl)` NodeCache wrapper；另匯出 `nodeCache` 實例供直接讀取快取 |
| `yahooFinance.ts` | `yfChart()` v8 / `yfQuoteSummary()` v10 封裝 |
| `rateHelper.ts` | `getLiveRateMap()` 即時匯率 Map（currency → 台幣） |
| `shioajiClient.ts` | 呼叫 Python 微服務的 axios client（base URL `SHIOAJI_API_URL` 或預設 `http://localhost:8000`） |
| `marketHours.ts` | `isMarketOpen()` 純函式：週一–五 09:00–13:30 台灣時間 |
| `circuitBreaker.ts` | Circuit Breaker 狀態機（CLOSED → OPEN 失敗 3 次，冷卻 60s → HALF_OPEN） |
| `apiSwitch.ts` | `apiSwitch.call(primary, fallback)` + `apiSwitch.status()`：盤中走 Shioaji，其餘走 Yahoo |

### Data Source Switching Logic

```
apiSwitch.call(primary, fallback)
  ├─ 盤外              → fallback（Yahoo Finance）
  ├─ 盤中 + CB OPEN    → fallback（冷卻期）
  ├─ 盤中 + CB HALF_OPEN → primary 試跑，成功 CLOSED / 失敗 fallback
  └─ 盤中 + CB CLOSED  → primary（Shioaji 微服務）
```

受 `apiSwitch` 控制的端點：`getIndices`、`getQuote`、`getHistory`。

### Key Design Decisions

- `Contracts.Futures` / `Contracts.Stocks` 迭代出的是 **StreamMultiContract 群組**，需先取 `.TXF` / `.TSE` / `.OTC` 再迭代個別合約（直接用 `["TXFC0"]` 在 1.3.x 回傳 None）
- Model 層欄位用 **snake_case**（Firestore）← Model → **camelCase**（API 回應）
- `daily_snapshots` 的 `record()` 是冪等設計（merge），同日多次呼叫安全
- 外部 API 以 `Promise.allSettled` 靜默失敗，不中斷整體回應

### Environment Variables

```env
FIRESTORE_PROJECT_ID=nocode-finance
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json
PORT=3001
SHIOAJI_API_URL=http://localhost:8000   # 可選，預設值即 8000
```

---

## Python Microservice (`Shioaji_API/`)

### Startup

```bash
cd Back-End/Shioaji_API
pip install -r requirements.txt        # 首次安裝
uvicorn main:app --port 8000           # 啟動（根目錄的 main.py 會加入 sys.path）
```

`.env` 需設定：

```env
SJ_API_KEY=your_api_key
SJ_SECRET_KEY=your_secret_key
```

### Architecture

```
Shioaji_API/
├── main.py                  # 根入口（sys.path 修正 + re-export app）
└── src/shioaji_api/
    ├── main.py              # FastAPI app + lifespan（登入/登出）
    ├── core/
    │   ├── config.py        # pydantic-settings 讀取 .env
    │   └── manager.py       # ShioajiManager singleton
    ├── routers/             # 各端點
    └── schemas/market.py    # Pydantic response models
```

### ShioajiManager（`core/manager.py`）

單例，負責：
- 登入（`asyncio.to_thread` 包裹同步呼叫）
- WebSocket tick 訂閱與記憶體快取（`_quote_cache`、`_futures_cache`）
- 斷線自動重連（event_code 4 → 重新訂閱）
- `_get_nearest_txf()` / `get_taiex_contract()`：動態找近月 TXF 合約與 TSE001 合約

### Endpoints

| 端點 | 說明 |
|------|------|
| `GET /health` | 連線狀態、快取數量 |
| `GET /quote/{stock_id}` | 個股即時報價（tick 快取 → snapshot fallback） |
| `GET /index/taiex` | 加權指數（tick 快取 → snapshot fallback） |
| `GET /index/futures` | 台指期近月（tick 快取 → snapshot fallback） |
| `GET /stocks` | 全台股清單（TSE + OTC，記憶體快取） |
| `GET /kline/{stock_id}` | K 線（`?interval=1D\|1m&days=N`，1D 為後端聚合日線） |

### Shioaji Contract Access Pattern

```python
# ✅ 正確：先取群組再迭代
for c in api.Contracts.Stocks.TSE: ...
for c in api.Contracts.Futures.TXF: ...

# ❌ 錯誤：直接 key 存取在 1.3.x 回傳 None
api.Contracts.Futures["TXFC0"]   # → None
api.Contracts.Indexs["TSE001"]   # → None
```
