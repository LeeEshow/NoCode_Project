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

## 現況（2026-05-29）

- **M1–M8 全部完成**：Python FastAPI 後端穩定運作於 Azure App Service
- **MCP 全部完成**：18 個 Tool + SSE/Streamable HTTP 雙傳輸層
- **層一、層二優化完成**：MCP fail-closed、Cache LRU、CORS env、Settings 集中、Circuit Breaker 等
- **FinMind 同步完成**：三大法人 + 基本面資料；`yfinance` 已移除
- **舊服務清理完成**（2026-05-25）：`Back-End/backend/`（Node.js）、`Back-End/Shioaji_API/` 已移除
- **報價架構改回 WebSocket Tick**（2026-05-29）：`api.snapshots()` HTTP REST 在 Azure 上因 NAT 殭屍連線導致 thread pool 耗盡；改回 WebSocket tick push + memory cache 方案。個股報價完全不走 HTTP。啟動時批次訂閱持股 + 關注清單 tick，並一次性 `api.snapshots()` 暖身填充 cache（解決 9:20 開盤延遲）。TAIEX 改由 Yahoo Finance `^TWII` 提供（Index 不支援 Tick）。Circuit Breaker 保留但不再介入報價熱路徑。
- **後端阻塞修復（2026-05-29）**：① `asyncio.create_task()` 從 Shioaji 執行緒呼叫（event loop corruption root cause）改為 `run_coroutine_threadsafe`；② quote_service subscribe 改為背景 `ensure_future`，熱路徑不阻塞；③ asyncio default executor 統一換為 `_io_executor`（Azure B1 預設只有 5 workers）；④ `asyncio.get_event_loop()` 全面改為 `get_running_loop()`
- **Shioaji 前端重新初始化（2026-05-29）**：新增 `POST /api/v1/system/shioaji/reinitialize`（202 立即返回 + 非同步 cleanup→init→warmup）；`get_status()` 新增 `reinitializing` 欄位；前端輪詢 `GET /system/status` → `data.apiSwitch.providers.shioaji.initialized`

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

---

### [完成] Shioaji 前端觸發重新初始化

**背景**：診斷畫面出現 `connected: true` 但 `initialized: false` 時（通常因 TXF 合約訂閱失敗），目前只能重啟整個後端進程。前端希望能在 SettingsModal 診斷區直接觸發重新初始化，免 SSH。

**需新增 Endpoint**

`POST /api/v1/system/shioaji/reinitialize`

**行為規格**

| 項目 | 說明 |
|------|------|
| 回傳時序 | **立即返回 `202 Accepted`**；初始化為非同步，前端輪詢 `GET /system/status` 確認結果 |
| Reinit Lock | 若正在初始化中，拒絕並返回 `409 Conflict`，防止並發呼叫 |
| Cleanup | 先執行現有 disconnect / cleanup 邏輯（若有），避免重複 login 行為未定義 |
| Init | 從 env 讀取 `SJ_API_KEY / SJ_SECRET_KEY`，呼叫 `shioaji_manager.initialize()` |
| Warmup | Init 成功後接著呼叫 `warmup_stocks()`，重新訂閱持股 + 關注清單 |
| 失敗 | `initialized` 維持 `false`；前端從 `/system/status` 得知失敗，無需後端另行通知 |

**前端預期輪詢流程（供參考）**
```
POST /system/shioaji/reinitialize → 202
每 2s 輪詢 GET /system/status
直到 initialized=true 或 20s 逾時顯示失敗
```

**驗收條件**
- `initialized=false` 狀態下呼叫 → 202，後台開始重新初始化，HTTP 不阻塞
- 並發第二次呼叫 → 409
- 成功後 `/system/status` 回傳 `initialized=true`、`subscribedStocks > 0`
- 失敗後 `/system/status` 回傳 `initialized=false`，不影響其他功能



---

### [完成] BUG — 重新初始化後 `subscribedStocks` 回傳 0

**現象**：前端輪詢到 `initialized=true` 停止時，`subscribedStocks` 顯示 0。

**根本原因**：`shioaji_manager.py` 的 `initialize()` 在第 59 行（`self._initialized = True`）設定完成旗標，但個股訂閱（`subscribe_stocks`）在之後的 `warmup_stocks()` 才執行。`_bg_reinitialize()` 的呼叫順序為：

```
initialize()          ← _initialized = True  ← 前端偵測到停止輪詢
warmup_stocks()       ← 個股訂閱在這才做
```

前端停止輪詢時 warmup 尚未完成，故 `subscribedStocks = 0`。

**修法建議**：在 `_bg_reinitialize()` 中，`initialize()` 呼叫完後先把 `_initialized` 暫時設回 `False`，等 `warmup_stocks()` 成功完成才重新設為 `True`；或者在 reinit flow 中改用 `_initialized = True` 最後才執行（只影響 reinit path，不動 `initialize()` 本身）。

**驗收條件**：前端輪詢到 `initialized=true` 時，`subscribedStocks` 應 > 0（等於持股＋關注清單總數）。
