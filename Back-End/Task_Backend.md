# 個人理財雲端系統 — 後端開發任務清單

> 版本：9.0（2026-06-05）
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

## 現況（2026-06-05）

- **M1–M8 全部完成**：Python FastAPI 後端穩定運作於 GCE e2-micro（asia-east1-b）
- **MCP 全部完成**：22 個 Tool + SSE/Streamable HTTP 雙傳輸層
- **層一、層二優化完成**：MCP fail-closed、Cache LRU、CORS env、Settings 集中、Circuit Breaker 等
- **FinMind 同步完成**：三大法人 + 基本面資料；`yfinance` 已移除
- **舊服務清理完成**（2026-05-25）：`Back-End/backend/`（Node.js）、`Back-End/Shioaji_API/` 已移除
- **報價架構改回 WebSocket Tick**（2026-05-29）：`api.snapshots()` HTTP REST 在 Azure 上因 NAT 殭屍連線導致 thread pool 耗盡；改回 WebSocket tick push + memory cache 方案。個股報價完全不走 HTTP。啟動時批次訂閱持股 + 關注清單 tick，並一次性 `api.snapshots()` 暖身填充 cache（解決 9:20 開盤延遲）。TAIEX 改由 Yahoo Finance `^TWII` 提供（Index 不支援 Tick）。Circuit Breaker 保留但不再介入報價熱路徑。
- **後端阻塞修復（2026-05-29）**：① `asyncio.create_task()` 從 Shioaji 執行緒呼叫（event loop corruption root cause）改為 `run_coroutine_threadsafe`；② quote_service subscribe 改為背景 `ensure_future`，熱路徑不阻塞；③ asyncio default executor 統一換為 `_io_executor`（Azure B1 預設只有 5 workers）；④ `asyncio.get_event_loop()` 全面改為 `get_running_loop()`
- **Shioaji 前端重新初始化（2026-05-29）**：新增 `POST /api/v1/system/shioaji/reinitialize`（202 立即返回 + 非同步 cleanup→init→warmup）；`get_status()` 新增 `reinitializing` 欄位；前端輪詢 `GET /system/status` → `data.apiSwitch.providers.shioaji.initialized`
- **清倉後持股殘留修復（2026-06-02）**：`POST /holdings/recalculate` 中，若 `sharesHeld == 0` 改為 `batch.delete(ref)` 刪除 Firestore 文件；同步清除對應 `asset_tags` 文件。
- **M9 MCP Tag 寫入工具完成（2026-06-03）**：新增 `update_tag`（dry_run 兩階段、寫後自動重算 dynamicRisk）、`set_asset_tags`（idempotent PUT、Firestore batch write 原子性）；MCP Tool 總數 18 → 20。
- **M10 AI 個股交易策略完成（2026-06-03）**：新增 `trading_strategies` Firestore collection（singleton-per-stock）；REST 端點 GET/GET_one/PATCH(dismiss)/DELETE；MCP Tool `save_trading_strategy`、`get_trading_strategy`；MCP Tool 總數 20 → 22。
- **M11 後端遷移 GCE 完成（2026-06-03）**：Azure App Service B1 → GCE e2-small（asia-east1-b，35.201.176.69）；systemd fastapi.service 常駐；Nginx + Let's Encrypt SSL；Duck DNS `eshowfintarck.duckdns.org`。
- **M12 Cloud Run HTTPS Proxy 完成（2026-06-04）**：解決公司防火牆封鎖 DuckDNS；部署 Nginx Proxy 至 Cloud Run，實際 URL：`https://fintarck-proxy-1077248196503.asia-east1.run.app`。
- **shioaji 1.5.0 相容性修正（2026-06-04）**：升級至 shioaji 1.5.0 後三項破壞性變更一次性修正：
  - 欄位改名：`price_chg→diff_price`、`pct_chg→diff_rate`、`total_volume→vol_sum`
  - `tick.datetime` 從 `datetime` 物件改為 7 元素 tuple，需 `datetime(*tick.datetime, tzinfo=_TZ_TAIPEI)` 解包
  - `Futures.TXF` ContractGroup iteration 失效（1.5.0 bug），改為月份代碼直接查詢（`TXFF6`/`TXFG6`）
  - 漲跌幅單位：`tick.diff_rate`（**int**，1/100%，需 `/100`）vs `snap.change_rate`（**float**，直接 %，不需 `/100`）
