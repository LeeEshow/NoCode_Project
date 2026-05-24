# 個人理財雲端系統 — 後端開發任務清單

> 版本：5.2（2026-05-24）
> 參考文件：Back-End\CLAUDE.md

---

## 整合原則（必讀）

> Python FastAPI 是 Node.js Express 的**語言替換**，不是重新設計。
> 前端接口結構不變、Firestore DB 結構不變，Python 版本只需忠實複製 Node.js 的讀寫邏輯與回傳格式。

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

## 現況（2026-05-24）

- **M1–M7 全部完成**：Python FastAPI 後端已完全取代 Node.js；`pytest tests/` → 121/121 passed
- **MCP 全部完成**：15 個 Tool + SSE/Streamable HTTP 雙傳輸層，camelCase 輸出、即時報價注入、複合聚合分析均已實作，`pytest tests/test_m6_mcp.py` 全部通過

---

## 已完成：MCP Server 擴充（2026-05-23）

| 項目 | 說明 |
|------|------|
| MCP-OPT-01 ✅ | 所有 Tool 統一套用 `_convert_keys()` 輸出 camelCase |
| MCP-OPT-02 ✅ | `get_holdings` 並行注入 `currentPrice` / `currentValue` |
| MCP-OPT-03 ✅ | `get_snapshots` 新增 `start_date` / `end_date` 日期範圍篩選 |
| MCP-NEW-01 ✅ | `get_asset_tags`：個股 Tag 配置清單（stockCode / tagName / weightRatio） |
| MCP-NEW-02 ✅ | `get_tag_correlation_matrix`：Tag 相關性矩陣（singleton，無資料回空結構） |
| MCP-NEW-03 ✅ | `get_transactions`：交易紀錄，支援 `stock_id` 篩選，依 date 升冪 |
| MCP-NEW-04 ✅ | `get_stock_history`：歷史 K 線（OHLCV），複用 `yahoo_finance._yf_chart()` |
| MCP-NEW-05 ✅ | `get_stock_chip`：三大法人近 20 日籌碼（TWSE T86） |
| MCP-NEW-06 ✅ | `get_rebalance_snapshots`：歷次再平衡建議快照（params + suggestions） |
| MCP-NEW-07 ✅ | `get_portfolio_tag_analysis`：投組 Tag 配置聚合分析（actualWeight / deviation） |

測試驗收：`pytest tests/test_m6_mcp.py` 全數通過（10 個新增 test case，含欄位結構、camelCase、型別驗證）。

---

## 待辦：程式碼優化（Code Review 來源：`Docs/CODE_REVIEW_OPTIMIZATION.md`）

> 執行順序：層一 → 層二 → 層三（層三按 domain 分批）
> 修改原則：不改前端接口、不改 Firestore 結構、不影響現有 145 通過測試

---

### 層一：小改動、高影響 ✅ 完成（2026-05-24）

| 項目 | 說明 |
|------|------|
| OPT-01 ✅ | MCP fail-closed：`MCP_ACCESS_KEY` 未設定且非 dev 環境 → 503 |
| OPT-02 ✅ | Cache 加容量上限：`OrderedDict` LRU + `threading.Lock`，maxsize=512，per-entry TTL 保留 |
| OPT-03 ✅ | `RequestValidationError` 統一回傳 `{success:false, error:"..."}` 422 格式 |
| OPT-04 ✅ | CORS origins 從 `ALLOWED_ORIGINS` env 讀取；`.env.example` 已補說明 |

驗收：`pytest tests/ -v` → 145/145 passed

---

#### OPT-01 MCP Fail-Closed 安全修正

**問題**：`MCP_ACCESS_KEY` 未設定時，MCP 15 個 Tool 對任何人開放（holdings、snapshots、tags 等敏感資料無需任何驗證即可讀取）。

**修改範圍**：`routers/mcp.py`

**實作規格**：
- 在 `mcp.py` 頂層讀取 `MCP_ACCESS_KEY = os.getenv("MCP_ACCESS_KEY")`
- 在三個端點（`GET /sse`、`POST /`、`POST /message`）的 key 檢查邏輯改為：
  - `MCP_ACCESS_KEY` **已設定**：缺 key 或 key 錯誤 → 回 `401`
  - `MCP_ACCESS_KEY` **未設定且非 dev 環境**（`SKIP_AUTH != true`）：直接回 `503 {"error": "MCP_ACCESS_KEY not configured"}`
  - `MCP_ACCESS_KEY` **未設定且為 dev 環境**（`SKIP_AUTH=true`）：跳過驗證（維持開發便利）

