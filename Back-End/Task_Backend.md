# 個人理財雲端系統 — 後端開發任務清單

> 版本：8.0（2026-06-03）
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

## 現況（2026-06-03）

- **M1–M8 全部完成**：Python FastAPI 後端穩定運作於 GCE e2-micro（asia-east1-b）
- **MCP 全部完成**：22 個 Tool + SSE/Streamable HTTP 雙傳輸層
- **層一、層二優化完成**：MCP fail-closed、Cache LRU、CORS env、Settings 集中、Circuit Breaker 等
- **FinMind 同步完成**：三大法人 + 基本面資料；`yfinance` 已移除
- **舊服務清理完成**（2026-05-25）：`Back-End/backend/`（Node.js）、`Back-End/Shioaji_API/` 已移除
- **報價架構改回 WebSocket Tick**（2026-05-29）：`api.snapshots()` HTTP REST 在 Azure 上因 NAT 殭屍連線導致 thread pool 耗盡；改回 WebSocket tick push + memory cache 方案。個股報價完全不走 HTTP。啟動時批次訂閱持股 + 關注清單 tick，並一次性 `api.snapshots()` 暖身填充 cache（解決 9:20 開盤延遲）。TAIEX 改由 Yahoo Finance `^TWII` 提供（Index 不支援 Tick）。Circuit Breaker 保留但不再介入報價熱路徑。
- **後端阻塞修復（2026-05-29）**：① `asyncio.create_task()` 從 Shioaji 執行緒呼叫（event loop corruption root cause）改為 `run_coroutine_threadsafe`；② quote_service subscribe 改為背景 `ensure_future`，熱路徑不阻塞；③ asyncio default executor 統一換為 `_io_executor`（Azure B1 預設只有 5 workers）；④ `asyncio.get_event_loop()` 全面改為 `get_running_loop()`
- **Shioaji 前端重新初始化（2026-05-29）**：新增 `POST /api/v1/system/shioaji/reinitialize`（202 立即返回 + 非同步 cleanup→init→warmup）；`get_status()` 新增 `reinitializing` 欄位；前端輪詢 `GET /system/status` → `data.apiSwitch.providers.shioaji.initialized`
- **清倉後持股殘留修復（2026-06-02）**：`POST /holdings/recalculate` 中，若 `sharesHeld == 0` 改為 `batch.delete(ref)` 刪除 Firestore 文件（原本只更新 `shares_held = 0` 導致殘留）；同步清除對應 `asset_tags` 文件。前端 `useHoldingsViewModel.load()` 加 `.filter(h => h.shares > 0)` 作為防禦性過濾。
- **M9 MCP Tag 寫入工具完成（2026-06-03）**：新增 `update_tag`（dry_run 兩階段、寫後自動重算 dynamicRisk）、`set_asset_tags`（idempotent PUT、Firestore batch write 原子性）；MCP Tool 總數 18 → 20。
- **M10 AI 個股交易策略完成（2026-06-03）**：新增 `trading_strategies` Firestore collection（singleton-per-stock）；REST 端點 GET/GET_one/PATCH(dismiss)/DELETE；MCP Tool `save_trading_strategy`（覆寫+dismissed重置）、`get_trading_strategy`；MCP Tool 總數 20 → 22；`pytest tests/` 211/211 PASSED。
- **M11 後端遷移 GCE 完成（2026-06-03）**：Azure App Service B1 → GCE e2-small（asia-east1-b，35.201.176.69）；systemd fastapi.service 常駐；Nginx + Let's Encrypt SSL；Duck DNS `eshowfintarck.duckdns.org`；前端 `.env.production` 切換至 GCE URL。
- **M12 Cloud Run HTTPS Proxy 完成（2026-06-04）**：解決公司防火牆封鎖 DuckDNS；部署 Nginx Proxy 至 Cloud Run，實際 URL：`https://fintarck-proxy-1077248196503.asia-east1.run.app`；前端 `.env.production` 更新；公司網路內測試通過。
- **Shioaji 漲跌幅單位修正（2026-06-04）**：`TickSTKv1.pct_chg` 與 `Snapshot.change_rate` 實際單位為「百分比 × 100」（79 = 0.79%），但原本直接 `float(tick.pct_chg)` 未換算，導致 Shioaji 來源的 `changePercent` 放大 100 倍。修正：`shioaji_manager.py` 三處（tick callback、warmup snapshot、`_snap_to_dict`）均加 `/ 100`。

