# 個人理財雲端系統 — 後端開發任務清單

> 版本：9.3（2026-06-12）
> 參考文件：Back-End\CLAUDE.md

---

## 現況（2026-06-12）

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
- **M13 交易策略 DTO 改版 + 觸發條件自動評估完成（2026-06-09）**：`TradingStrategyDTO` 從單一 `triggerPrice` 升級為多批次 `tranches[]`；新增 `StrategyTranche`（含 `shares` 欄位）、`TriggerRule`、`ruleStatuses` 結構；REST `PATCH /rule-status` 端點（M-2 manual 確認）；`evaluate_trigger_rules()` 在 `POST /finmind/sync` 結尾批次評估 `chip_*` 類規則並寫回 `rule_statuses` + `rule_evaluated_at`；`riskRewardRatio` 後端自動計算（M-1 除以零防護）；`PATCH /dismiss` 同步更新 `status='dismissed'`（M-3）；向後相容舊 `trigger_price` 自動轉換為單批次結構（M-4）；`expires_at` lazy eval（L-1）；`tradeType=watch` 跳過 sizeRatio 驗證（L-3）；MCP `save_trading_strategy` 接受新 schema，22 個 Tool 維持不變。Code Review H-1 ～ L-3 全數處理完畢。
- **M15-BE-2 preferences `wlCollapsedGroups` 完成（2026-06-12）**：`DEFAULTS` 加 `wlCollapsedGroups: []`；`_from_firestore` 讀取並回傳；`PUT /preferences` 直接取代（非 deep merge）；Firestore `.set()` 寫入；GET 無欄位時預設 `[]`。9 個 pytest 全過。
- **M15-BE 關注清單 `group` 欄位完成（2026-06-12）**：`watchlist/{stockId}` Firestore document 新增 `group: str | None`；`GET /watchlist` response 帶出 `group` 欄位（無欄位時回 `null`）；`PUT /watchlist/{id}` 接受 `group` 更新（`null` 清空分組）；400 校驗改為三個可選欄位均未提供才報錯。9 個 pytest 全過。
- **M14 Firestore 讀取優化完成（2026-06-10）**：新增 `POST /api/v1/stocks/quotes`（`routers/stocks.py`）；前端帶 `{ codes: string[] }` 直接查報價，後端呼叫 `get_quotes()` 零 Firestore 讀取；Pydantic `QuotesRequest` model 驗證（空陣列 / 超過 50 支回 422）；`GET /holdings/prices` 保留不動（deprecated）；`test_m4_stocks.py` 補 5 個 M14 測試案例，全套 pytest 通過。

---

## 代辦事項

---

*(代辦清單目前為空)*