**驗收**：`pytest tests/test_m6_mcp.py` 仍全數通過；手動驗證 production 無 key 時回 503。

---

#### OPT-02 Cache 加容量上限

**問題**：`services/cache.py` 使用無上限的 module-level dict，長期運行可能無限累積 key，沒有 eviction 機制。

**修改範圍**：`services/cache.py`

**實作規格**：
```python
# 安裝：pip install cachetools（加入 requirements.txt）
from cachetools import TTLCache
import threading

_cache: TTLCache = TTLCache(maxsize=512, ttl=300)  # 預設 TTL 300s，可被呼叫端 override
_lock = threading.Lock()
```
- 公開介面（`get` / `set` / `delete`）維持不變，呼叫端零修改
- `maxsize=512` 採 LRU eviction，TTL 維持原邏輯
- 加 `_lock` 保護複合操作（check-then-set）

**驗收**：現有測試通過；確認 `requirements.txt` 新增 `cachetools`。

---

#### OPT-03 RequestValidationError 統一錯誤格式

**問題**：Pydantic 驗證失敗時回傳原始格式（FastAPI 預設），與全站 `{success: false, error: "..."}` 不一致，前端 error handling 需多判斷一種格式。

**修改範圍**：`main.py`

**實作規格**：
```python
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    return JSONResponse(
        status_code=422,
        content={"success": False, "error": str(exc.errors())},
    )
```

**驗收**：對任一端點送出缺必填欄位的 request，回傳格式為 `{success: false, error: "..."}` 且 status 422。

---

#### OPT-04 CORS Origins 從環境變數讀取

**問題**：`main.py` 目前使用 `allow_origins=["*"]` 搭配 `allow_credentials=True`，瀏覽器規範會拒絕此組合（CORS 錯誤），且安全性差。

**修改範圍**：`main.py`

**實作規格**：
```python
# .env 新增：
# ALLOWED_ORIGINS=https://nocode-finance.azurewebsites.net,http://localhost:5173

_allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _allowed_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```
- `.env.example` 補上 `ALLOWED_ORIGINS` 說明
- 本機開發預設值含 `localhost:5173`

**驗收**：本機前端請求正常；production 設定正確 origin 後無 CORS 錯誤。

---

### 層二：中等工作量、明確收益 ✅ 完成（2026-05-24）

| 項目 | 說明 |
|------|------|
| OPT-05 ✅ | `core/settings.py`（pydantic_settings）集中 7 個 env var；更新 main.py / firestore.py / api_switch.py；mcp.py `_check_key` 保留 `os.getenv()` 直讀（測試 monkeypatch 相容） |
| OPT-06 ✅ | `core/executors.py` 共用 ThreadPoolExecutor(max_workers=16)；`yahoo_sem / twse_sem / ndc_sem` 限流；yahoo_finance / snapshot_service / tag_risk_service 移除 ad-hoc executor；`_fetch_chip_day` 改序列呼叫防死鎖 |
| OPT-07 ✅ | `POST /snapshots/record` 加 FastAPI `BackgroundTasks`；動態風險重算移至背景，不再阻塞 response |
| OPT-08 ✅ | `api_switch.py` 新增 `SyncCircuitBreaker`；`yahoo_cb / twse_cb / ndc_cb` 獨立 CB 實例；yahoo_finance 的 `_yf_chart / _yf_quote_summary / _twse_fund_rows / get_export_indicator` 包入對應 CB + semaphore |

驗收：`pytest tests/ -v` → 145/145 passed

---

#### OPT-05 Settings 物件集中化

**問題**：7 個 env var 散落在各 service 的 `os.getenv()`，命名不統一（如舊 `EASY_AUTH_BYPASS`），改名或新增設定容易遺漏。

**修改範圍**：新增 `core/settings.py`；修改 `main.py`、`services/firestore.py`、`services/shioaji_manager.py`、`routers/mcp.py`

**實作規格**：
```python
# core/settings.py
from functools import lru_cache
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    skip_auth: bool = False
    mcp_access_key: str | None = None
    firestore_project_id: str | None = None
    google_credentials_json: str | None = None
    google_credentials: str = "./serviceAccountKey.json"
    sj_api_key: str | None = None
    sj_secret_key: str | None = None
    cron_secret: str | None = None
    allowed_origins: str = "http://localhost:5173"
    port: int = 8000

    class Config:
        env_file = ".env"

@lru_cache
def get_settings() -> Settings:
    return Settings()
```
- 各 service 改從 `get_settings()` 取值，移除散落的 `os.getenv()`
- 測試可透過 `app.dependency_overrides` 或環境變數 override
- 安裝：`pip install pydantic-settings`（加入 `requirements.txt`）

