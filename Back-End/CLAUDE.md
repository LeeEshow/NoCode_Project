# CLAUDE.md

---

## Repository Layout

```
Back-End/
├── python-backend/   # 現役主後端（Python FastAPI，GCE e2-micro asia-east1-b）
└── Task_Backend.md   # 開發任務清單與進度（Layer 1–2 優化已完成）
```

> **已清理**（2026-05-25）：`backend/`（Node.js Express）與 `Shioaji_API/`（舊 Shioaji 微服務）已移除。
> Shioaji 邏輯已整合至 `python-backend/services/shioaji_manager.py`。

---

## Python Backend (`python-backend/`)  ← 現役主後端

### Venv Setup

```bash
cd Back-End/python-backend
python -m venv .venv          # 首次建立（需 Python 3.13+；py -3.13 或 py -3.14 均可）
.venv\Scripts\activate        # Windows 啟動
pip install -r requirements.txt
```

### Common Commands

啟動 venv 後直接執行，或用 `.venv\Scripts\python.exe -m <cmd>`（Windows 不啟動 venv 時的備用方式）：

```bash
cd Back-End/python-backend
.venv\Scripts\activate

uvicorn main:app --reload --port 8000   # 本機開發
python -m pytest tests/ -v             # 測試套件（全套）
python -m pytest tests/test_m6_mcp.py -v   # 單一模組測試
python -m pytest tests/ -v -k "holdings"   # 關鍵字篩選測試
```

### Testing Patterns

- `pytest.ini`：`asyncio_mode = auto`（所有 async 測試自動偵測，無需 `@pytest.mark.asyncio`）；`asyncio_default_fixture_loop_scope = function`（每個測試獨立 event loop，避免 pytest-asyncio 0.24+ deprecation warning）
- `conftest.py` 提供 `client` fixture：`httpx.AsyncClient(follow_redirects=True)` + `ASGITransport(app=app)`，不啟動外部 server
- Firestore 使用**真實連線**（需本機 serviceAccountKey.json 或 GOOGLE_APPLICATION_CREDENTIALS_JSON）
- **驗證原則**：只驗結構（欄位存在、型別正確、camelCase）；不斷言具體數值（報價、金額）
- `follow_redirects=True` 是必要的：FastAPI 對尾斜線 URL（`/api/v1/watchlist/`）預設回 307，不設此選項會導致測試失敗

`tests/helpers.py` 提供四個斷言工具：
| 函式 | 用途 |
|------|------|
| `assert_success(res, status=200)` | 驗證 200 + `{success:true, data:...}` 並回傳 `data` |
| `assert_error(res, status)` | 驗證指定 status + `{success:false, error:...}` |
| `assert_keys(obj, keys)` | 驗證 dict 包含所有必要欄位 |
| `assert_no_snake(obj)` | 驗證 dict key 無底線（確保 camelCase） |

#### quote_service 測試注意事項

**`is_market_open` patch 必須打在 quote_service 的 local reference：**

```python
import services.quote_service as qs

# ✅ 正確
monkeypatch.setattr(qs, "is_market_open", lambda: True)

# ❌ 無效（quote_service 已 import 成 local reference，patch 來源不影響）
monkeypatch.setattr("utils.market_hours.is_market_open", lambda: True)
```

`is_market_open=True`（盤中）時 TWSE 步驟完全跳過，不需 mock `_is_tse` 或 TWSE。

**Circuit Breaker 重置**（`test_m4_market.py` 等測試 market/indices 端點時需要）：

```python
from services.api_switch import circuit_breaker

@pytest.fixture(autouse=True)
def reset_cb():
    circuit_breaker._state = "CLOSED"
    circuit_breaker._failure_count = 0
    circuit_breaker._opened_at = None
    yield
    circuit_breaker._state = "CLOSED"
    circuit_breaker._failure_count = 0
    circuit_breaker._opened_at = None
```

