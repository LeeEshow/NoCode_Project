# CLAUDE.md
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

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Layout（當前狀態）

```
Back-End/
├── python-backend/   # ✅ 現役主後端（Python FastAPI，Azure App Service）
├── backend/          # ⚠️ 待刪除：Node.js Express（已下線，保留供比對）
├── Shioaji_API/      # ⚠️ 待刪除：舊 Python Shioaji 微服務（已下線，已整合進 python-backend）
└── Task_Backend.md   # 開發任務清單與進度（v4.0，所有里程碑已完成）
```

---

## ⚠️ 清理計畫（下次上線前執行）

**目標**：驗證 `python-backend` 無重大 Bug 後，刪除舊服務目錄。

### 驗證清單

1. **所有 pytest 通過**
   ```bash
   cd Back-End/python-backend
   pytest tests/    # 目前：121/121 passed（2026-05-22）
   ```

2. **前端實際操作確認**（手動測試）
   - 持股列表載入、報價輪詢（含盤中 Shioaji / 盤外 Yahoo 切換）
   - 關注清單、買進判斷
   - 台股大盤 + 台指期 即時更新
   - 快照記錄（`POST /snapshots/record`）
   - 再平衡計算、設定儲存

3. **Azure 監控確認**：App Service Logs 無 5xx 錯誤，回應時間正常

### 驗證通過後執行

```bash
# 刪除舊服務目錄
git rm -r Back-End/backend
git rm -r Back-End/Shioaji_API
git commit -m "chore: remove deprecated Node.js backend and Shioaji microservice"
```

> **注意**：刪除前確認 Azure App Service `finance-backend`（Node.js）與 `finance-shioaji` 已停止服務。

---

## Python Backend (`python-backend/`)  ← 現役主後端

### Common Commands

```bash
cd Back-End/python-backend
py -3.14 -m uvicorn main:app --reload --port 8000   # 本機開發
py -3.14 -m pytest tests/ -v                        # 測試套件（全套）
py -3.14 -m pytest tests/test_m6_mcp.py -v          # 單一模組測試
py -3.14 -m pytest tests/ -v -k "holdings"          # 關鍵字篩選測試
```

### Testing Patterns

