# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **範圍**：`python-backend/` 內的實作細節。  
> 本檔案與父層 `Back-End/CLAUDE.md` 同時載入；架構描述以本檔案為準（父層有舊版 tick 架構描述，已過時）。

---

## Commands

```bash
# 啟動開發伺服器
.venv\Scripts\activate
uvicorn main:app --reload --port 8000

# 全套測試
pytest tests/ -v

# 單一檔案
pytest tests/test_quote_service.py -v

# 關鍵字篩選
pytest tests/ -v -k "quote"
```

`pytest.ini` 設定 `asyncio_mode = auto`，所有 async test 自動偵測，不需 `@pytest.mark.asyncio`。

---

## Quote Service（核心架構，2026-05 重構）

**`services/quote_service.py` 是所有股票報價的唯一入口。Router 不再直接呼叫 Yahoo Finance 或 Shioaji。**

### Provider 順位

```
盤中：Shioaji api.snapshots()（3s / 5s）→ Yahoo（5s）
盤後：Shioaji api.snapshots()（3s / 5s）→ TWSE（4s，TSE only）→ Yahoo（5s）
```

- `is_market_open()` 只影響 **TWSE 步驟**（盤中直接跳過 TWSE），不影響 Shioaji 呼叫。
- `SJ_API_KEY` 未設定 → Yahoo-only 模式（TWSE → Yahoo），完全不走 Shioaji。
- Shioaji 整批 timeout → 所有股票立即回 `quoteStatus: timeout` 占位，**不繼續等 fallback**。
- 批次最壞總時間：5s（Shioaji）+ 9s（fallback deadline）= 14s < 前端 15s axios timeout。

### Circuit Breaker 規則

| 情況 | CB 行為 |
|------|---------|
| Shioaji API exception 或 timeout | `_record_failure()`，繼續 fallback |
| `snap=None`（合約不存在 / close≤0） | **不計入** CB failure |
| CB OPEN（`CircuitOpenError`） | 跳過 Shioaji，直接走 fallback |

`circuit_breaker.call(fn)` 包住每個 Shioaji 呼叫（含 wait_for）。CB OPEN 時 raise `CircuitOpenError(RuntimeError)` — 在 `except` 時**必須用 `CircuitOpenError` 而非 `RuntimeError`** 捕捉，否則會誤判 Shioaji 自身的 RuntimeError。

```python
from services.api_switch import CircuitOpenError, circuit_breaker

try:
    result = await circuit_breaker.call(fn)
except CircuitOpenError:
    # CB OPEN，skip Shioaji
except (asyncio.TimeoutError, Exception) as e:
    # API exception，已記入 CB failure
```

### Shioaji Semaphore（防 hung thread 堆積）

`shioaji_manager` 持有兩個 Semaphore，在 `get_stock_snapshots` / `get_stock_snapshot` 方法入口檢查：

- `_snap_batch_sem = Semaphore(1)`：前一批次仍在執行 → return `{sid: None}`（all-None → fallback，不 raise，不計 CB）
- `_snap_single_sem = Semaphore(3)`：3 個單股呼叫都在執行 → return `None`

這確保 `asyncio.wait_for` timeout 後底層 thread 繼續跑也不會無限堆積。

---

## Shioaji Manager（`services/shioaji_manager.py`）

現在使用 `api.snapshots()` HTTP 批次呼叫，**不再有 WebSocket tick 訂閱**。

- `get_stock_snapshot(stock_id)` — 單股，async，回傳 `dict | None`
- `get_stock_snapshots(stock_ids)` — 批次，async，回傳 `dict[str, dict | None]`
- `snap.ts` 是 nanosecond int；`_normalize_ts()` 統一轉為 epoch seconds
- **保留** tick 訂閱的只有：TAIEX（code="001"）和台指期（TXF），供 `GET /market/indices` 使用

---

## api_switch.py 目前職責

`api_switch_call()` 現在**只被 `routers/market.py`** 使用（TAIEX + 台指期 patch）。  
持股、自選股、個股報價的 provider 切換邏輯全部移至 `quote_service.py`。

`CircuitOpenError`、`circuit_breaker`（async CB）、`yahoo_cb`/`twse_cb`/`ndc_cb`（sync CB）都定義在這裡。

---

## 受影響端點對照

| Endpoint | 報價來源 |
|----------|---------|
| `GET /api/v1/stocks/{id}/quote` | `quote_service.get_quote()` |
| `GET /api/v1/holdings` | `quote_service.get_quotes()` |
| `GET /api/v1/holdings/prices` | `quote_service.get_quotes()` |
| `GET /api/v1/watchlist` | `quote_service.get_quotes()` |
| `GET /api/v1/market/indices` | `api_switch_call()` 直接（舊路徑，保留）|
| `GET /api/v1/system/shioaji-test` | `shioaji_manager.get_stock_snapshot()` 直接（診斷用）|

---

## Testing：quote_service Mock 模式

### is_market_open patch 必須打在 quote_service 的 local reference

```python
import services.quote_service as qs

# ✅ 正確
monkeypatch.setattr(qs, "is_market_open", lambda: True)

# ❌ 無效（quote_service 已 import 成 local reference，patch 來源不影響）
monkeypatch.setattr("utils.market_hours.is_market_open", lambda: True)
```

### 避免真實 TWSE 呼叫

`is_market_open=True`（盤中）時 TWSE 步驟完全跳過，`_is_tse()` 也不被呼叫。  
測試「走 Yahoo」的路徑，優先設定 `is_market_open=True`，不需 mock `_is_tse` 或 TWSE。

### Circuit Breaker 重置

CB 是全域單例；測試間需還原狀態：

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

### quoteSource / quoteStatus 欄位

所有報價回傳 dict 都包含這兩個欄位。整合測試（`test_m2_holdings.py` 等）只驗結構，不斷言具體數值；mock 測試（`test_quote_service.py`）才驗 source/status。

---

## MCP `_check_key()` 例外規則

`routers/mcp.py` 的 `_check_key()` 必須使用 `os.getenv("MCP_ACCESS_KEY")` 而非 `get_settings()`。  
原因：`@lru_cache` 在首次 import 時快取 Settings；pytest `monkeypatch.delenv` 只改 `os.environ`，已快取物件不受影響，導致測試拿到 401。安全驗證需每次 request 讀最新環境變數。
