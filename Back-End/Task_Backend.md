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

- **【已修正待驗證】Shioaji event loop 卡死（2026-07-22 定位，2026-07-22 修正）**：後端 `fastapi.service` 近期反覆卡死（7/14、7/22 各發生一次，症状皆為所有 HTTP 端點無回應、需 `systemctl restart` 才恢復）。用 `py-spy dump` 在卡死當下（7/22 03:xx）抓到的 stack trace 顯示：

  - Shioaji SDK 原生 callback thread（非 Python `threading` 建立，`py-spy` 只看得到單一 Python frame、無 `_bootstrap` 呼叫鏈）停在 `services/shioaji_manager.py:86`（`on_stk_tick` 內），事件迴圈 thread（uvicorn main）與所有 worker thread 同時呈現 idle，符合「GIL 被某個 callback thread 卡住不放」的模式。
  - 追查程式碼發現 `services/shioaji_manager.py:143`（`on_event` 的 `event_code == 4` 重連分支）**仍在使用 `asyncio.run_coroutine_threadsafe(self._resubscribe_startup(), self._loop)`**。
  - 但 `services/shioaji_manager.py:119-129`（`on_fop_tick` 換盤偵測，commit `28c98f7fix(shioaji)`）的程式碼註解已明確記載同一類 bug 並改用 `call_soon_threadsafe` 修復：
    > 使用 call_soon_threadsafe 而非 run_coroutine_threadsafe，避免在 Python 3.14 的 callback thread 中建立 concurrent.futures.Future 而導致 threading lock 阻塞 Shioaji callback thread。
  - **研判根因**：`on_event` 重連回呼（Shioaji WebSocket 斷線重連時觸發，`event_code==4`）沒有套用同樣的修法，仍在建立 `concurrent.futures.Future`（`run_coroutine_threadsafe` 內部行為），在 Python 3.14 + 非 Python 建立的原生 callback thread 組合下觸發同一個 threading lock 阻塞，進而卡住整個 process（含 event loop thread），導致所有 API 無回應，只能重啟恢復。`on_stk_tick` 本身不含任何 asyncio 呼叫，py-spy 抓到它停在該行，較可能是「受害者」（GIL 被 `on_event` 卡住的 thread 佔用不放，導致其他 callback thread 也連帶卡在自己正在執行的那一行），而非它自己是根因。

  - **建議修法**（比照 `on_fop_tick` 已驗證有效的模式）：
    ```python
    # services/shioaji_manager.py:143
    # before:
    asyncio.run_coroutine_threadsafe(self._resubscribe_startup(), self._loop)
    # after:
    self._loop.call_soon_threadsafe(
        asyncio.ensure_future, self._resubscribe_startup()
    )
    ```
  - **驗證方式**：修正後需在盤中觀察至少一次 Shioaji 斷線重連事件（或人為觸發重連），確認 `on_event` 不再導致 process 卡死；另建議全文搜尋是否還有其他 callback（`on_tick_*`、`on_event`、`on_*`）殘留 `run_coroutine_threadsafe` 呼叫，一併改用 `call_soon_threadsafe`。
  - **佐證**：`grep -rn "run_coroutine_threadsafe" services/` 目前僅剩這一處。

  - **已套用修正（2026-07-22）**：`services/shioaji_manager.py` 的 `on_event`（`event_code == 4` 重連分支）已改為 `self._loop.call_soon_threadsafe(asyncio.ensure_future, self._resubscribe_startup())`，比照 `on_fop_tick` 已驗證模式，並補上相同說明註解。全文複查 `python-backend/` 已無殘留 `run_coroutine_threadsafe` 呼叫。
  - **⚠️ 驗證結果：修正不完全，8/6 又復發**。2026-08-06 12:31–12:33（台北時間；伺服器為 UTC）再次發生同樣症狀，`git log -1` 確認 GCE 上已跑著含上述修正的版本（commit `4768284`），`grep` 確認全專案已無 `run_coroutine_threadsafe`。代表 `on_event` 那個修法本身沒錯，但**不是這個 bug 唯一的觸發點**，Shioaji 1.5.0 原生 tick 派送層與 Python 3.14 的 GIL 互動存在不只一處風險，無法靠逐一修補 Python callback 根治。詳細後續診斷、與 Gemini/Antigravity（暱稱 agy）交叉討論後的共識與待辦，見下方新條目。