### 報價 Provider 順位

```text
盤中：Shioaji tick cache（記憶體，無 HTTP）→ Yahoo（5s）
盤後：Shioaji tick cache（記憶體）→ TWSE（4s，TSE only）→ Yahoo（5s）
```

- `SJ_API_KEY` 未設定 → Yahoo-only 模式（TWSE → Yahoo）
- Shioaji tick cache 超過 120 秒 → 視為過期，走 Yahoo fallback
- 尚未訂閱的股票 → 即時訂閱 WebSocket（快速），首次訂閱後 tick 尚未到達直接 fallback
- 台指期（TXF）：WebSocket tick push，`get_cached_futures()` 讀 memory
- TAIEX 大盤：Yahoo Finance `^TWII`（5 秒 cache）
- S&P 500 / 費半 / NASDAQ / 道瓊：Yahoo Finance（固定）

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

## 驗收策略

```bash
cd Back-End/python-backend
py -3.14 -m pytest tests/ -v   # 全套，目標 0 failures
```

**通用原則**：
- 每個任務完成後獨立跑一次 `pytest tests/`，確認不破壞現有測試
- 不修改前端接口結構與 Firestore collection 結構

---

## 代辦事項

### [Code Review] Shioaji 設計問題修正（2026-06-04 審查）

> 來源：Claude Code Review（high effort，7 角度審查）
> 背景：shioaji 1.5.0 遷移 + 啟動卡死修正後的整體審查
> **`diff_rate / 100` 單位問題已於審查當日修正（見 shioaji_manager.py line 81）**

---

#### 🔴 HIGH — 必須修

**H-1｜`get_cached_futures` 迭代 dict 時 `on_event` 從執行緒 `.clear()` → RuntimeError**

- **位置**：`services/shioaji_manager.py` `get_cached_futures()` 方法
- **問題**：`for code, data in self._futures_cache.items()` 在主執行緒迭代時，shioaji 背景執行緒可能同時執行 `on_event(event_code=2)` 的 `self._futures_cache.clear()`，觸發 `RuntimeError: dictionary changed size during iteration`，API 回傳 500。
- **修法**：改為先取快照再迭代
  ```python
  def get_cached_futures(self) -> Optional[dict]:
      for code, data in list(self._futures_cache.items()):  # list() 先拍快照
          if "TXF" in code and _is_fresh(data):
              return data
      return None
  ```

**H-2｜`asyncio.ensure_future(warmup_stocks)` 背景 Task 在 shutdown 前未取消，warmup thread 對已登出 API 發請求**

- **位置**：`main.py` lifespan + `shioaji_manager.py` `shutdown()`
- **問題**：`asyncio.ensure_future` 回傳的 Task 未儲存 handle。`lifespan` yield 後若 shutdown 觸發，`shutdown()` 先 logout，warmup 背景 Task 仍在 `_warmup_snap` 內呼叫 `self._api.snapshots()`，對死 session 發請求，thread 被卡住直到 SDK timeout。
- **修法**：儲存 Task handle，shutdown 前先 cancel
  ```python
  # lifespan 中
  _warmup_task = asyncio.ensure_future(_sj.warmup_stocks(stock_ids))

  yield

  # shutdown 段
  if _warmup_task and not _warmup_task.done():
      _warmup_task.cancel()
      try:
          await _warmup_task
      except (asyncio.CancelledError, Exception):
          pass
  await shioaji_manager.shutdown()
  ```

---

#### 🟡 MEDIUM — 應修

**M-1｜`subscribe_stocks` timeout 後已成功訂閱的股票未寫入 `_subscribed_stocks`，斷線重連後遺漏**

