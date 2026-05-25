# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

These rules apply to every task in this project unless explicitly overridden.
Bias: caution over speed on non-trivial work. Use judgment on trivial tasks.

## Rule 1 — Think Before Coding
State assumptions explicitly. If uncertain, ask rather than guess.
Present multiple interpretations when ambiguity exists.
Push back when a simpler approach exists.
Stop when confused. Name what's unclear.

## Rule 2 — Simplicity First
Minimum code that solves the problem. Nothing speculative.
No features beyond what was asked. No abstractions for single-use code.
Test: would a senior engineer say this is overcomplicated? If yes, simplify.

## Rule 3 — Surgical Changes
Touch only what you must. Clean up only your own mess.
Don't "improve" adjacent code, comments, or formatting.
Don't refactor what isn't broken. Match existing style.

## Rule 4 — Goal-Driven Execution
Define success criteria. Loop until verified.
Don't follow steps. Define success and iterate.
Strong success criteria let you loop independently.

## Rule 5 — Use the model only for judgment calls
Use me for: classification, drafting, summarization, extraction.
Do NOT use me for: routing, retries, deterministic transforms.
If code can answer, code answers.

## Rule 6 — Token budgets are not advisory
Per-task: 4,000 tokens. Per-session: 30,000 tokens.
If approaching budget, summarize and start fresh.
Surface the breach. Do not silently overrun.

## Rule 7 — Surface conflicts, don't average them
If two patterns contradict, pick one (more recent / more tested).
Explain why. Flag the other for cleanup.
Don't blend conflicting patterns.

## Rule 8 — Read before you write
Before adding code, read exports, immediate callers, shared utilities.
"Looks orthogonal" is dangerous. If unsure why code is structured a way, ask.

## Rule 9 — Tests verify intent, not just behavior
Tests must encode WHY behavior matters, not just WHAT it does.
A test that can't fail when business logic changes is wrong.

## Rule 10 — Checkpoint after every significant step
Summarize what was done, what's verified, what's left.
Don't continue from a state you can't describe back.
If you lose track, stop and restate.

## Rule 11 — Match the codebase's conventions, even if you disagree
Conformance > taste inside the codebase.
If you genuinely think a convention is harmful, surface it. Don't fork silently.

## Rule 12 — Fail loud
"Completed" is wrong if anything was skipped silently.
"Tests pass" is wrong if any were skipped.
Default to surfacing uncertainty, not hiding it.

---

## Repository Layout

```
Back-End/
├── python-backend/   # 現役主後端（Python FastAPI，Azure App Service）
└── Task_Backend.md   # 開發任務清單與進度（Layer 1–2 優化已完成）
```

> **已清理**（2026-05-25）：`backend/`（Node.js Express）與 `Shioaji_API/`（舊 Shioaji 微服務）已移除。
> Shioaji 邏輯已整合至 `python-backend/services/shioaji_manager.py`。

---

## Python Backend (`python-backend/`)  ← 現役主後端

### Venv Setup

```bash
cd Back-End/python-backend
py -3.14 -m venv .venv       # 首次建立
.venv\Scripts\activate       # Windows 啟動
pip install -r requirements.txt
```

### Common Commands

```bash
cd Back-End/python-backend
.venv\Scripts\activate

uvicorn main:app --reload --port 8000   # 本機開發
pytest tests/ -v                        # 測試套件（全套）
pytest tests/test_m6_mcp.py -v          # 單一模組測試
pytest tests/ -v -k "holdings"          # 關鍵字篩選測試
```

### Testing Patterns

- `pytest.ini`：`asyncio_mode = auto`（所有 async 測試自動偵測，無需 `@pytest.mark.asyncio`）
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

### Architecture

```
python-backend/
├── main.py                 # FastAPI app + lifespan（Firestore 預熱 + Shioaji init/shutdown）+ EasyAuth middleware
├── core/                   # 共用基礎設施（無業務邏輯）
│   ├── settings.py         # pydantic_settings.BaseSettings + @lru_cache get_settings()
│   └── executors.py        # 共用 ThreadPoolExecutor(16) + yahoo/twse/ndc Semaphore
├── routers/                # 路由層
│   ├── holdings.py         # 持股 CRUD + prices + tags 嵌套
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
│   └── mcp.py              # MCP Server（SSE + Streamable HTTP + JSON-RPC 2.0）
├── services/
│   ├── firestore.py        # Firestore 單例（讀 core/settings）
│   ├── yahoo_finance.py    # Yahoo v8/v10 直接 HTTP（yfinance 已移除）；使用共用 executor + semaphore + CB
│   ├── shioaji_manager.py  # WebSocket tick 訂閱、quote cache
│   ├── api_switch.py       # CircuitBreaker（async，Shioaji）+ SyncCircuitBreaker（sync，Yahoo/TWSE/NDC）
│   ├── cache.py            # TTL 快取（OrderedDict LRU，maxsize=512，threading.Lock）
│   ├── rate_helper.py      # 即時匯率 Map
│   ├── snapshot_service.py # 快照自動記錄（VIX + marketStateAuto；不含風險重算）
│   ├── tag_risk_service.py # 動態風險重算（volRatio + presets；使用共用 executor）
│   └── mcp_service.py      # MCP 18 個 Tool 實作 + _convert_keys() camelCase 轉換
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
| `/api/v1/holdings` | 持股 CRUD、即時報價、排序、重算 |
| `/api/v1/holdings/:stockCode/tags` | 持股 Tag 嵌套操作（POST/PUT/DELETE） |
| `/api/v1/transactions` | 交易紀錄 |
| `/api/v1/market` | 指數、匯率、出口指標 |
| `/api/v1/stocks` | 股票清單、個股報價、K 線、基本面、籌碼 |
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
| `/api/v1/system` | 系統狀態（apiSwitch + Shioaji） |
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
ndc_sem   = threading.Semaphore(2)   # NDC 並行限制
```

