# 個人理財雲端系統 — 後端開發任務清單

> 版本：7.0（2026-05-26）
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

## 現況（2026-05-27）

- **M1–M8 全部完成**：Python FastAPI 後端穩定運作於 Azure App Service
- **MCP 全部完成**：18 個 Tool + SSE/Streamable HTTP 雙傳輸層
- **層一、層二優化完成**：MCP fail-closed、Cache LRU、CORS env、Settings 集中、Circuit Breaker 等
- **FinMind 同步完成**：三大法人 + 基本面資料；`yfinance` 已移除
- **舊服務清理完成**（2026-05-25）：`Back-End/backend/`（Node.js）、`Back-End/Shioaji_API/` 已移除
- **報價來源重構完成**（2026-05-26）：`services/quote_service.py` 集中報價邏輯；Shioaji 改用 `api.snapshots()` 取代 WebSocket tick；`CircuitOpenError` 與 API RuntimeError 分流；Semaphore 防止 hung thread 堆積；盤中 TWSE fallback 跳過修正；`tests/test_quote_service.py` 15 個 mock 測試全通過（161 passed）
- **TAIEX 大盤指數修正完成**（2026-05-27）：Shioaji Index 合約不支援 Tick 訂閱，`get_cached_taiex()`（tick 快取）改為 `get_taiex_snapshot()`（`api.snapshots()`，5s TTL）；移除無效的 TSE001 Tick 訂閱；176 passed

### 報價 Provider 順位

```text
盤中：Shioaji api.snapshots()（3s / 5s）→ Yahoo（5s）
盤後：Shioaji api.snapshots()（3s / 5s）→ TWSE（4s，TSE only）→ Yahoo（5s）
批次最壞總時間：5s + 9s = 14s < 前端 15s axios timeout
```

- `SJ_API_KEY` 未設定 → Yahoo-only 模式（TWSE → Yahoo）
- CB OPEN → 跳過 Shioaji，直接走 fallback
- Shioaji 整批 timeout → 所有股票回 `quoteStatus: timeout` 占位，不等 fallback
- `CircuitOpenError`（CB OPEN）與 Shioaji API RuntimeError 分開捕捉，日誌診斷正確

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

## Bug 調查：Azure 後端執行一段時間後完全無回應（2026-05-28）

### 現象

- 後端正常運作數小時後突然凍結，所有 API 回傳 `timeout of 15000ms exceeded`
- Azure 監控顯示最後一批 200 回應後，超過 15 分鐘完全無任何 log
- 前端三個頁面（市場指數、持股、關注清單）同時 timeout

### 根本原因

**`asyncio` 預設 ThreadPoolExecutor 被 Shioaji hung thread 耗盡**

`shioaji_manager.py` 中三個方法都使用 `asyncio.to_thread(_snap)` 調用 `self._api.snapshots()`。`asyncio.to_thread()` 底層使用 asyncio 的**預設 ThreadPoolExecutor**，大小為 `min(32, os.cpu_count() + 4)`。Azure App Service 單核心 = **5 個 worker slots**。

問題鏈：

```
1. Shioaji api.snapshots() 因網路或 API 端問題 hang

2. quote_service.py 的 asyncio.wait_for(timeout=5s) 觸發
   → Coroutine 被 cancel，async with sem: 的 __aexit__ 釋放 semaphore ✓
   → 但底層 asyncio.to_thread 的 thread 繼續執行（wait_for 無法終止已啟動的 thread）✗
   → 一個預設 executor slot 永遠被佔用（thread 洩漏）

3. 前端每 3-5s poll /market/indices → 呼叫 get_taiex_snapshot()
   ★ get_taiex_snapshot 完全沒有 semaphore 保護
   Cache TTL 5s 到期後，每次 poll 都洩漏一個 thread

4. 約 25 秒後（5 輪 × 5s timeout）：
   預設 executor 5 個 worker 全滿
   → 所有 asyncio.to_thread / run_in_executor(None, ...) 阻塞
   → event loop 完全凍結 → 所有 API 15s timeout
```

### 問題點整理

| 位置 | 問題 |
|------|------|
| `shioaji_manager.py` `get_taiex_snapshot()` | `asyncio.to_thread(_snap)` 無 Semaphore 保護，每次 cache 到期 + Shioaji hang = 洩漏 1 thread |
| `shioaji_manager.py` `get_stock_snapshot()` | 有 `_snap_single_sem(3)` 但 semaphore 釋放後 thread 仍洩漏，最多每輪 3 slots |
| `shioaji_manager.py` `get_stock_snapshots()` | 有 `_snap_batch_sem(1)` 但同上，每輪 1 slot 洩漏 |
| `snapshot_service.py:99,103` | `vix_fut.result()` / `fut.result()` 無 timeout，Yahoo hang 時在 default executor 永久佔 1 slot |

### 解法方向

**核心修復：Shioaji 呼叫改用獨立的 `ThreadPoolExecutor`，與 asyncio 預設 executor 隔離。**

即使 Shioaji thread hang，只影響 Shioaji 專用池（max_workers=4），不影響 Firestore / Yahoo Finance 等其他 IO。當專用池滿時，後續 submit 的任務進 queue，`asyncio.wait_for` 觸發時 cancel 的是 queue 中尚未啟動的任務（`concurrent.futures.Future.cancel()` 對 queue 中任務有效）→ 不再洩漏新 thread。

具體改動：
1. `shioaji_manager.py` — 加入 `_sj_snap_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="sj-snap")`；三個 snapshot 方法改用 `loop.run_in_executor(_sj_snap_executor, _snap)`；`get_taiex_snapshot` 補加 `Semaphore(1)`
2. `snapshot_service.py` — `vix_fut.result(timeout=10)` 及 `fut.result(timeout=10)` 防止 Yahoo hang 拖住 default executor

### 狀態

✅ 已修復（2026-05-28）

**實際修改：**
- `services/shioaji_manager.py`：加入 `_sj_snap_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="sj-snap")`；三個 snapshot 方法（`get_taiex_snapshot` / `get_stock_snapshot` / `get_stock_snapshots`）改用 `loop.run_in_executor(_sj_snap_executor, _snap)`；`get_taiex_snapshot` 補加 `_taiex_snap_sem = asyncio.Semaphore(1)` 防止同時多個呼叫
- `services/snapshot_service.py`：`vix_fut.result(timeout=10)` 及 `fut.result(timeout=10)` 防止 Yahoo hang 拖住 default executor

---

## 驗收策略

```bash
cd Back-End/python-backend
py -3.14 -m pytest tests/ -v   # 全套，目標 0 failures
```

**通用原則**：
- 每個任務完成後獨立跑一次 `pytest tests/`，確認不破壞現有測試
- 不修改前端接口結構與 Firestore collection 結構
