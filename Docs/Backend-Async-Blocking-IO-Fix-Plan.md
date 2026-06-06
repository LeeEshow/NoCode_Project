# Backend Async / Blocking I/O 修正方案

> 建立日期：2026-06-06  
> 適用範圍：`Back-End/python-backend`  
> 目標：徹底消除 event loop blocking、shared executor 巢狀 deadlock、以及 snapshot 報價靜默劣化風險。

---

## 一、背景與問題定義

目前後端是 FastAPI + uvicorn，啟動時會將 asyncio default executor 設成共用的 `core.executors.get_executor()`：

```python
loop.set_default_executor(get_executor())
```

因此以下兩種寫法會使用同一個 shared thread pool：

```python
await asyncio.to_thread(sync_func)
await loop.run_in_executor(None, sync_func)
```

如果 `sync_func` 內部又呼叫：

```python
executor = get_executor()
future = executor.submit(other_sync_func)
future.result()
```

就形成「worker 裡等待同一個 executor 的其他 worker」的巢狀等待。當 shared executor 被佔滿時，內層任務排不進去，外層 worker 又不釋放，可能造成整體 hang。

---

## 二、核心設計原則

### 1. Async endpoint 不直接做同步 I/O

`async def` endpoint 內不可直接呼叫 Firestore、`requests`、Shioaji blocking API 或其他同步 I/O。

正確：

```python
data = await asyncio.to_thread(read_firestore)
```

或：

```python
loop = asyncio.get_running_loop()
data = await loop.run_in_executor(None, read_firestore)
```

### 2. 禁止 shared executor 巢狀等待

禁止：

```python
async def endpoint():
    await asyncio.to_thread(sync_job)

def sync_job():
    executor = get_executor()
    future = executor.submit(other_job)
    return future.result()
```

正確方向：

```python
async def endpoint():
    results = await asyncio.gather(
        asyncio.to_thread(job_a),
        asyncio.to_thread(job_b),
        return_exceptions=True,
    )
```

### 3. 長流程由 async orchestration 負責

像 `/snapshots/record` 這類流程：

1. 讀 Firestore
2. 取匯率
3. 取報價
4. 計算
5. 寫 Firestore
6. 背景重算風險 / 同步 FinMind

不應整包丟進 executor。應拆成小型 blocking function，由 async service 用 `await` 串接。

### 4. 業務報價一律走 `quote_service`

後端業務層需要個股報價時，統一使用：

```python
from services.quote_service import get_quote, get_quotes
```

不得直接使用：

```python
from services.yahoo_finance import get_quote
```

`yahoo_finance` / `twse_finance` 應定位為 provider adapter，不是業務入口。

### 5. 報價失敗不可靜默寫成正常 0

`price = 0` 只能代表 placeholder，不可被視為真實報價。寫入 snapshot holding 時必須保留：

```python
quoteSource
quoteStatus
quoteMessage
```

---

## 三、完整修正方案

## P0：移除 shared executor 巢狀等待

### 目標檔案

- `services/yahoo_finance.py`
- `services/rate_helper.py`
- `services/tag_risk_service.py`
- `routers/market.py`
- `routers/tags.py`
- `services/mcp_service.py`
- `services/snapshot_service.py`

### 需要消除的模式

目前仍需檢查並移除這類 sync function 內部並行：

```python
executor = get_executor()
future = executor.submit(...)
future.result()
```

尤其是：

- `yahoo_finance.get_forex_rates()`
- `yahoo_finance.get_indices()`
- `tag_risk_service.recalculate_dynamic_risk()`

### 建議新增：`services/market_service.py`

新增 async market service，將「並行」移到 async layer：

