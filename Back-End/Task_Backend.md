# 個人理財雲端系統 — 後端開發任務清單

> 版本：6.1（2026-05-25）
> 參考文件：Back-End\CLAUDE.md

---

## 開發原則

### 統一 Response 格式

所有端點一律使用：

```json
{ "success": true, "data": <payload> }
{ "success": false, "error": "訊息" }
```

### Firestore 欄位轉換規則

- Firestore 儲存：`snake_case`
- API 回傳：`camelCase`
- **例外**：`preferences/default` 的 `chart.*` 欄位在 Firestore 就是 camelCase（`showK`、`showMA5` 等）

---

## 現況（2026-05-25）

- **M1–M8 全部完成**：Python FastAPI 後端穩定運作於 Azure App Service
- **MCP 全部完成**：18 個 Tool + SSE/Streamable HTTP 雙傳輸層
- **層一、層二優化完成**：MCP fail-closed、Cache LRU、CORS env、Settings 集中、Circuit Breaker 等
- **FinMind 同步完成**：三大法人 + 基本面資料；`yfinance` 已移除
- **舊服務清理完成**（2026-05-25）：`Back-End/backend/`（Node.js）、`Back-End/Shioaji_API/` 已移除
- **Shioaji 啟動修正**（2026-05-25）：`lifespan` 加入 `shioaji_manager.initialize()`；`_NoTickYet` 不計入 CB failure

### Firestore 新增集合（M8）

```
stock_fundamentals/{stockId}        ← 每日覆蓋最新值（FinMind 同步寫入）
stock_chip/{stockId}/records/{date} ← 每交易日一筆，保留完整歷史
```

### FinMind API 實作備注（已驗證）

| Dataset | 關鍵欄位 |
|---------|---------|
| `TaiwanStockInstitutionalInvestorsBuySell` | `name` 為英文：`Foreign_Investor`、`Foreign_Dealer_Self`、`Investment_Trust`、`Dealer_self`、`Dealer_Hedging`；buy/sell 單位為**股**，÷1000 = 張 |
| `TaiwanStockDividend` | 現金股利：`CashEarningsDistribution`；除息日：`CashExDividendTradingDate` |
| `TaiwanStockFinancialStatements` | 淨利：`IncomeAfterTaxes`；無 Equity 欄位（ROE 暫為 null） |
| `TaiwanStockPER` | `PER`、`PBR`（每日更新） |
| `TaiwanStockMonthRevenue` | `revenue`、`revenue_month`、`revenue_year` |
| `TaiwanStockInfo` | `stock_name`、`type`（`twse`/`otc`） |

### 每日排程（`.github/workflows/daily-snapshot.yml`）

UTC 06:00 / 台灣 14:00，依序執行：
1. `POST /api/v1/snapshots/record`
2. `POST /api/v1/finmind/sync`（基本面 + 三大法人，共用 `X-Cron-Token`）

---

## 待辦：報價來源重構（QUOTE）

> 目的：解決 Azure 正式環境盤中/盤後報價 request 容易因 Yahoo outbound timeout 而失敗的問題，並讓 Shioaji 成為真正的主要報價來源。  
> 設計原則：Router 不再各自包 `primary/fallback`；統一由 Quote Service 決定資料源順位、timeout、fallback 與來源標記。

---

#### QUOTE-B-01 🔲 重新定義 API Switch / Quote Provider 順位

**現況問題**：

目前 `api_switch_call(primary, fallback)` 以 `is_market_open()` 作為是否使用 Shioaji 的硬條件：

```text
SJ_API_KEY 未設定 → fallback
盤外              → fallback
盤中              → Shioaji primary，失敗後 fallback
```

這導致：
- 盤後預設不走 Shioaji，容易落到 Yahoo/TWSE fallback。
- Azure App Service 對 Yahoo Finance outbound 可能 timeout，造成前端 15s axios timeout。
- Shioaji WebSocket 明明有 tick/cache，HTTP request 仍可能因 Circuit Breaker 或盤外判斷而走 Yahoo。
- 各 router 重複定義 `primary/fallback`，維護成本高。

**新資料源順位**：

```text
盤中：
  Shioaji → Yahoo

盤後：
  Shioaji → TWSE → Yahoo
```