**quoteSource / quoteStatus 欄位**：整合測試（`test_m2_holdings.py` 等）只驗結構，不斷言具體數值；mock 測試（`test_quote_service.py`）才驗 source/status。

### POST Request Body 驗證模式

POST endpoint 一律用 Pydantic `BaseModel`，**不可用 `body: dict`**（無法自動驗證型別、不生成正確 OpenAPI schema）：

```python
from pydantic import BaseModel, field_validator

class QuotesRequest(BaseModel):
    codes: list[str]

    @field_validator("codes")
    @classmethod
    def codes_not_empty(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("codes 不可為空陣列")
        return v

@router.post("/quotes")
async def batch_quotes(body: QuotesRequest):
    ...
```

驗證失敗由 FastAPI 自動回 `422 Unprocessable Entity`（不需手動 `raise HTTPException(400, ...)`）。

### Architecture

```
python-backend/
├── main.py                 # FastAPI app + lifespan（Firestore 預熱 + Shioaji init/shutdown）+ EasyAuth middleware
├── core/                   # 共用基礎設施（無業務邏輯）
│   ├── settings.py         # pydantic_settings.BaseSettings + @lru_cache get_settings()
│   └── executors.py        # 共用 ThreadPoolExecutor(16) + yahoo/twse/ndc Semaphore
├── routers/                # 路由層
│   ├── holdings.py         # 持股 CRUD + tags 嵌套
│   ├── watchlist.py        # 自選股
│   ├── transactions.py     # 交易紀錄
│   ├── assets.py           # 外幣 + 債券資產
│   ├── plans.py            # 計畫設定
│   ├── tags.py             # Tag CRUD + 動態風險重算
│   ├── asset_tags.py       # asset_tags 集合 CRUD
│   ├── market_state.py     # 市場狀態切換
│   ├── correlation.py      # Tag 相關性矩陣
│   ├── rebalance.py        # 再平衡規則 + 快照
│   ├── market.py           # 大盤指數 / 匯率 / 出口燈號
│   ├── stocks.py           # 股票搜尋 / 報價 / K線 / 基本面 / 籌碼
│   ├── snapshots.py        # 每日資產快照（GET/POST/PUT；`/record` 觸發 BackgroundTask 重算風險）
│   ├── settings.py         # 應用設定
│   ├── preferences.py      # 使用者偏好
│   ├── system.py           # 系統狀態（apiSwitch + Shioaji 狀態）
│   ├── trading_strategies.py  # AI 交易策略 CRUD（singleton-per-stock，tranches[] 多批次結構）
│   ├── finmind_sync.py     # POST /finmind/sync（FinMind 每日同步 + evaluate_trigger_rules）
│   └── mcp.py              # MCP Server（SSE + Streamable HTTP + JSON-RPC 2.0）
├── services/
│   ├── firestore.py        # Firestore 單例（讀 core/settings）
│   ├── quote_service.py    # 所有股票報價的唯一入口（Shioaji tick cache → TWSE → Yahoo）
│   ├── yahoo_finance.py    # Yahoo v8/v10 直接 HTTP（yfinance 已移除）；使用共用 executor + semaphore + CB
│   ├── twse_finance.py     # TWSE 盤後報價（TSE only，4s timeout，有 SyncCircuitBreaker）
│   ├── finmind.py          # FinMind API 同步（基本面 + 三大法人）；每日排程呼叫
│   ├── shioaji_manager.py  # WebSocket tick 訂閱 + memory cache；startup warmup 批次訂閱
│   ├── api_switch.py       # CircuitBreaker（async，Shioaji）+ SyncCircuitBreaker（sync，Yahoo/TWSE/NDC）
│   ├── cache.py            # TTL 快取（OrderedDict LRU，maxsize=512，threading.Lock）
│   ├── rate_helper.py      # 即時匯率 Map
│   ├── snapshot_service.py # 快照自動記錄（VIX + marketStateAuto；不含風險重算）
│   ├── tag_risk_service.py # 動態風險重算（volRatio + presets；使用共用 executor）
│   └── mcp_service.py      # MCP 22 個 Tool 實作 + _convert_keys() camelCase 轉換；get_transactions 支援 start_date / end_date
├── utils/
│   └── market_hours.py     # is_market_open()（週一–五 09:00–13:30 UTC+8）
└── tests/                  # pytest 測試套件（全數通過）
```