- **景氣燈號移除（2026-06-05）**：`GET /api/v1/market/export-indicator` 及 NDC 爬蟲完全移除。GCE IP 被 `index.ndc.gov.tw` 封擋（403），FinMind 需付費方案，無替代免費來源。同時移除 `ndc_cb`、`ndc_sem`。
- **shioaji Code Review 待修清單完成（2026-06-05）**：shioaji 1.5.0 遷移後的整體 Code Review 8 項問題全數修正（H-1/H-2/M-1/M-2/M-3/L-1/L-2/L-3）。詳見 CLAUDE.md shioaji 1.5.0 章節。

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

### Code Review 待修清單（2026-06-05，前端 AI review）

#### 🔴 H-1｜`_subscribed_stocks.update()` 被外層 timeout 跳過
**檔案**：`services/shioaji_manager.py`  
**問題**：`warmup_stocks` 用 `wait_for(timeout=15)` 包住 `subscribe_stocks`，但 `subscribe_stocks` 內部 shield 也是 15s。兩個 timeout 同時觸發時，外層 CancelledError 在 `await task`（無 timeout）這行打斷執行，導致 `_subscribed_stocks.update(succeeded)` 永遠不被呼叫。成功訂閱的股票不被記錄，下次重跑視為未訂閱，Shioaji 端重複訂閱報錯。  
**修法**：`warmup_stocks` 的外層 timeout 改為 `30`（> 內層 `15`），或把 `_subscribed_stocks.update(succeeded)` 移進 `finally` 區塊。

#### 🔴 H-2｜`get_index_kbars` 在 shutdown 後存取 `self._api = None`
**檔案**：`services/shioaji_manager.py`、`routers/market.py`  
**問題**：`shutdown()` 新增 `self._api = None`，但 `get_index_kbars` 的 `_fetch` closure 直接用 `self._api.Contracts`，不走有 None 防護的 `.api` property。Router 只 catch `asyncio.TimeoutError`，shutdown 競態時 `AttributeError` 變成未處理的 500。  
**修法**：`_fetch` 第一行加 `if self._api is None: return []`。

#### 🟡 M-1｜`delivery_date` 字串比較假設格式為 `YYYY/MM/DD`
**檔案**：`services/shioaji_manager.py`（`_get_nearest_txf`）  
**問題**：`today_str = today.strftime("%Y/%m/%d")` 跟 `str(getattr(c, "delivery_date", ...))` 做字串比較。若 Shioaji 回傳 `datetime.date` 物件，`str()` 產出 `YYYY-MM-DD`（dash），`-`（0x2D）< `/`（0x2F），比較永遠 False，兩個月份合約全被拒絕 → TXF 訂閱靜默消失。  
**修法**：統一轉成 `datetime.date` 物件後再比較，不依賴字串格式。

#### 🟡 M-2｜`await _warmup_task` 在 shutdown 時無 timeout，可能卡住進程
**檔案**：`main.py`  
**問題**：`_warmup_task.cancel()` 後執行 `await _warmup_task` 無 timeout。`subscribe_stocks` 內的 `await task`（shield 後）會等 Shioaji thread 完成，若 broker 網路 I/O 卡住，systemd graceful period 跑完後強制 kill，等同髒關機。  
**修法**：
```python
try:
    await asyncio.wait_for(_warmup_task, timeout=5)
except (asyncio.CancelledError, asyncio.TimeoutError, Exception):
    pass
```

#### 🟢 L-1｜`INDEX_ENTRIES` 每次 request 重建
**檔案**：`routers/stocks.py`  
**問題**：`INDEX_ENTRIES = [...]` 定義在 handler 函式內，每次 `/stocks/search` 都重新分配 list。  
**修法**：移到 module-level 常數。
