# 個人理財雲端系統 — 後端開發任務清單

> 版本：6.0（2026-05-24）
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

- **M1–M7 全部完成**：Python FastAPI 後端已完全取代 Node.js
- **MCP 全部完成**：18 個 Tool + SSE/Streamable HTTP 雙傳輸層
- **層一、層二優化完成**：MCP fail-closed、Cache LRU、CORS env、Settings 集中、Circuit Breaker 等
- **M8 完成**：FinMind 三大法人 + 基本面資料同步；`yfinance` 已移除；`pytest tests/` → 159/159 passed
- **首次回補完成**：5 支持股（0056、00894、00981A、1210、2330）補齊 31 個交易日法人資料 + 最新基本面

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

## 待辦：層三架構重構（分批，以 holdings 為試點）

> 這層改動幅度較大，建議逐 domain 推進。先完成 holdings，驗收通過後再複製模式到 watchlist、transactions。
> 修改原則：不改前端接口、不改 Firestore 結構、不影響現有 159 通過測試

#### OPT-09 🔲 Pydantic Request Schema（holdings / transactions / assets）

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

#### OPT-10 🔲 Repository 抽離（holdings 試點）

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

#### OPT-11 🔲 Service Layer 分離（holdings 試點）

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

#### OPT-12 🔲 QuoteProvider 介面化

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

## 驗收策略

```bash
cd Back-End/python-backend
py -3.14 -m pytest tests/ -v   # 全套，目標 0 failures（目前 159/159）
```

**通用原則**：
- 每個任務完成後獨立跑一次 `pytest tests/`，確認不破壞現有測試
- 層三任務每個 domain 做完後補對應測試（用 fake repository/provider）
- 不修改前端接口結構與 Firestore collection 結構