### Route Map

所有路由前綴 `/api/v1`，回應格式統一：
- 成功：`{ "success": true, "data": ... }`
- 失敗：`{ "success": false, "error": "訊息" }`

| 前綴 | 功能 |
|------|------|
| `/api/v1/holdings` | 持股 CRUD、排序、重算（報價已移至 `POST /stocks/quotes`）|
| `/api/v1/holdings/:stockCode/tags` | 持股 Tag 嵌套操作（POST/PUT/DELETE） |
| `/api/v1/transactions` | 交易紀錄（支援 `stock_id` / `start_date` / `end_date` 篩選；Python-side 過濾，無需 Firestore 複合索引） |
| `/api/v1/market` | 指數、匯率、出口指標 |
| `/api/v1/stocks` | 股票清單、個股報價、K 線、基本面、籌碼；`POST /quotes` 批次報價（零 Firestore） |
| `/api/v1/snapshots` | 每日資產快照（GET/POST/PUT；`/record` 後端自算） |
| `/api/v1/tags` | Tag CRUD；`POST /recalculate-dynamic-risk` |
| `/api/v1/asset-tags` | 持股 Tag 關聯 CRUD |
| `/api/v1/tag-correlation-matrix` | 相關性矩陣（GET/PUT） |
| `/api/v1/market-state` | 市場狀態切換（GET/PUT） |
| `/api/v1/rebalance-rules` | 再平衡規則（GET/PUT） |
| `/api/v1/rebalance-snapshots` | 再平衡快照（GET/POST，append-only） |
| `/api/v1/foreign-assets` | 外幣 + 債券資產 |
| `/api/v1/watchlist` | 自選股 |
| `/api/v1/plan` | 計畫設定 |
| `/api/v1/settings` | 應用設定 |
| `/api/v1/preferences` | 使用者偏好 |
| `/api/v1/system` | 系統狀態（apiSwitch + Shioaji）；`POST /shioaji/reinitialize`（202，非同步重連） |
| `/api/v1/finmind` | FinMind 每日同步（`POST /sync`，收盤後批次寫入基本面 + 三大法人至 Firestore） |
| `/api/v1/trading-strategies` | AI 交易策略（GET/GET_one/PATCH_dismiss/PATCH_rule-status/DELETE；singleton-per-stock，tranches[] 多批次） |
| `/api/v1/mcp/sse` | MCP SSE 長連線（GET，bypass EasyAuth） |
| `/api/v1/mcp` | MCP Streamable HTTP（POST，bypass EasyAuth，MCP 2025-03-26 推薦） |
| `/api/v1/mcp/message` | MCP JSON-RPC 2.0 via SSE（POST，bypass EasyAuth，向下相容） |
| `/health` | Azure warmup probe（無 `/api/v1` 前綴） |

### Middleware 順序

```
CORS（最外層）
  → EasyAuth（X-MS-CLIENT-PRINCIPAL 驗證；以下情況 bypass）
      ├─ SKIP_AUTH=true（本機開發）
      ├─ 路徑：/health、/docs、/openapi.json、/redoc
      ├─ 方法：OPTIONS
      ├─ 路徑前綴：/api/v1/mcp/*
      └─ Header：X-Cron-Token: <CRON_SECRET>（排程工作，user_id="cron"）
    → Router
```

### Settings Centralization（`core/settings.py`）

`pydantic_settings.BaseSettings` + `@lru_cache` 的 `get_settings()`。讀取 `.env` 並做型別轉換。