**語意定義**：
- 盤中 Shioaji：使用 fresh tick / cached quote / snapshot，取得即時成交價。
- 盤後 Shioaji：使用 Shioaji snapshot 或 kbars 取得當日 close。
- 盤後 TWSE：作為 Shioaji 無資料時的官方收盤價備援，主要支援上市 TSE。
- Yahoo：最後備援，避免 Azure 正式環境常態打 Yahoo。

**重要決策**：
- `is_market_open()` 不再決定「能不能使用 Shioaji」，只決定 Shioaji provider 內部取資料方式。
- Yahoo-only 模式仍保留：`SJ_API_KEY` 未設定時直接走 TWSE/Yahoo fallback，不嘗試 Shioaji。
- 每日快照雖排程為 14:00，但實務常在 16:00-17:00 才執行；此時 Shioaji 盤後 close 已足夠穩定，可作為主要來源。

---

#### QUOTE-B-02 🔲 建立 `services/quote_service.py`

**需求**：集中個股報價取得邏輯，避免 router 重複包 `api_switch_call()`。

**建議介面**：

```python
async def get_quote(stock_id: str) -> dict:
    """取得單一個股報價，回傳既有 StockQuote camelCase 結構。"""

async def get_quotes(stock_ids: list[str]) -> dict[str, dict]:
    """批次取得個股報價，內部並行但需控制 timeout / fallback。"""
```

**回傳欄位維持相容**：

```json
{
  "stockId": "2330",
  "name": "2330",
  "price": 0,
  "change": 0,
  "changePercent": 0,
  "high": 0,
  "low": 0,
  "volume": 0,
  "marketStatus": "TRADING | CLOSED",
  "updatedAt": 0,
  "quoteSource": "shioaji | twse | yahoo | unknown",
  "quoteStatus": "ok | stale | timeout | error | unavailable",
  "quoteMessage": "報價逾時"
}
```

**Quote Source / Status 規格**：

```python
QuoteSource = Literal["shioaji", "twse", "yahoo", "unknown"]
QuoteStatus = Literal["ok", "stale", "timeout", "error", "unavailable"]
```

- `quoteSource` 只表示真正的資料來源；正常來源為 `shioaji`、`twse`、`yahoo`。
- `unknown` 代表本輪沒有取得有效報價，屬於非正常狀態。
- 不使用 `cache` 作為 source；若未來使用舊快取救援，應保留原始來源並標示 `quoteStatus: "stale"`。
- `quoteStatus: "ok"`：本輪成功取得有效報價。
- `quoteStatus: "timeout"`：資料源超時，回傳占位資料避免前端卡住。
- `quoteStatus: "error"`：資料源例外。
- `quoteStatus: "unavailable"`：無資料，例如停牌、合約不存在、盤後資料尚未產生。
- `quoteMessage` 選填；用於診斷與前端 tooltip，不應包含敏感資訊。

**內部 provider 流程**：

```text
get_quote(stock_id)
  ├─ 若 shioaji_enabled()
  │    ├─ 盤中：try Shioaji tick/snapshot quote
  │    └─ 盤後：try Shioaji snapshot/kbars close
  ├─ 若盤後：try TWSE closing price（TSE only）
  └─ try Yahoo Finance
```

**資料來源標記（正式 DTO）**：
- 正式報價 endpoint 應回傳 `quoteSource` / `quoteStatus`，讓前端 Table 可顯示本輪資料來源。
- 欄位需保持向後相容：舊前端忽略新欄位仍可正常運作。

---

#### QUOTE-B-03 🔲 Shioaji Provider：盤中與盤後策略

**盤中策略**：

1. `subscribe_stock(stock_id)`
2. 讀 `get_fresh_quote(stock_id)`
3. 若 fresh tick 存在，立即回傳。
4. 若剛訂閱尚未有 tick，不應計入 Shioaji Circuit Breaker failure；可短暫等待或直接進 fallback。

**盤後策略**：

優先順序建議：

```text
Shioaji snapshot close → Shioaji kbars 今日 Close
```

實作注意：
- Snapshot 的 `close` 在盤中代表最新成交價；盤後可視為當日收盤價。
- Kbars 今日最後一根 `Close` 可作為盤後 close；需確認日期為台灣今日交易日。
- 盤後資料若 price <= 0 或日期不符，視為無資料，繼續 TWSE/Yahoo fallback。
- Shioaji provider timeout 必須短，避免 request 卡死；建議單股 1-3 秒內失敗轉 fallback。

