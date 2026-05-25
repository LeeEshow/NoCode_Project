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

## 待辦：個股交易策略模組（STRAT）

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