**⚠️ 重要例外：`mcp.py` 的 `_check_key()` 必須直接使用 `os.getenv()`，不可用 `get_settings()`。**

原因：`@lru_cache` 在第一次 import 時快取 Settings 物件；pytest `monkeypatch.delenv("MCP_ACCESS_KEY")` 只修改 `os.environ`，無法影響已快取的物件，導致測試收到 401。安全驗證邏輯需要每次 request 讀取最新環境變數，所以使用 `os.getenv()` 直讀。

`get_settings()` 適用於啟動時讀取一次、不隨 request 變化的設定（`main.py`、`firestore.py`、`api_switch.py`）。

### Shared Executor & Semaphores（`core/executors.py`）

```python
_io_executor = ThreadPoolExecutor(max_workers=16, thread_name_prefix="io-worker")
yahoo_sem = threading.Semaphore(8)   # Yahoo Finance 並行限制
twse_sem  = threading.Semaphore(5)   # TWSE 並行限制
```

> `ndc_sem` 已於 2026-06-05 隨景氣燈號功能一併移除。

所有 IO 操作（報價、K線、籌碼、快照、風險重算）統一使用 `get_executor()` 取得共用 executor。

**⚠️ Executor 死鎖防範**：若外層任務已占用 executor worker，內層任務不可再 submit 到同一 executor（否則所有 16 個 worker 都在等待永遠無法被排程的內層任務）。
現況：`get_chip()` 的外層 `executor.submit(_fetch_chip_day)` 中，`_fetch_chip_day()` 改為**循序**呼叫三個 TWSE endpoint，避免內層再次 submit。

---

### Event Loop 保護原則（2026-05-31 確立）

#### 規則 A：`async def` vs `def` — endpoint 分類

| 情況 | 寫法 | 說明 |
|------|------|------|
| endpoint 只做 Firestore CRUD，無 `await` 其他 async call | **`def`** | FastAPI 自動丟入 threadpool；Firestore 慢查不阻塞 event loop |
| endpoint 需要 `await` 其他 async 函式（如 `api_switch_call`、`quote_service.get_quote`） | **`async def`** | 必須保持 async；Firestore 操作改用 `asyncio.to_thread()` 包裝 |

**已確認為 `def` 的 router**：`transactions.py`、`asset_tags.py`、`correlation.py`、`settings.py`、`rebalance.py`、`plans.py`、`trading_strategies.py`（全部 endpoint 皆為純 Firestore CRUD）

**新增 endpoint 前必須先判斷分類**，不可預設用 `async def`。

#### 規則 B：async 函式禁止丟進 `run_in_executor`

```python
# ❌ 錯誤：get_quote 是 async function，executor 只拿到 coroutine object
q = await loop.run_in_executor(None, get_quote, stock_id)

# ✅ 正確：直接 await
q = await get_quote(stock_id)
```

`run_in_executor` 只能包**同步**函式（`def`）。async 函式直接 `await`；若需在 sync 環境呼叫 async 函式，用 `asyncio.run_coroutine_threadsafe()`。

#### 規則 C：外部 I/O 四件套

每個對外部服務（Yahoo、TWSE、NDC、FinMind）的呼叫都必須有：
1. **timeout**：`asyncio.wait_for(..., timeout=N)`
2. **semaphore**：`yahoo_sem / twse_sem / ndc_sem`（來自 `core/executors.py`）
3. **circuit breaker**：`yahoo_cb / twse_cb / ndc_cb`（來自 `api_switch.py`）
4. **fallback/placeholder**：失敗不拋錯，回傳 null 或預設值

缺任何一件的 PR 應在 code review 階段擋下。

#### 規則 D：不在共用 executor 內再 submit 共用 executor

`get_executor()` 取得的 threadpool（max_workers=16）內的 worker 不可再 `submit` 到同一個 executor，否則會 deadlock（所有 worker 等待永遠不會被排程的內層任務）。