---

#### QUOTE-B-04 🔲 Circuit Breaker 重整

**目標**：Circuit Breaker 應保護「資料源真的故障」，不應把正常的暫時無 tick 當作故障。

**規格**：
- `_NoTickYet` / `NoQuoteAvailable` / `StaleQuote` 不計入 Shioaji CB failure。
- Shioaji 登入失敗、合約不存在、API exception、snapshot/kbars exception 才計入 failure。
- Shioaji CB 不應因單一冷門股票無成交而讓所有股票 60 秒內都改走 Yahoo。
- 可考慮改為：
  - 全域 Shioaji 連線 CB：保護 login / snapshot / API 連線層。
  - 單股無資料不進 CB，只走 fallback。

**狀態輸出**：
- `/api/v1/system/status` 保留：
  - `apiSwitch.source`
  - `apiSwitch.circuit.state`
  - `apiSwitch.circuit.failureCount`
  - `marketOpen`
  - `shioajiEnabled`
- 若 Quote Service 導入多 provider，可新增診斷欄位：
  - `providers.shioaji.enabled/connected/initialized`
  - `providers.yahoo.circuit`
  - `providers.twse.circuit`

---

#### QUOTE-B-05 🔲 Router 接線調整

**受影響端點**：

| Endpoint | 調整 |
|----------|------|
| `GET /api/v1/stocks/{id}/quote` | 改呼叫 `quote_service.get_quote(stock_id)` |
| `GET /api/v1/holdings` | 持股資料仍從 Firestore；報價注入改呼叫 `quote_service.get_quotes(active_ids)` |
| `GET /api/v1/holdings/prices` | 改呼叫 `quote_service.get_quotes(active_ids)` |
| `GET /api/v1/watchlist` | 報價 enrich 改呼叫 `quote_service.get_quotes()` 或單股 get_quote |
| `GET /api/v1/market/indices` | 可暫保留 Yahoo + Shioaji patch；後續再獨立抽 market quote provider |

**前端相容性**：
- 不改現有 API path。
- 既有欄位不移除；新增 `quoteSource`、`quoteStatus`、`quoteMessage?`。
- `/holdings/prices` 仍回批次 list，不讓前端逐股打報價。
- `/holdings/prices` 每筆股票皆須帶 `quoteSource` / `quoteStatus`，因為同一輪批次內可能部分股票走 Shioaji、部分 fallback 到 TWSE/Yahoo、部分 timeout。

---

#### QUOTE-B-06 🔲 Timeout / Fallback / Azure 穩定性規格

**原則**：
- Shioaji 優先要快：有 cache/snapshot 就回，無資料快速 fallback。
- Yahoo 是最後備援，不可讓 Yahoo timeout 長時間佔住 executor worker。
- 批次報價不能因單一股票 timeout 拖垮整批結果。

**建議規格**：
- Shioaji 單股嘗試 timeout：1-3s。
- TWSE 單股 timeout：5-10s。
- Yahoo 單股 timeout：5-10s，但只作最後 fallback。
- `get_quotes()` 使用 `asyncio.gather(..., return_exceptions=True)`，單股失敗不影響其他股票。
- 批次報價可設定整體 timeout；後端 `/holdings/prices` 目標 3-5s 內回應，必須低於前端 axios 15s timeout。
- 超時股票不要略過，應回占位資料，讓前端知道本輪該股票報價失敗：

```json
{
  "stockCode": "2330",
  "currentPrice": 0,
  "change": 0,
  "changePct": 0,
  "unrealizedProfit": 0,
  "quoteSource": "unknown",
  "quoteStatus": "timeout",
  "quoteMessage": "本輪報價逾時"
}
```

- `/stocks/{id}/quote` 單股 endpoint 若所有 provider 都失敗，也應回 `success: true` + `price: 0` + `quoteStatus`，除非是明確的 request validation error。
- UI/業務層不可把 `currentPrice: 0` 解讀為真實股價；需搭配 `quoteStatus` 判斷。

---

#### QUOTE-B-07 🔲 診斷 Endpoint（供前端 SettingsModal 測試）