- **位置**：`shioaji_manager.py` `subscribe_stocks()` + `warmup_stocks()`
- **問題**：`asyncio.wait_for(subscribe_stocks, timeout=15)` 超時時 Task 被 cancel，`finally` 清掉 `_subscribing_stocks`，但 `self._subscribed_stocks.update(succeeded)` 永遠不執行。那些 thread 已實際訂閱的股票成了「無主訂閱」，斷線重連時 `_resubscribe_startup` 從 `_subscribed_stocks` 重建清單，會漏掉這些股票。
- **修法**：用 `asyncio.shield` 保護 thread 完成後的 commit
  ```python
  task = asyncio.ensure_future(asyncio.to_thread(_sub_all))
  try:
      await asyncio.wait_for(asyncio.shield(task), timeout=15)
  except asyncio.TimeoutError:
      logger.warning("subscribe_stocks shield timeout 15s, waiting for thread to commit")
      await task  # 讓 thread 自行完成（不 cancel），確保 succeeded 能被 update
  self._subscribed_stocks.update(succeeded)
  ```

**M-2｜`shutdown()` 不清空 `self._api`，與 `cleanup()` 行為不一致**

- **位置**：`shioaji_manager.py` `shutdown()` vs `cleanup()`
- **問題**：`cleanup()` 在 reinitialize 流程中會 `self._api = None`，但正常服務關閉走 `shutdown()`，只做 logout 不 null `_api`。如果 warmup 背景 thread 在 logout 後讀 `self._api`，會對死 session 操作。
- **修法**：`shutdown()` logout 後補 `self._api = None`
  ```python
  async def shutdown(self) -> None:
      if self._api and self._connected:
          await asyncio.to_thread(self._api.logout)
          self._connected = False
          self._api = None   # ← 新增，防止後續 thread 存取死 session
          logger.info("Shioaji logged out")
  ```

**M-3｜`asyncio.wait_for` 超時拋 `CancelledError`（`BaseException`），`except Exception` 抓不到，timeout 發生時完全無 log**

- **位置**：`shioaji_manager.py` `warmup_stocks()` line 247
- **問題**：Python 3.8+ `asyncio.CancelledError` 是 `BaseException` 的子類，不是 `Exception`。`subscribe_stocks` 超時時警告訊息永遠不會印出，難以診斷。
- **修法**：
  ```python
  except (Exception, asyncio.CancelledError) as e:
      logger.warning("subscribe_stocks timeout/error (non-critical): %s", e)
  ```

---

#### 🟠 LOW — 可排期

**L-1｜`_get_nearest_txf` 不檢查合約是否已到期，每月第三週三後訂閱到過期合約**

- **位置**：`shioaji_manager.py` `_get_nearest_txf()`
- **問題**：`c is not None` 只確認物件存在，不看 `delivery_date`。每月 TXF 到期後（第三週三），當月合約物件仍存在 API 中，`_get_nearest_txf` 回傳已到期合約，訂閱後不會有 tick，`_futures_cache` 整日為空。
- **修法**：加 `delivery_date` 過期判斷
  ```python
  from datetime import date as _date
  today_str = _date.today().isoformat()
  if c is not None and str(getattr(c, "delivery_date", "9999")) >= today_str:
      return c
  ```

**L-2｜`_warmup_snap` 使用 `snap.total_volume`，shioaji 1.5.0 snapshot DTO 欄位名稱未確認**

- **位置**：`shioaji_manager.py` `_warmup_snap()` line 274 + `_snap_to_dict()` line 316
- **問題**：tick 路徑已改為 `tick.vol_sum`（1.5.0 改名），但 snapshot DTO 的 `total_volume` 欄位是否也改名尚未確認。若已改名，`AttributeError` 被 `except` 吞掉，warmup 靜默填入 0 筆，影響開盤前的 cache 暖身效果。
- **修法**：實際跑 `api.snapshots()` 並 `print(dir(snap))` 確認欄位名稱，必要時更新兩處。

**L-3｜`Semaphore.locked()` 不是原子操作，並發請求可能超過 3 並行上限（TOCTOU）**

- **位置**：`shioaji_manager.py` `get_stock_snapshot()` line 331
- **問題**：`if self._snap_single_sem.locked(): return None` 和後續 `async with self._snap_single_sem:` 之間非原子。多個並發請求同時通過 `locked()` 檢查，實際並行可能超過 3。
- **修法**：移除 `locked()` 提前返回，改為直接進 `wait_for` 讓 semaphore 自然排隊；或加 `asyncio.wait_for` 限時取得。