#### 規則 E：長任務不掛在 request lifecycle

FinMind sync、動態風險重算、批次暖身等任務必須走 `BackgroundTasks` 或獨立排程，不可在 HTTP request 內同步執行。request 只觸發，立即回 200。

---

### Data Source Switching（Shioaji ↔ Yahoo Finance）

**個股報價**（holdings / watchlist / stocks quote）統一由 `services/quote_service.py` 處理，provider 順位：

```
盤中：Shioaji tick cache（記憶體，無 HTTP）→ Yahoo（5s）
盤後：Shioaji tick cache（記憶體）→ TWSE（4s，TSE only）→ Yahoo（5s）
```

- `SJ_API_KEY` 未設定 → Yahoo-only 模式（TWSE → Yahoo），完全不走 Shioaji。
- Shioaji tick cache 超過 120 秒 → `_is_fresh()` 回 False，視為過期，走 Yahoo fallback。
- 未訂閱的股票 → 背景呼叫 `subscribe_stock()`，首次 tick 尚未到達直接 fallback（不阻塞熱路徑）。
- 批次 fallback 並行，總 deadline `_FALLBACK_DEADLINE = 9.0s`（< 前端 15s axios timeout）。

**大盤指數**（`GET /market/indices`）仍使用 `api_switch_call()`：

```
api_switch_call(primary, fallback)
  ├─ SJ_API_KEY 未設定   → fallback（Yahoo Finance）
  ├─ 盤外                → fallback
  ├─ 盤中 + CB OPEN      → fallback（冷卻 60s）
  ├─ 盤中 + CB HALF_OPEN → primary 試跑，成功 CLOSED / 失敗 fallback
  └─ 盤中 + CB CLOSED    → primary（ShioajiManager WebSocket tick）
```

`api_switch.py` 內有兩種 Circuit Breaker：
- `CircuitBreaker`（async）：給 Shioaji WebSocket（`api_switch_call` 使用）
- `SyncCircuitBreaker`（sync）：給 Yahoo Finance、TWSE、NDC HTTP 請求，各自獨立實例 `yahoo_cb`、`twse_cb`、`ndc_cb`

**⚠️ `api_switch_call()` 目前只被 `routers/market.py` 使用**（TAIEX + 台指期）。持股、自選股、個股報價的 provider 切換邏輯已全部移至 `quote_service.py`。

**⚠️ `CircuitOpenError` 捕捉規則**：CB OPEN 時 raise `CircuitOpenError(RuntimeError)`。`except` 時**必須用 `CircuitOpenError` 而非 `RuntimeError`** 捕捉，否則會誤判 Shioaji 自身拋出的 RuntimeError，導致本應傳播的錯誤被吞掉。

### Shioaji Manager（`services/shioaji_manager.py`）

**⚠️ 安裝版本：shioaji 1.5.0**（`requirements.txt` 為 `shioaji>=1.2.0`，實際鎖定於 1.5.0）

#### shioaji 1.5.0 破壞性變更（vs 1.3.x）

| 項目 | 舊版（1.3.x） | 1.5.0 |
|------|--------------|--------|
| 個股漲跌欄位 | `tick.price_chg` | `tick.diff_price` |
| 個股漲跌幅欄位 | `tick.pct_chg`（int，1/100 %，需 `/100`）| `tick.diff_rate`（**int**，1/100 %，仍需 `/100`）|
| snapshot 漲跌幅 | `snap.change_rate`（int，1/100 %，需 `/100`）| `snap.change_rate`（**float**，直接為 %，**不需 `/100`**）|
| 成交量欄位 | `tick.total_volume` | `tick.vol_sum` |
| 時間戳欄位 | `tick.datetime`（`datetime` 物件） | `tick.datetime`（7 元素 tuple：`(year, month, day, hour, minute, second, microsecond)`，需用 `datetime(*tick.datetime, tzinfo=_TZ_TAIPEI)` 解開）|
| TXF 合約迭代 | `for c in api.Contracts.Futures.TXF` 可用 | 拋 `TypeError: argument 'code': 'int' object is not an instance of 'str'`，**禁止 iterate** |