```python
import asyncio

from services.cache import cache_get, cache_set
from services.yahoo_finance import (
    FOREX_SYMBOLS,
    INDEX_SYMBOLS,
    _fetch_forex_rate,
    _fetch_index_card,
    _fetch_taiwan_futures,
)


async def get_forex_rates_async() -> list[dict]:
    cached = cache_get("market:forex-rates")
    if cached is not None:
        return cached

    results = await asyncio.gather(
        *(asyncio.to_thread(_fetch_forex_rate, item) for item in FOREX_SYMBOLS),
        return_exceptions=True,
    )

    rows = []
    for item, result in zip(FOREX_SYMBOLS, results):
        if isinstance(result, Exception):
            rows.append({"code": item["code"], "name": item["name"], "rate": None})
        else:
            rows.append(result)

    cache_set("market:forex-rates", rows, 300)
    return rows


async def get_indices_async() -> list[dict]:
    cached = cache_get("market:indices")
    if cached is not None:
        return cached

    tasks = [asyncio.to_thread(_fetch_taiwan_futures)] + [
        asyncio.to_thread(_fetch_index_card, item) for item in INDEX_SYMBOLS
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    futures_result = results[0]
    futures_card = (
        futures_result
        if not isinstance(futures_result, Exception)
        else {"id": "futures", "name": "台指期", "price": None, "change": None, "changePercent": None}
    )

    cards = []
    for item, result in zip(INDEX_SYMBOLS, results[1:]):
        if isinstance(result, Exception):
            cards.append({
                "id": item["id"],
                "name": item["name"],
                "price": None,
                "change": None,
                "changePercent": None,
            })
        else:
            cards.append(result)

    ordered = cards
    ordered.insert(1, futures_card)
    cache_set("market:indices", ordered, 5)
    return ordered
```

> 後續可再把 `_fetch_*` 改名成 public adapter function，避免跨 module 使用底線函式。

### 呼叫端替換

`routers/market.py`

```python
from services.market_service import get_indices_async, get_forex_rates_async

cards = await get_indices_async()
data = await get_forex_rates_async()
```

`services/mcp_service.py`

```python
from services.market_service import get_indices_async

async def _get_market_indices() -> dict:
    return _text(await get_indices_async())
```

`services/snapshot_service.py`

```python
from services.market_service import get_forex_rates_async

rate_rows = await get_forex_rates_async()
rate_map = {"TWD": 1.0}
for row in rate_rows:
    rate_map[row["code"]] = row["rate"]
```

---

## P1：Snapshot 報價改走 `quote_service`

### 目標檔案

- `services/snapshot_service.py`

### 移除

```python
from services.yahoo_finance import get_quote
```

### 改用

```python
from services.quote_service import get_quotes
```

### 建議流程

```python
needed_ids = [h["stockId"] for h in active]
quotes = await get_quotes(needed_ids)
```

### 寫入 snapshot holdings 時保留報價狀態

```python
q = quotes.get(sid, {})
quote_status = q.get("quoteStatus", "error")
current_price = _f(q.get("price"), 0.0)

snapshot_holdings.append({
    "stockCode": sid,
    "stockName": q.get("name") or h.get("stockName") or sid,
    "shares": h["sharesHeld"],
    "costAvg": h["avgCost"],
    "currentPrice": current_price,
    "currentValue": round(h["sharesHeld"] * current_price),
    "unrealizedProfit": round((current_price - h["avgCost"]) * h["sharesHeld"]) if current_price > 0 else 0,
    "quoteSource": q.get("quoteSource", "unknown"),
    "quoteStatus": quote_status,
    "quoteMessage": q.get("quoteMessage", ""),
})
```

### `_deserialize_snapshot_dict()` 也需回傳

```python
"quoteSource": h.get("quoteSource", "unknown"),
"quoteStatus": h.get("quoteStatus", "unknown"),
"quoteMessage": h.get("quoteMessage", ""),
```

---

## P2：Tag risk recalculation 改 async orchestration

### 目標檔案

- `services/tag_risk_service.py`
- `routers/tags.py`
- `routers/snapshots.py`
- `services/mcp_service.py`

### 建議新增 async 版本

```python
async def recalculate_dynamic_risk_async(market_state: str) -> dict:
    db = get_db()

    tags_snap, asset_tags_snap, holdings_snap = await asyncio.gather(
        asyncio.to_thread(lambda: db.collection("tags").order_by("name").get()),
        asyncio.to_thread(lambda: db.collection("asset_tags").get()),
        asyncio.to_thread(lambda: db.collection("holdings").get()),
    )

    # 組 tags / active_set / tag_holdings_map / needed

    results = await asyncio.gather(
        *(asyncio.to_thread(get_history_closes, sid) for sid in needed),
        return_exceptions=True,
    )

    closes_map = {}
    for sid, result in zip(needed, results):
        if not isinstance(result, Exception) and result:
            closes_map[sid] = result

    # 計算 updates

    if updates:
        await asyncio.to_thread(_commit_updates, db, updates)

    return {"updatedCount": len(updates), "skippedCount": skipped}
```

### 呼叫端替換

`routers/tags.py`

```python
result = await recalculate_dynamic_risk_async(market_state)
```

`routers/snapshots.py` background task