**新增路由建議**：`GET /api/v1/system/shioaji-test?stockId=2330`

**目的**：直接測 Shioaji direct，不經 Yahoo fallback，避免診斷時混淆。

**回傳範例**：

```json
{
  "enabled": true,
  "marketOpen": true,
  "manager": {
    "initialized": true,
    "connected": true,
    "subscribedStocks": 5,
    "cachedQuotes": 12,
    "cachedFutures": 1
  },
  "subscription": {
    "stockId": "2330",
    "subscribed": true,
    "hasFreshTick": true
  },
  "quote": {
    "price": 0,
    "change": 0,
    "changePercent": 0,
    "source": "shioaji"
  },
  "elapsedMs": 42
}
```

**注意**：
- 不回傳 API key / secret / auth header。
- 此 endpoint 可受現有 EasyAuth 保護。
- 若 Shioaji 未啟用，回傳 200 + 狀態，不必 500。

---

#### QUOTE-B-08 🔲 測試與驗收

**單元/整合測試**：
- `SJ_API_KEY` 未設定：不呼叫 Shioaji，走 TWSE/Yahoo fallback。
- 盤中：Shioaji 成功時不呼叫 Yahoo。
- 盤中：Shioaji 無 fresh tick 不計入 CB failure，且可 fallback Yahoo。
- 盤後：Shioaji close 成功時不呼叫 TWSE/Yahoo。
- 盤後：Shioaji 無資料 → TWSE → Yahoo。
- TWSE 僅支援 TSE；OTC 應跳過 TWSE 或回 None 後走 Yahoo。
- `get_quotes()` 單股失敗不影響其他股票。
- `get_quotes()` 單股 timeout 時回 `quoteSource: "unknown"`、`quoteStatus: "timeout"`、價格欄位為 0。
- 正常 Shioaji/TWSE/Yahoo 成功時回 `quoteStatus: "ok"`，且 `quoteSource` 對應實際來源。
- stale cache 救援時不回 `quoteSource: "cache"`，而是保留原始來源並回 `quoteStatus: "stale"`。

**手動驗收**：
- 盤中 Azure 前端 5 秒輪詢不再常態 timeout。
- `/api/v1/system/status` 顯示 Shioaji initialized/connected，CB 不因 `_NoTickYet` 快速 OPEN。
- `/api/v1/holdings/prices` 在 Azure 回應時間低於前端 15s timeout。
- 即使 Yahoo timeout，`/api/v1/holdings/prices` 仍在 timeout 前回傳含占位資料的 list。
- SettingsModal 診斷工具可看出 Shioaji direct 是否正常，以及正式 quote endpoint 是否被 fallback 拖慢。

---

## 待辦：個股交易策略模組（STRAT）(暫不開發)

> 新功能模組。AI 透過 MCP 分析個股後，將結構化交易策略寫入 DB；前端從 API 讀取並顯示。

---

#### STRAT-B-01 🔲 Firestore Schema + Router（策略 CRUD）

**需求**：提供 REST API 供前端與 MCP 讀寫個股交易策略，每支股票每日一筆（upsert by date），保留歷史紀錄。

**Firestore 集合設計**：

```
stock_strategies/
  {stockId}/            ← 文件 ID = 股票代號（e.g. "2330"）
    records/
      {YYYY-MM-DD}/     ← 文件 ID = 日期，upsert（同一天再存覆蓋）
        entry_price_min:    number
        entry_price_max:    number
        stop_loss_price:    number
        stop_loss_pct:      number   # 負值，e.g. -8.5
        take_profit_price:  number
        take_profit_pct:    number   # 正值，e.g. 15.0
        holding_period:     string   # "short" | "swing" | "long"
        ai_comment:         string   # max 150 字
        created_at:         string   # ISO datetime（首次建立）
        updated_at:         string   # ISO datetime（每次更新）
```

**新增路由**：`routers/strategies.py`，前綴 `/api/v1/strategies`

| Method | Path | 說明 |
|--------|------|------|
| `GET` | `/{stockId}` | 取得最新一筆策略（依日期降冪取第一筆）；無資料回 `data: null` |
| `GET` | `/{stockId}?date=YYYY-MM-DD` | 取得指定日期策略；無資料回 `data: null` |
| `POST` | `/{stockId}` | 新增/更新策略（upsert today's date）；`updated_at` 每次更新；`created_at` 僅首次寫入 |