所有 IO 操作（報價、K線、籌碼、快照、風險重算）統一使用 `get_executor()` 取得共用 executor。

**⚠️ Executor 死鎖防範**：若外層任務已占用 executor worker，內層任務不可再 submit 到同一 executor（否則所有 16 個 worker 都在等待永遠無法被排程的內層任務）。
現況：`get_chip()` 的外層 `executor.submit(_fetch_chip_day)` 中，`_fetch_chip_day()` 改為**循序**呼叫三個 TWSE endpoint，避免內層再次 submit。

### Data Source Switching（Shioaji ↔ Yahoo Finance）

`SJ_API_KEY` 未設定時全程使用 Yahoo Finance（Yahoo-only 模式）。有設定時：

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

受 `api_switch_call` 控制的端點：`GET /market/indices`（TAIEX + 台指期 patch）、`GET /stocks/{id}/quote`、`GET /holdings`、`GET /holdings/prices`、`GET /watchlist`。

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
| **Singleton** | settings / preferences / plan_config / tag_correlation_matrix / rebalance_rules / market_state | `main` / `default` / `main` / `main` / `main` / `main` |
| **單一 Map 文件** | stock_list | `data` |

- Firestore 欄位：**snake_case**；API 回傳：**camelCase**
- 例外：`preferences/default` 的 `chart.*` 欄位在 Firestore 即為 camelCase
- Singleton 無資料時回傳預設值（不拋錯），除 `settings` 回傳 `null`

### MCP Server

三個端點共用 `_handle_rpc()` 邏輯：
- `GET  /api/v1/mcp/sse`     — SSE 長連線（發送 `endpoint` event 指向 message URL）
- `POST /api/v1/mcp`         — Streamable HTTP（MCP 2025-03-26；`--transport http` 推薦）
- `POST /api/v1/mcp/message` — SSE transport 的訊息端點（向下相容）

API Key：`?key=<MCP_ACCESS_KEY>`；`MCP_ACCESS_KEY` 未設定時跳過驗證（開發模式）；`MCP_ACCESS_KEY` 未設定且 `SKIP_AUTH != true` 時回 503。

支援方法：`initialize`、`tools/list`、`tools/call`、`notifications/*`（204 無回應）

**18 個 Tool**（實作於 `services/mcp_service.py`）：

| Tool | params | 說明 |
|------|--------|------|
| `get_holdings` | — | 持股清單，含 `currentPrice`/`currentValue` 即時並行注入 |
| `get_watchlist` | — | 自選股 |
| `get_market_indices` | — | 大盤指數 + 台指期 |
| `get_stock_quote` | `stock_id` | 個股即時報價 |
| `get_snapshots` | `year?`, `start_date?`, `end_date?`, `limit?` | 每日資產快照（支援日期範圍） |
| `get_tags` | — | Tag 設定 |
| `get_rebalance_rules` | — | 再平衡規則 |
| `get_foreign_assets` | — | 外幣 + 債券資產 |
| `get_asset_tags` | — | 個股 Tag 配置（多對多，含 weightRatio） |
| `get_tag_correlation_matrix` | — | Tag 相關性矩陣（ρ 值；無資料時回預設空結構） |
| `get_transactions` | `stock_id?` | 交易紀錄（依 date 升冪；可篩單一個股） |
| `get_stock_history` | `stock_id`, `start_date?`, `end_date?`, `interval?` | 歷史 K 線（OHLCV） |
| `get_stock_chip` | `stock_id`, `limit?` | 三大法人買賣超（Firestore 快取，每日同步，預設 20 筆） |
| `get_rebalance_snapshots` | `limit?` | 歷次再平衡建議快照（含 params + suggestions） |
| `get_portfolio_tag_analysis` | — | 投組 Tag 配置分析（actualWeight / deviation / holdings 貢獻度聚合） |
| `get_stock_fundamental` | `stock_id` | 個股基本面（Firestore 快取，由 FinMind 每日同步） |
| `query_stock_fundamental` | `stock_id` | **即時**從 FinMind API 查詢任意個股基本面（不限庫存，非快取） |
| `query_stock_chip` | `stock_id`, `start_date?`, `limit?` | **即時**從 FinMind API 查詢任意個股三大法人（不限庫存，非快取） |

回傳格式：`{"content": [{"type": "text", "text": "<camelCase JSON string>"}]}`

`_convert_keys()` 遞迴將所有 Firestore snake_case key 轉 camelCase，所有 tool 統一套用。

### Environment Variables

```env
# Firebase / Firestore
FIRESTORE_PROJECT_ID=nocode-finance
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json   # 本機開發
GOOGLE_APPLICATION_CREDENTIALS_JSON=<base64 JSON>         # Azure 部署（二擇一）

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

