# CLAUDE.md

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
py -3.14 -m pytest tests/ -v                        # 測試套件
py -3.14 -m pytest tests/test_m6_mcp.py             # 單一模組測試
```

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
| `/api/v1/mcp/message` | MCP JSON-RPC 2.0（POST，bypass EasyAuth） |
| `/health` | Azure warmup probe（無 `/api/v1` 前綴） |

### Middleware 順序

```
CORS（最外層）
  → EasyAuth（X-MS-CLIENT-PRINCIPAL 驗證；bypass: SKIP_AUTH=true 或 /health 或 OPTIONS 或 /api/v1/mcp/*）
    → Router
```

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

`GET /api/v1/mcp/sse` + `POST /api/v1/mcp/message`（JSON-RPC 2.0）

API Key：`?key=<MCP_ACCESS_KEY>`；`MCP_ACCESS_KEY` 未設定時跳過驗證（開發模式）。

**8 個 Tool**：`get_holdings`、`get_watchlist`、`get_market_indices`、`get_stock_quote`（params: stock_id）、`get_snapshots`（params: year?, limit?）、`get_tags`、`get_rebalance_rules`、`get_foreign_assets`

回傳格式：`{"content": [{"type": "text", "text": "<JSON string>"}]}`

### Environment Variables

```env
# Firebase / Firestore
FIRESTORE_PROJECT_ID=nocode-finance
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json   # 本機開發
GOOGLE_APPLICATION_CREDENTIALS_JSON=<base64 JSON>         # Azure 部署（二擇一）

# Server
PORT=8000

# Auth
SKIP_AUTH=true   # 本機開發：跳過 EasyAuth（Azure 部署對應環境變數名稱相同）

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