#### TXF 合約查詢規則（1.5.0）

`Contracts.Futures.TXF` 的 `ContractGroup` 無法 iterate（1.5.0 bug），改用**直接代碼查詢**：

```python
# 月份代碼：A=1月, B=2月, ..., L=12月；年份取個位數
# 當月: TXFF6（2026/06）；下月: TXFG6（2026/07）
contract = api.Contracts.Futures["TXFF6"]
```

`_get_nearest_txf()` 使用 offset 0（當月）→ offset 1（下月）依序試，任一成功即返回。

使用 **WebSocket tick 訂閱 + memory cache**，平時個股報價不走 HTTP：

- 啟動時批次訂閱持股 + 關注清單（`warmup_stocks()`），並呼叫一次 `api.snapshots()` 預填 cache（解決 9:20 開盤延遲問題）。
- Tick push 到 callback → 更新 `_stock_cache`；`get_cached_stock(stock_id)` 讀取 memory cache，回傳 `dict | None`（None 代表無 cache 或已過期）。
- `is_subscribed(stock_id)` — 是否已訂閱 WebSocket tick。
- `subscribe_stock(stock_id)` — 即時訂閱，async，由 `quote_service` 在未命中時以 `ensure_future` 背景呼叫（不阻塞熱路徑）。
- `subscribe_stocks(stock_ids)` — 批次訂閱，async，啟動暖身與批次報價未命中時使用。
- `api.snapshots()` 保留使用場景：啟動暖身（一次性）、`GET /system/shioaji-test`（診斷用）。

**⚠️ 訂閱去重機制（`_subscribing_stocks`）**：

`_subscribing_stocks: set[str]` 追蹤「訂閱進行中」的股票，防止並發 request 重複建立 WebSocket 訂閱：

- `subscribe_stock`：進入時檢查 `_subscribing_stocks`，加入後執行訂閱，`finally` 移除（不管成敗）。
- `subscribe_stocks`：算出 `to_sub` 後**立即** `update(_subscribing_stocks)`，再開始批次訂閱，`finally` 逐一 `discard`。
- `cleanup`：`_subscribing_stocks.clear()`。

新增訂閱邏輯時必須遵守同樣的 check-mark-finally 模式，否則 batch + single 並發時仍可能重複訂閱。
- `_snap_single_sem = Semaphore(3)` 限制診斷端點的並行 snapshot 呼叫（不在報價熱路徑上）。
- TAIEX（code="001"）和台指期（TXF）仍使用 tick 訂閱，供 `GET /market/indices` 使用。

### Snapshot Risk Recalculation（BackgroundTask）

`POST /snapshots/record` 流程：
1. 同步計算並寫入今日快照（含 VIX + `marketStateAuto`）
2. 立即回應 200（不阻塞）
3. FastAPI `BackgroundTasks` 非同步執行 `_bg_recalculate_risk()`：讀取 `market_state/main`，呼叫 `recalculate_dynamic_risk()`

風險重算失敗只寫 error log，不影響快照記錄的回應。

### Firestore Collection Design

| 類型 | 集合 | Document ID |
|------|------|-------------|
| **一般集合** | holdings / transactions / watchlist / foreign_assets / daily_snapshots / tags / asset_tags / rebalance_snapshots | stockId / UUID / 日期（YYYY-MM-DD） |
| **singleton-per-stock** | trading_strategies | stockCode（每支股票最多一筆，AI 覆寫不堆疊） |
| **Singleton** | settings / preferences / plan_config / tag_correlation_matrix / rebalance_rules / market_state | `main` / `default` / `main` / `main` / `main` / `main` |
| **單一 Map 文件** | stock_list | `data` |