---

- **【規劃中】Shioaji GIL 卡死 — 根因升級診斷 + 分層防護計畫（2026-08-07，Claude + Gemini/Antigravity 交叉審查共識）**

  ### 已知事實（三次卡死事件時間軸，伺服器時區確認為 UTC）

  | 事件 | UTC 時間 | 台北時間 | 落點 |
  |------|----------|----------|------|
  | Jun 17 | 03:26–03:31 | 11:26–11:31 | 台股盤中 |
  | Jul 14 | 01:00–01:03 | 09:00–09:03 | 台股開盤瞬間 |
  | Aug 06 | 04:31–04:33 | 12:31–12:33 | 台股盤中 |

  三次全部發生在台股交易時段內，跟日夜盤換盤時間點（台北 05:00／15:00）對不上，**收盤後關閉 Shioaji 連線對這三次事件沒有幫助**——卡死當下連線本來就是必要的，此方向已評估後排除。

  ### 根因層級診斷

  1. **GIL 整個被卡死，不是單純某個 coroutine 忘記 await**。8/6 事件用 `py-spy dump` 抓到 `on_stk_tick`（`services/shioaji_manager.py:83`）卡在原生 callback thread，但更關鍵的是：`main.py` 既有的 `_watchdog_thread`（heartbeat 90 秒逾時 or HTTP `/health` 連續 3 次失敗 → 自動 `SIGTERM`）**這次完全沒有觸發**，卡了 5 天沒自動重啟。Watchdog thread 本身也是 Python thread，一樣需要 GIL 才能執行 `os.kill()`，GIL 死鎖時它自己也一起被凍結，這是「進程內 watchdog」的結構性缺陷，不是這次才有的巧合。
  2. 確認開發環境 GIL 為標準開啟模式（`sys._is_gil_enabled() == True`），排除 free-threading build 的臆測。
  3. 查證 Shioaji PyPI metadata：`requires_python = ">=3.7"`，無上限、無版本 classifier，官方沒有為任何特定 Python 版本背書。降版建議的理由**不是**「Python 3.14 不穩定」（3.14 已於 2025/10 GA，伺服器上的 `3.14.5` 是第 5 個 patch release，屬正常穩定版），而是「Shioaji 是小眾券商 SDK，底層 pybind11 編譯的原生 C++ thread，實務上不太可能驗證過最新 CPython 內部機制（3.13+ 為 free-threading 鋪路調整了不少 threading 底層），且本專案已獨立在 `on_fop_tick`、`on_event` 兩處分別踩過同一類『Python 3.14 callback thread + threading lock』的坑，這次 `on_stk_tick` 附近又復發，指向問題出在 Shioaji 原生派送層，不是能靠逐一修 Python callback 根治的」。

  ### 執行優先順序（依風險/效益排序，前後兩層彼此獨立可平行進行）

  **順位 1（已完成，2026-08-07）：Systemd 外部 Watchdog（`sd_notify` + `WatchdogSec`）**

  - **實作**：commit `ee40ad6`（`main.py` 新增 `_sd_notify`/`_http_healthy_async`/`_sd_notify_loop`）、`e0e3877`（補啟動緩衝期修正部署後觀察到的偽陽性）。`/etc/systemd/system/fastapi.service` 改 `Type=notify` + `WatchdogSec=90`（此檔不在 git repo，已於 GCE 手動改）。
  - **部署驗證**：`journalctl` 確認 `Running under systemd Type=notify; external watchdog active (WatchdogSec)` 正常輸出；啟動後每 15 秒一次 `GET /health` 皆為 `200 OK`，無任何 `Warning: HTTP health check failed`。
  - **過程教訓（記錄避免重演）**：第一次部署時**先改了 systemd 設定、後補程式碼**，導致舊版程式碼（不會送 `READY=1`）遇到 `Type=notify` 卡在 `activating (start)` 直到逾時。往後任何需要「程式碼 + systemd 設定」搭配生效的變更，**必須先確認新程式碼已部署到伺服器並重啟驗證過，才能動 systemd unit 設定**，順序不可顛倒。
  - **尚未驗證的部分**：目前只確認「正常運作時不會誤判、不會亂重啟」，**尚未實際驗證「event loop 真的卡死時，systemd 是否會在 90 秒內確實強制重啟」**。建議找非交易時段找方式模擬卡死（如故意跑一段長時間佔用 GIL 的同步操作）驗證這條路徑，目前無法保證 watchdog 對真實 GIL 死鎖有效，只能保證邏輯設計上應該有效。

  **順位 2（現在排期、獨立驗證軌道，不可因順位 1 上線而降低優先度）：Python 3.14 → 3.12 降版**
  - 理由：Watchdog 只縮短卡死後的恢復時間，不會降低卡死本身的發生機率；三次事件都在盤中，每次卡死對交易輔助系統都是真實成本。用「觀察一兩週重啟頻率」來決定要不要降版在統計上不成立——三次已知事件全靠人工發現才被記錄，watchdog 上線前完全沒有系統性監控，樣本數本身就是低估的下界；且已知事件間隔本來就是數週一次，一兩週的觀察窗不具統計意義。
  - 影響範圍（明顯大於順位 1，需獨立測試視窗）：整個 `.venv` 重建（`requirements.txt` 內容不變，3.12 下重新安裝）、需完整跑 `pytest` 並手動驗證所有 Shioaji 依賴功能（即時報價、台指期快取、22 個 MCP Tool、開機暖身流程）、建議先在獨立測試環境驗證再切換 production，不要原地降版。爆炸半徑是整個後端而非只有 Shioaji。

  **順位 3（現在只做設計，不可上線）：Shioaji Canary 自癒機制（TXF tick 新鮮度監控 + 分層修復）**
  - 概念：`services/shioaji_manager.py` 新增背景迴圈，若台指期近月合約 tick 在交易時段內超過設定秒數未更新，先呼叫既有的 scoped reinitialize 邏輯自我修復，僅在連續多次失敗後才升級為停止送 `WATCHDOG=1`、觸發 systemd 全域重啟（避免子系統故障就讓完全不依賴 Shioaji 的其他 API 一起被重啟拖下水）。
  - **上線前必須解決的阻塞項（目前設計有真實漏洞，未解決前不可部署）**：
    1. 「是否為交易時段」的判斷**不可另外手刻一套規則**，必須與既有 `_txf_session()` 共用同一個真實來源，避免專案內出現兩套不一致的交易時段定義。
    2. **完全沒有處理國定假日**（尤其農曆春節連續休市近一週）。目前設計只用星期幾 + 時分判斷，遇到長假會連續好幾天每隔設定週期誤判為「tick 黑洞」並瘋狂觸發 reinitialize，正是設計本身想避免的「重連風暴導致帳號被鎖」風險，只是觸發原因從網路中斷換成假日誤判。**建議先確認 Shioaji SDK 是否有官方交易日曆/合約狀態查詢 API，沒有的話至少要接一份有維護的休市日清單（可先查 FinMind 資料源是否已有交易日曆端點），不要重新手刻曆法規則**——手刻日期邊界正是 `_txf_session()` 換盤那次 bug 的同一種風險類型，這次會出現在故障偵測機制本身。
    3. 自動觸發 reinitialize 前必須檢查並共用既有的 `self._reinitializing` flag，避免跟手動觸發的 `POST /system/shioaji/reinitialize` 端點併發登入。
    4. `shioaji_enabled() == False`（如本機開發未設定 API key）時，canary 背景迴圈不應啟動，避免拿空 cache 誤判。
  - 影響範圍（阻塞項解決後）：僅限 `services/shioaji_manager.py`，自癒動作只重建 Shioaji 連線，不影響其他 API；只有多次失敗才升級為全域重啟。

  **順位 4（現階段不執行，僅保留為後路）：Multiprocessing 隔離**
  - 將 Shioaji 連線隔離至獨立子進程，即使該進程卡死也不影響主 FastAPI process；若未來降版後仍復發，代表問題不是 Python 版本造成、而是 Shioaji SDK 自身的併發問題，屆時這會是唯一的結構性解法。
  - 現階段不確定降版能否解決根因之前先不投入，避免浪費工程資源；若真的要做，設計原則是子進程只做「啟動 Shioaji + 接收 tick」，透過 Pipe/Queue 只回傳純資料（`code, price, timestamp` 等），避免傳遞無法 pickle 的 Shioaji C++ 物件。