**驗收**：`pytest tests/ -v` 全數通過；grep 確認 `os.getenv` 只剩非設定用途的呼叫。

---

#### OPT-06 ThreadPoolExecutor 統一管理 + 外部 API 限流

**問題**：`yahoo_finance.py`、`snapshot_service.py`、`tag_risk_service.py` 各自 ad-hoc 建立 executor，無法控制總併發，高頻呼叫時有 thread 建立/回收成本。

**修改範圍**：新增 `core/executors.py`；修改 3 個 service

**實作規格**：
```python
# core/executors.py
import asyncio
from concurrent.futures import ThreadPoolExecutor

_executor = ThreadPoolExecutor(max_workers=10, thread_name_prefix="io-worker")
_yahoo_semaphore = asyncio.Semaphore(5)   # Yahoo/TWSE/NDC 同時最多 5 個 outbound request
_shioaji_semaphore = asyncio.Semaphore(3)

def get_executor() -> ThreadPoolExecutor:
    return _executor
```
- `yahoo_finance.py` 改用 `asyncio.to_thread()` 或共用 executor；並行報價查詢加 `_yahoo_semaphore`
- 舊的 ad-hoc `ThreadPoolExecutor(max_workers=N)` 全數移除

**驗收**：現有測試通過；壓測 10 個並行 quote 請求不超過 5 個同時打出去（可 log 驗證）。

---

#### OPT-07 Snapshot 與動態風險重算改為背景工作

**問題**：`POST /snapshots/record` 同步呼叫 `recalculate_dynamic_risk()`（含多個外部 API 查詢），外部 API 慢時整個 request 卡住，使用者體感延遲高。

**修改範圍**：`routers/snapshots.py`、`services/snapshot_service.py`

**實作規格**：
```python
# routers/snapshots.py
@router.post("/record")
async def record_snapshot(background_tasks: BackgroundTasks, ...):
    result = await snapshot_service.record(...)          # 只寫快照本體
    background_tasks.add_task(tag_risk_service.recalculate_dynamic_risk)  # 背景跑
    return {"success": True, "data": result}
```
- 快照寫入同步完成後立即回 200，重算在背景執行
- 重算失敗不影響 response，僅 log error
- 若需知道重算狀態，可查 `GET /tags`（重算結果寫回 Firestore）

**驗收**：`POST /snapshots/record` 回應時間 < 原本一半；背景重算完成後 `GET /tags` 動態風險數值更新。

---

#### OPT-08 Yahoo / TWSE / NDC 加 Circuit Breaker

**問題**：目前只有 Shioaji primary 有 Circuit Breaker；Yahoo/TWSE 若掛掉，所有 fallback 請求都會 timeout 堆積，拖慢整個 API。

**修改範圍**：`services/api_switch.py`、`services/yahoo_finance.py`

**實作規格**：
- 在 `api_switch.py` 的 `CircuitBreaker` 擴充或複用至 Yahoo Finance
- 為 Yahoo、TWSE T86、NDC 各建一個獨立 CB 實例（`failure_threshold=3`、`cooldown=60s`）
- `yahoo_finance.py` 的 `_yf_quote()`、`_twse_chip()`、`_ndc_export()` 包入對應 CB

**驗收**：模擬 Yahoo 連線失敗 3 次後，CB 進入 OPEN 狀態，後續請求直接回 null/fallback，不再 timeout 等待。

---

### 層三：架構重構（分批，以 holdings 為試點）

> 這層改動幅度較大，建議逐 domain 推進。先完成 holdings，驗收通過後再複製模式到 watchlist、transactions。

#### OPT-09 Pydantic Request Schema（holdings / transactions / assets）

**問題**：多個 endpoint 使用 `body: dict` 再手動取值，型別錯誤到 runtime 才發現，OpenAPI 文件不完整。

**修改範圍**：`routers/holdings.py`、`routers/transactions.py`、`routers/assets.py`（新增對應 schema file）

**實作規格**：
```python
# schemas/transactions.py（示意）
from pydantic import BaseModel, Field
from typing import Literal

class TransactionCreate(BaseModel):
    stock_id: str = Field(alias="stockId")
    type: Literal["buy", "sell"]
    date: str                                    # YYYY-MM-DD
    shares: float = Field(gt=0)
    price_per_share: float = Field(alias="pricePerShare", gt=0)
    fee: float = Field(default=0, ge=0)
    note: str = ""

    model_config = {"populate_by_name": True}
```
- router 改用 `body: TransactionCreate`，移除手動 `body.get("xxx")`
- response 同樣定義 DTO，確保 camelCase 由 schema 統一輸出