- Firestore 欄位：**snake_case**；API 回傳：**camelCase**
- 例外：`preferences/default` 的 `chart.*` 與 `wlCollapsedGroups` 欄位在 Firestore 即為 camelCase（`_from_firestore` 直讀，不做 snake_case 轉換）
- Singleton 無資料時回傳預設值（不拋錯），除 `settings` 回傳 `null`

### FinMind API 欄位對照

| Dataset | 關鍵欄位 |
|---------|---------|
| `TaiwanStockInstitutionalInvestorsBuySell` | `name` 為英文（`Foreign_Investor`、`Investment_Trust`、`Dealer_self` 等）；buy/sell 單位為**股**，÷1000 = 張 |
| `TaiwanStockDividend` | 現金股利：`CashEarningsDistribution`；除息日：`CashExDividendTradingDate` |
| `TaiwanStockFinancialStatements` | 淨利：`IncomeAfterTaxes`；無 Equity 欄位（ROE 暫為 null） |
| `TaiwanStockPER` | `PER`、`PBR`（每日更新） |
| `TaiwanStockMonthRevenue` | `revenue`、`revenue_month`、`revenue_year` |
| `TaiwanStockInfo` | `stock_name`、`type`（`twse`/`otc`） |

### 每日排程（`.github/workflows/daily-snapshot.yml`）

UTC 06:00 / 台灣 14:00，依序執行：
1. `POST /api/v1/snapshots/record`（快照 + 背景風險重算）
2. `POST /api/v1/finmind/sync`（基本面 + 三大法人，共用 `X-Cron-Token`）

### MCP Server

三個端點共用 `_handle_rpc()` 邏輯：
- `GET  /api/v1/mcp/sse`     — SSE 長連線（發送 `endpoint` event 指向 message URL）
- `POST /api/v1/mcp`         — Streamable HTTP（MCP 2025-03-26；`--transport http` 推薦）
- `POST /api/v1/mcp/message` — SSE transport 的訊息端點（向下相容）

API Key：`?key=<MCP_ACCESS_KEY>`；`MCP_ACCESS_KEY` 未設定時跳過驗證（開發模式）；`MCP_ACCESS_KEY` 未設定且 `SKIP_AUTH != true` 時回 503。

支援方法：`initialize`、`tools/list`、`tools/call`、`notifications/*`（204 無回應）

**22 個 Tool** 實作於 `services/mcp_service.py`（完整 params 與說明見該檔案 `_TOOLS` 定義，或呼叫 `tools/list` JSON-RPC 取得）。

回傳格式：`{"content": [{"type": "text", "text": "<camelCase JSON string>"}]}`

`_convert_keys()` 遞迴將所有 Firestore snake_case key 轉 camelCase，所有 tool 統一套用。

### Environment Variables

```env
# Firebase / Firestore
FIRESTORE_PROJECT_ID=nocode-finance
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json   # 本機開發
GOOGLE_APPLICATION_CREDENTIALS_JSON=<base64 JSON>         # GCE 部署（二擇一）

# Server
PORT=8000
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000  # production 設定為前端域名

# Auth（main.py 與 conftest.py 均讀取 SKIP_AUTH）
SKIP_AUTH=true   # 本機開發：跳過 EasyAuth

# 排程工作 bypass（選填；設定後 X-Cron-Token header 可繞過 EasyAuth）
CRON_SECRET=<自訂 UUID>

# Shioaji（選填；未設定則全程使用 Yahoo Finance）
SJ_API_KEY=<永豐金 API Key>
SJ_SECRET_KEY=<永豐金 Secret Key>

# MCP（選填；未設定時 MCP 端點不需 Key）
# production 必填；未設定且 SKIP_AUTH != true 時 MCP 端點回 503
MCP_ACCESS_KEY=<自訂 UUID>
```