```python
async def _bg_recalculate_risk_async() -> None:
    ...
    await recalculate_dynamic_risk_async(mstate)
```

`services/mcp_service.py`

```python
await recalculate_dynamic_risk_async(mstate)
```

---

## P3：Background task 改成 async 並可觀測

### 目標檔案

- `routers/snapshots.py`

### 建議做法

FastAPI `BackgroundTasks` 可接 async function。重型任務應明確包裝 timeout 與 log。

```python
async def _bg_recalculate_risk_async() -> None:
    try:
        await asyncio.wait_for(_recalculate_risk_impl(), timeout=60)
    except Exception as e:
        logger.error("Background risk recalculation failed: %s", e)
```

若使用 `asyncio.create_task()`，必須加 done callback：

```python
task = asyncio.create_task(_bg_recalculate_risk_async())
task.add_done_callback(log_task_exception)
```

---

## P4：保留 sync CRUD endpoint，但限制 sync service 行為

純 CRUD endpoint 可改成 `def`，讓 FastAPI 自動丟到 threadpool：

```python
@router.get("")
def get_all():
    snap = db.collection("x").get()
    return ...
```

但 sync endpoint 呼叫的 service 不可再做 shared executor fan-out：

```python
def sync_service():
    executor = get_executor()
    futures = [executor.submit(...) for ...]
    return [f.result() for f in futures]
```

如果需要 fan-out，必須改由 async service 使用 `asyncio.gather()`。

---

## 四、落地順序

1. 新增 `services/market_service.py`
2. `routers/market.py` 改用 `get_indices_async()` / `get_forex_rates_async()`
3. `services/mcp_service.py` 的 market tools 改用 async market service
4. `services/snapshot_service.py`
   - 匯率改用 `get_forex_rates_async()`
   - 股票報價改用 `quote_service.get_quotes()`
   - snapshot holdings 寫入 `quoteSource` / `quoteStatus` / `quoteMessage`
5. 新增 `recalculate_dynamic_risk_async()`
6. `routers/tags.py`、snapshot background task、MCP tag update 改用 async risk service
7. 搜尋並清除殘留 shared executor 巢狀等待
8. 補併發與降級測試

---

## 五、驗證清單

### 靜態搜尋

```bash
rg -n "get_event_loop\(" Back-End/python-backend
rg -n "executor\.submit|\.result\(" Back-End/python-backend/services Back-End/python-backend/routers
rg -n "from services\.yahoo_finance import get_quote" Back-End/python-backend
```

期待結果：

- `get_event_loop(` 無殘留
- 沒有 sync service 內 `executor.submit(...).result()` 的 shared executor 巢狀模式
- 業務層沒有直接 import `yahoo_finance.get_quote`

### 編譯檢查

```bash
cd Back-End/python-backend
python -m compileall -q routers services main.py
```

### 測試建議

1. 同時兩個 `/api/v1/snapshots/record`
   - 第一個正常執行
   - 第二個回 `409`
2. 模擬 quote provider timeout
   - snapshot 不應寫成看似正常的 0 元資料
   - holding 應有 `quoteStatus != "ok"`
3. 模擬匯率 provider 部分失敗
   - 其他幣別仍可寫入
   - 失敗幣別為 `rate: null`
4. tag risk recalculation 不再呼叫 `get_executor().submit().result()`
5. health check 在 snapshot 執行期間仍可快速回應

---

## 六、完成定義

修正完成後，後端只允許兩種模式：

### 合法模式 A：async orchestration

```python
async def service():
    results = await asyncio.gather(
        asyncio.to_thread(single_blocking_call_a),
        asyncio.to_thread(single_blocking_call_b),
        return_exceptions=True,
    )
```

### 合法模式 B：sync CRUD endpoint / 單一 blocking function

```python
def endpoint():
    return db.collection("x").get()
```

### 禁止模式

```python
def sync_func_running_in_shared_executor():
    future = get_executor().submit(other_sync_func)
    return future.result()
```

---

## 七、後續開發守則

1. 新增 async endpoint 時，先檢查是否有 Firestore / requests / Shioaji blocking call。
2. 新增 service 時，明確標示它是 sync provider、async orchestration，或純計算 function。
3. 需要並行時優先使用 `asyncio.gather()`，不要在 sync service 裡自建 executor fan-out。
4. 業務層報價統一走 `quote_service`。
5. 寫入快照或投資決策資料時，任何 provider 失敗都必須可觀測，不可靜默降級。