**實作規格**：

```python
# schemas/strategies.py
from pydantic import BaseModel, Field
from typing import Literal

class StrategyUpsert(BaseModel):
    entryPriceMin:    float = Field(alias="entryPriceMin", gt=0)
    entryPriceMax:    float = Field(alias="entryPriceMax", gt=0)
    stopLossPrice:    float = Field(alias="stopLossPrice", gt=0)
    stopLossPct:      float = Field(alias="stopLossPct", lt=0)    # 必須為負
    takeProfitPrice:  float = Field(alias="takeProfitPrice", gt=0)
    takeProfitPct:    float = Field(alias="takeProfitPct", gt=0)  # 必須為正
    holdingPeriod:    Literal["short", "swing", "long"] = Field(alias="holdingPeriod")
    aiComment:        str   = Field(alias="aiComment", max_length=150)

    model_config = {"populate_by_name": True}
```

- `POST` 傳入日期由後端決定（`datetime.now(tz=TW).strftime("%Y-%m-%d")`），不由前端指定
- `GET` 回傳欄位全數轉 camelCase（`_convert_keys` 同 MCP 做法）
- `created_at` 邏輯：先 `get()` 目標 doc，已存在則保留原 `created_at`；不存在則設為 `updated_at`
- `main.py` 加入 `app.include_router(strategies_router, prefix="/api/v1/strategies")`
- Route Map 補充 `/api/v1/strategies`

**驗收**：
- `POST /api/v1/strategies/2330` → 200，回傳寫入後的完整 camelCase DTO
- 同日再次 `POST` → `createdAt` 不變、`updatedAt` 更新
- `GET /api/v1/strategies/2330` → 200，回傳最新筆
- `GET /api/v1/strategies/9999` → 200，`data: null`（非 404）
- `stopLossPct` 傳正值 → 422；`aiComment` 超 150 字 → 422
- `pytest tests/` 通過（補 `tests/test_strategies.py`）

---

#### STRAT-B-02 🔲 MCP Tools：get_stock_strategy + save_stock_strategy

**需求**：讓 AI 在 Claude chat 中透過 MCP 讀取並儲存個股交易策略。

**新增 Tool**（`services/mcp_service.py`）：

| Tool | 參數 | 說明 |
|------|------|------|
| `get_stock_strategy` | `stock_id: str`, `date?: str (YYYY-MM-DD)` | 讀取策略，無資料回 `null` |
| `save_stock_strategy` | 見下方 | 儲存策略（呼叫內部 upsert 邏輯，與 POST API 共用）|

```python
# save_stock_strategy 參數
{
  "stock_id":          str,   # 股票代號
  "entry_price_min":   float, # 建議進場下限
  "entry_price_max":   float, # 建議進場上限
  "stop_loss_price":   float, # 止損價格
  "stop_loss_pct":     float, # 止損跌幅%（負值）
  "take_profit_price": float, # 目標獲利價格
  "take_profit_pct":   float, # 目標獲利漲幅%（正值）
  "holding_period":    str,   # "short" | "swing" | "long"
  "ai_comment":        str    # 綜合短評，max 150 字
}
```

- `save_stock_strategy` 內部直接呼叫 Firestore upsert 邏輯（不走 HTTP），與 STRAT-B-01 路由共用同一 service function
- `tools/list` 補充兩個新 Tool 的 schema
- `_convert_keys()` 已通用，可直接套用

**驗收**：
- `tools/list` 回傳包含 `get_stock_strategy`、`save_stock_strategy`
- `save_stock_strategy` 呼叫後 Firestore 有對應 doc 寫入
- `get_stock_strategy` 回傳 camelCase JSON；無資料時回傳 `{"content": [{"type": "text", "text": "null"}]}`
- `stop_loss_pct` 傳正值 → tool 回傳 error message（不寫入）

---

## 驗收策略

```bash
cd Back-End/python-backend
py -3.14 -m pytest tests/ -v   # 全套，目標 0 failures
```

**通用原則**：
- 每個任務完成後獨立跑一次 `pytest tests/`，確認不破壞現有測試
- 不修改前端接口結構與 Firestore collection 結構