**驗收**：送缺欄位 request 回 422；OpenAPI `/docs` 顯示完整 schema；現有測試通過。

---

#### OPT-10 Repository 抽離（holdings 試點）

**問題**：`routers/holdings.py` 直接操作 Firestore，路由層同時承擔 HTTP 與資料存取兩種責任，難以單獨測試業務邏輯。

**修改範圍**：新增 `repositories/holdings_repo.py`；修改 `routers/holdings.py`

**實作規格**：
```python
# repositories/holdings_repo.py
from typing import Protocol

class HoldingsRepository(Protocol):
    async def list_all(self) -> list[dict]: ...
    async def get(self, stock_id: str) -> dict | None: ...
    async def upsert(self, stock_id: str, data: dict) -> None: ...
    async def delete(self, stock_id: str) -> None: ...
    async def update_order(self, ordered_ids: list[str]) -> int: ...

class FirestoreHoldingsRepository:
    # 從 holdings.py 搬移 Firestore 操作
    ...

class FakeHoldingsRepository:
    # 用於測試，in-memory dict
    def __init__(self, items: list[dict] = None): ...
```
- `routers/holdings.py` 透過 FastAPI `Depends()` 注入 repository
- 測試可注入 `FakeHoldingsRepository`，不需 Firestore 憑證

**驗收**：`holdings` 測試改用 fake repo 後仍通過；不再需要 Firestore 憑證即可跑 holdings 單元測試。

---

#### OPT-11 Service Layer 分離（holdings 試點）

**問題**：holdings quote enrichment（並行報價注入）目前散在 router，無法在不啟動 HTTP 的情況下測試。

**修改範圍**：新增 `services/holdings_service.py`；修改 `routers/holdings.py`

**實作規格**：
```python
# services/holdings_service.py
class HoldingsService:
    def __init__(self, repo: HoldingsRepository, quotes: QuoteProvider):
        self.repo = repo
        self.quotes = quotes

    async def list_with_quotes(self) -> list[dict]:
        holdings = await self.repo.list_all()
        active = [h["stockId"] for h in holdings if h.get("sharesHeld", 0) > 0]
        quote_map = await self.quotes.get_quotes(active)
        for h in holdings:
            price = quote_map.get(h["stockId"])
            h["currentPrice"] = price
            h["currentValue"] = round(h["sharesHeld"] * price, 2) if price else None
        return holdings
```
- router 僅保留 HTTP 邊界（status code、request 解析、response 組裝）
- service 不 import FastAPI，可純 Python 測試

**驗收**：`HoldingsService.list_with_quotes()` 可用 fake repo + fake quote provider 單獨測試，不依賴 Firestore 或 HTTP。

---

#### OPT-12 QuoteProvider 介面化

**問題**：Shioaji/Yahoo fallback 邏輯散落在多個 router/service，新增報價來源需改多個地方。

**修改範圍**：新增 `providers/quotes/base.py`、`yahoo.py`、`shioaji.py`、`switching.py`；修改 `services/api_switch.py`

**實作規格**：
```python
# providers/quotes/base.py
from typing import Protocol

class QuoteProvider(Protocol):
    async def get_quote(self, stock_id: str) -> float | None: ...
    async def get_quotes(self, stock_ids: list[str]) -> dict[str, float | None]: ...

# providers/quotes/switching.py
class SwitchingQuoteProvider:
    def __init__(self, primary, fallback, market_clock, circuit_breaker): ...
    async def get_quote(self, stock_id: str) -> float | None:
        if not self.market_clock.is_open():
            return await self.fallback.get_quote(stock_id)
        try:
            return await self.circuit_breaker.call(lambda: self.primary.get_quote(stock_id))
        except Exception:
            return await self.fallback.get_quote(stock_id)
```
- holdings/watchlist/stocks router 改從 `Depends()` 取得 `QuoteProvider`
- 現有 `api_switch_call()` 邏輯移入 `SwitchingQuoteProvider`，不再散落各處

**驗收**：替換 quote provider 不需修改 router；現有所有測試通過。

---

### 驗收策略

所有任務完成後執行：

```bash
cd Back-End/python-backend
py -3.14 -m pytest tests/ -v   # 全套，目標 0 failures
```

**通用原則**：
- 每個任務完成後獨立跑一次 `pytest tests/`，確認不破壞現有測試
- 層三任務每個 domain 做完後補對應測試（用 fake repository/provider）
- 不修改前端接口結構與 Firestore collection 結構