- `pytest.ini`：`asyncio_mode = auto`（所有 async 測試自動偵測，無需 `@pytest.mark.asyncio`）
- `conftest.py` 提供 `client` fixture：`httpx.AsyncClient` + `ASGITransport(app=app)`，不啟動外部 server
- Firestore 使用**真實連線**（需本機 serviceAccountKey.json 或 GOOGLE_APPLICATION_CREDENTIALS_JSON）
- **驗證原則**：只驗結構（欄位存在、型別正確、camelCase）；不斷言具體數值（報價、金額）

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
├── main.py                 # FastAPI app + lifespan（Firestore 預熱）+ EasyAuth middleware
├── routers/                # 路由層（對應 Node.js routes + controllers）
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
│   ├── snapshots.py        # 每日資產快照
│   ├── settings.py         # 應用設定
│   ├── preferences.py      # 使用者偏好
│   ├── system.py           # 系統狀態（apiSwitch + Shioaji 狀態）
│   └── mcp.py              # MCP Server（SSE + JSON-RPC 2.0）
├── services/
│   ├── firestore.py        # Firestore 單例
│   ├── yahoo_finance.py    # Yahoo v8/v10 直接 HTTP（yfinance 已移除）
│   ├── shioaji_manager.py  # WebSocket tick 訂閱、quote cache
│   ├── api_switch.py       # CircuitBreaker + api_switch_call()
│   ├── cache.py            # TTL 快取
│   ├── rate_helper.py      # 即時匯率 Map
│   ├── snapshot_service.py # 快照自動記錄（VIX + marketStateAuto）
│   ├── tag_risk_service.py # 動態風險重算（volRatio + presets）
│   └── mcp_service.py      # MCP 8 個 Tool 實作
├── utils/
│   └── market_hours.py     # is_market_open()（週一–五 09:00–13:30 UTC+8）
└── tests/                  # pytest 測試套件（121 tests，全數通過）
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
      ├─ EASY_AUTH_BYPASS=true（本機開發）
      ├─ 路徑：/health、/docs、/openapi.json、/redoc
      ├─ 方法：OPTIONS
      ├─ 路徑前綴：/api/v1/mcp/*
      └─ Header：X-Cron-Token: <CRON_SECRET>（排程工作，user_id="cron"）
    → Router
```

> ⚠️ **已知不一致**：`main.py` 讀取 `SKIP_AUTH` 但 `.env.example` 與 `conftest.py` 使用 `EASY_AUTH_BYPASS`。本機開發請以 `.env` 中的實際設定為準。

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

受 `api_switch_call` 控制的端點：`GET /market/indices`（TAIEX + 台指期 patch）、`GET /stocks/{id}/quote`、`GET /holdings`、`GET /holdings/prices`、`GET /watchlist`。

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

API Key：`?key=<MCP_ACCESS_KEY>`；`MCP_ACCESS_KEY` 未設定時跳過驗證（開發模式）。

支援方法：`initialize`、`tools/list`、`tools/call`、`notifications/*`（204 無回應）

**8 個 Tool**（實作於 `services/mcp_service.py`）：

| Tool | params | 說明 |
|------|--------|------|
| `get_holdings` | — | 持股清單，含 `currentPrice`/`currentValue` 即時注入 |
| `get_watchlist` | — | 自選股 |
| `get_market_indices` | — | 大盤指數 + 台指期 |
| `get_stock_quote` | `stock_id` | 個股即時報價 |
| `get_snapshots` | `year?`, `limit?` | 每日資產快照 |
| `get_tags` | — | Tag 設定 |
| `get_rebalance_rules` | — | 再平衡規則 |
| `get_foreign_assets` | — | 外幣 + 債券資產 |

回傳格式：`{"content": [{"type": "text", "text": "<camelCase JSON string>"}]}`

> `mcp_service.py` 的 `_convert_keys()` 負責將 Firestore snake_case 轉 camelCase 後再輸出。

### Environment Variables

```env
# Firebase / Firestore
FIRESTORE_PROJECT_ID=nocode-finance
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json   # 本機開發
GOOGLE_APPLICATION_CREDENTIALS_JSON=<base64 JSON>         # Azure 部署（二擇一）

# Server
PORT=8000

# Auth（⚠️ 注意：.env.example 使用 EASY_AUTH_BYPASS，main.py 讀取 SKIP_AUTH，兩者存在不一致）
EASY_AUTH_BYPASS=true   # 本機開發：跳過 EasyAuth（參照 .env.example）

# 排程工作 bypass（選填；設定後 X-Cron-Token header 可繞過 EasyAuth）
CRON_SECRET=<自訂 UUID>

# Shioaji（選填；未設定則全程使用 Yahoo Finance）
SJ_API_KEY=<永豐金 API Key>
SJ_SECRET_KEY=<永豐金 Secret Key>

# MCP（選填；未設定時 MCP 端點不需 Key）
MCP_ACCESS_KEY=<自訂 UUID>
```

---

## ⚠️ 舊服務（待刪除，僅供比對參考）

### Node.js Backend (`backend/`)

已下線。主要架構供驗證期比對用，確認功能對齊後刪除。

- 框架：Express + TypeScript，port 3001
- 入口：`src/index.ts`
- 路由規範與 Firestore 欄位定義詳見 `Task_Backend.md` DTO 對齊規格章節

### Python Microservice (`Shioaji_API/`)

已下線。其 Shioaji 邏輯（ShioajiManager、tick cache、合約訂閱）已整合至 `python-backend/services/shioaji_manager.py`，不再需要獨立部署。
