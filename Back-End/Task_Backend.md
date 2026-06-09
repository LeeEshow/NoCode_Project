# 個人理財雲端系統 — 後端開發任務清單

> 版本：9.1（2026-06-09）
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
- **M13 交易策略 DTO 改版 + 觸發條件自動評估完成（2026-06-09）**：`TradingStrategyDTO` 從單一 `triggerPrice` 升級為多批次 `tranches[]`；新增 `StrategyTranche`（含 `shares` 欄位）、`TriggerRule`、`ruleStatuses` 結構；REST `PATCH /rule-status` 端點（M-2 manual 確認）；`evaluate_trigger_rules()` 在 `POST /finmind/sync` 結尾批次評估 `chip_*` 類規則並寫回 `rule_statuses` + `rule_evaluated_at`；`riskRewardRatio` 後端自動計算（M-1 除以零防護）；`PATCH /dismiss` 同步更新 `status='dismissed'`（M-3）；向後相容舊 `trigger_price` 自動轉換為單批次結構（M-4）；`expires_at` lazy eval（L-1）；`tradeType=watch` 跳過 sizeRatio 驗證（L-3）；MCP `save_trading_strategy` 接受新 schema，22 個 Tool 維持不變。Code Review H-1 ～ L-3 全數處理完畢。

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

### M13 交易策略 DTO 改版 + 觸發條件自動評估

> 狀態：**已完成（2026-06-09）**｜優先級：中｜關聯文件：`FinTarck_策略DTO改版建議報告.docx`

#### 背景

現有 `TradingStrategyDTO` 為 singleton-per-stock 設計，`triggerPrice` 為單一數值，無法承載 AI 顧問的多批次分批進場邏輯。本次改版同步加入觸發條件自動評估機制，由後端每日批次計算，前端零額外 loading。

---

#### 新 DTO 完整結構

**主策略（`TradingStrategyDTO`）**

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `stockCode` | `string` | ✅ | 股票代號（不變）|
| `stockName` | `string` | ✅ | 股票名稱（不變）|
| `createdAt` | `string (ISO)` | 後端填 | 建立時間（不變）|
| `expiresAt` | `string (ISO)` | 選填 | 到期日（不變）|
| `tradeType` | `'entry'\|'add'\|'reduce'\|'exit'\|'watch'` | ✅ | 操作類型（不變）|
| `timeframe` | `'short'\|'medium'\|'long'` | ✅ | 時間框架（不變）|
| `confidence` | `'high'\|'medium'\|'low'` | ✅ | 信心程度（不變）|
| `referencePrice` | `number` | ✅ | 分析當下市價（不變）|
| `tranches` | `StrategyTranche[]` | ✅ 新增 | 多批次進場腳本，取代 `triggerPrice`，最多 4 批 |
| `stopLossPrice` | `number` | ✅ **改必填** | 停損價（原為選填）|
| `targetPriceLow` | `number` | ✅ 新增 | 停利區間下緣（取代單一 `targetPrice`）|
| `targetPriceHigh` | `number` | ✅ 新增 | 停利區間上緣 |
| `riskRewardRatio` | `number` | ✅ 新增 | 預期風報比，例如 `2.4` 代表 R:R = 1:2.4，**後端自動計算**，AI 不需填入 |
| `triggerCondition` | `string` | ✅ 新增 | 整體進場觸發條件（結構化文字）|
| `invalidationCondition` | `string` | ✅ 新增 | 策略失效條件，獨立欄位供 UI 醒目顯示 |
| `summary` | `string ≤100字` | ✅ | AI 簡述，僅保留分析邏輯，不再兼任結構化容器 |
| `status` | `'active'\|'triggered'\|'expired'\|'dismissed'` | ✅ 新增 | 策略生命週期狀態 |
| `dismissed` | `boolean` | ✅ | 使用者忽略旗標（保留，與 `status` 並存）|

> **`riskRewardRatio` 計算公式**（後端填入）：
> `(targetPriceLow - referencePrice) / (referencePrice - stopLossPrice)`

---

**批次腳本（`StrategyTranche`）**

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `batch` | `number` | ✅ | 批次序號，從 1 開始 |
| `priceLow` | `number` | ✅ | 進場區間下緣 |
| `priceHigh` | `number` | ✅ | 進場區間上緣 |
| `sizeRatio` | `number` | ✅ | 佔總部位比例，`0.0–1.0`，所有批次合計應為 `1.0`（允許 ±0.01 浮點誤差）|
| `triggerCondition` | `string` | ✅ | 此批次觸發條件（人讀文字）|
| `triggerRules` | `TriggerRule[]` | 選填 | 機器可評估的結構化條件，AI 能結構化才填，不能結構化的宏觀條件不填 |
| `ruleStatuses` | `Record<string, boolean\|null>` | 後端填 | 每條 rule 的評估結果，`true`=達成、`false`=未達成、`null`=尚未評估。**key 格式**：只有 type → `{type}`；有 period → `{type}_{period}`；有 value → `{type}_{value}`。例：`chip_dealer_buy_3`、`price_above_ma_20`、`manual`。同一 tranche 內 (type+period/value) 組合必須唯一。|
| `status` | `'pending'\|'triggered'\|'skipped'` | ✅ | 批次執行狀態 |

---

**觸發規則（`TriggerRule`）**

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `type` | `TriggerRuleType` | ✅ | 規則類型，見下表 |
| `value` | `number` | 條件填 | `price_above` / `price_below` 使用 |
| `period` | `number` | 條件填 | MA 週期（5/20/60）或籌碼連續天數 |

**`TriggerRuleType` 值域**

| 值 | 評估方 | 說明 | 範例條件 |
|----|--------|------|---------|
| `price_in_range` | 前端（即時）| 現價落在 `priceLow ~ priceHigh` 區間 | 現價可進場 |
| `price_above` | 前端（即時）| 現價 > `value` | 站上 960 |
| `price_below` | 前端（即時）| 現價 < `value` | 回測 940 以下 |
| `price_above_ma` | **後端**（每日）| 現價 > MA(`period`) | 站穩 MA5 |
| `chip_dealer_buy` | **後端**（每日）| 自營商淨買 > 0，連續 `period` 日（`period` 省略視為 1）| 自營商轉買 |
| `chip_foreign_buy` | **後端**（每日）| 外資淨買 > 0，連續 `period` 日 | 外資連買 3 日 |
| `chip_trust_buy` | **後端**（每日）| 投信淨買 > 0，連續 `period` 日 | 投信持續買超 |
| `manual` | 使用者 | 宏觀事件，機器無法判斷，`ruleStatuses` 永遠為 `null` 直到使用者手動確認 | Fed 鴿派聲明 |

---

#### Firestore 結構（snake_case 儲存）

Collection：`trading_strategies`，Document ID：`{stockCode}`

```json
{
  "stock_code": "00990A",
  "stock_name": "主動元大AI新經濟",
  "trade_type": "entry",
  "timeframe": "short",
  "confidence": "medium",
  "reference_price": 20.70,
  "tranches": [
    {
      "batch": 1,
      "price_low": 20.50,
      "price_high": 20.80,
      "size_ratio": 0.30,
      "trigger_condition": "現價可進場",
      "trigger_rules": [
        { "type": "price_in_range" }
      ],
      "rule_statuses": { "price_in_range": null },
      "status": "pending"
    },
    {
      "batch": 2,
      "price_low": 20.30,
      "price_high": 20.50,
      "size_ratio": 0.40,
      "trigger_condition": "自營商轉買確認再進",
      "trigger_rules": [
        { "type": "chip_dealer_buy", "period": 1 }
      ],
      "rule_statuses": { "chip_dealer_buy": null },
      "status": "pending"
    },
    {
      "batch": 3,
      "price_low": 18.80,
      "price_high": 19.20,
      "size_ratio": 0.30,
      "trigger_condition": "Fed 鴿派或回測 $19 支撐",
      "trigger_rules": [
        { "type": "manual" }
      ],
      "rule_statuses": { "manual": null },
      "status": "pending"
    }
  ],
  "stop_loss_price": 19.00,
  "target_price_low": 22.00,
  "target_price_high": 23.00,
  "risk_reward_ratio": 2.4,
  "trigger_condition": "自營商轉買 + 站穩 MA5",
  "invalidation_condition": "收盤跌破 $19.00，全部清倉，策略失效",
  "summary": "分三批建倉。停損 $19，停利 $22–$23，R:R 1:2.4。",
  "status": "active",
  "dismissed": false,
  "created_at": "2026-06-05T10:00:00+08:00",
  "expires_at": null
}
```

---

#### 後端改動清單

**1. `POST /finmind/sync` — 在現有邏輯最後新增評估步驟**

籌碼同步完成後，執行 `evaluate_trigger_rules()`：
- 撈出所有 `status = active` 的策略
- 對每個 tranche 的每條 `trigger_rules` 逐一評估
- 評估邏輯：
  - `price_above_ma`：取 `stock_chip/records` 最近 `period+10` 筆收盤價計算 SMA，與 `reference_price` 比較（或改取最新收盤）
  - `chip_dealer_buy` / `chip_foreign_buy` / `chip_trust_buy`：取最近 `period` 筆籌碼，確認淨買皆 > 0
  - `manual`：跳過，保持 `null`
- 將結果 batch write 回 Firestore `tranches[i].rule_statuses`

**2. MCP Tool `save_trading_strategy` — 接受新 schema**
- 新欄位全部支援
- `trigger_price`（舊欄位）標記為 deprecated，收到時轉換為 `tranches[0]`（向後相容）
- 後端自動計算 `risk_reward_ratio`，AI payload 不需填入
- 驗證：`sum(sizeRatio) ∈ [0.99, 1.01]`、`tranches` 最少 1 筆最多 4 筆、`targetPriceHigh >= targetPriceLow`

**3. REST endpoints — 回傳新 schema**
- `GET /trading-strategies`：新增 `tranches`、移除 `triggerPrice`
- `GET /trading-strategies/{stockCode}`：同上
- `PATCH /trading-strategies/{stockCode}/dismiss`：無變動
- `DELETE /trading-strategies/{stockCode}`：無變動

---

#### 向後相容策略

舊資料（只有 `trigger_price`，無 `tranches`）：
- Firestore 保留 `trigger_price` 欄位不動
- API 回傳時：若 `tranches` 不存在，自動轉換為單批次結構回傳：
  ```json
  "tranches": [{
    "batch": 1,
    "priceLow": triggerPrice,
    "priceHigh": triggerPrice,
    "sizeRatio": 1.0,
    "triggerCondition": "",
    "status": "pending"
  }]
  ```
- 前端依 `tranches` 存在與否決定渲染方式（由前端處理）

---

#### 驗收條件

- `pytest tests/` 全數通過
- `save_trading_strategy` MCP tool 接受新 schema 並正確寫入 Firestore
- `GET /trading-strategies` 回傳包含 `tranches[]` 與 `ruleStatuses`
- `POST /finmind/sync` 執行後，`chip_dealer_buy` / `chip_foreign_buy` 類 rule 的 `ruleStatuses` 更新為 `true`/`false`（非 `null`）
- 舊資料（只有 `trigger_price`）仍可正常讀取，API 自動轉換為單批次回傳

---

#### M13 規格補充說明（回應 Code Review H-1 ～ L-3）

> 依後端 Code Review 意見，以下為每個問題的設計決策與修正內容，具體實作依此為準。

---

**H-1：`price_above_ma` 資料來源 → 改為前端評估**

`stock_chip/records` 集合只存三大法人買賣超，無收盤價欄位，規格原文有誤。

**修正決策**：`price_above_ma` 改歸類為「前端（即時）評估」，與 `price_above`、`price_below`、`price_in_range` 同組。前端已有 sparkline（90 日收盤）與 kline 資料，足夠計算 MA5/MA20/MA60，後端不需另外取收盤價。

`TriggerRuleType` 評估方更正：

| 值 | 評估方（修正後）| 說明 |
|----|----------------|------|
| `price_in_range` | 前端（即時）| 現價落在 `priceLow ~ priceHigh` 區間 |
| `price_above` | 前端（即時）| 現價 > `value` |
| `price_below` | 前端（即時）| 現價 < `value` |
| `price_above_ma` | 前端（即時）| 現價 > MA(`period`)，前端用 kline/sparkline 資料計算 |
| `chip_dealer_buy` | 後端（每日）| 自營商淨買 > 0，連續 `period` 日 |
| `chip_foreign_buy` | 後端（每日）| 外資淨買 > 0，連續 `period` 日 |
| `chip_trust_buy` | 後端（每日）| 投信淨買 > 0，連續 `period` 日 |
| `manual` | 使用者 | 宏觀事件，前端顯示確認按鈕 |

---

**H-2：前端 rule 無回寫路徑 → price 類 rule 永遠不寫 Firestore**

**修正決策**：`ruleStatuses` 在 Firestore **只儲存 `chip_*` 類 rule 的評估結果**。`price_in_range`、`price_above`、`price_below`、`price_above_ma` 是純前端即時計算，**不佔 ruleStatuses 的 key**，Firestore 中也不預建這四種 key。

- 後端寫入 ruleStatuses 時，只寫 `chip_dealer_buy`、`chip_foreign_buy`、`chip_trust_buy`
- 前端的 `mergeRealTimePriceStatuses()` 負責將 Firestore 的籌碼評估結果與即時計算的價格評估結果合併後展示
- 初始化新策略（MCP tool `save_trading_strategy`）時，不預建 price 類的 ruleStatuses key

---

**H-3：`tranche.status` 與 `strategy.status` 轉換邏輯**

**tranche.status 轉換（後端）**：

`pending` → `triggered` 的充要條件（以下三者**同時**成立）：
1. 該 tranche 內至少有一條 `chip_*` 或 `manual` 類 rule
2. 所有 `chip_*` 類 rule 皆為 `true`
3. 所有 `manual` 類 rule 皆為 **non-null**（`true` 或 `false`）——即使用者已確認，無論結果

> `manual = null` 代表使用者尚未確認，屬未知狀態，應視為「條件不完整」，阻止 triggered。
> `manual = false` 代表使用者確認宏觀條件未達成，tranche 不應觸發（保持 `pending`）。
> 只有 `manual = true` 才算通過，`chip + manual 全 true` 方可 triggered。

完整邊界情境對照表：

| chip_* 狀態 | manual 狀態 | tranche.status |
|------------|------------|----------------|
| 全 `true` | 全 `true` | → `triggered` ✅ |
| 全 `true` | 有 `null` | 維持 `pending`（manual 未確認）|
| 全 `true` | 有 `false` | 維持 `pending`（manual 明確未達成）|
| 有 `false` | 任意 | 維持 `pending` |
| 只有 price / 無任何 rule | — | 維持 `pending`（後端無法評估）|

**strategy.status 轉換（後端）**：

| 條件 | 轉換 |
|------|------|
| 至少一個 tranche.status = `triggered` | `active` → `triggered` |
| `expires_at` < 今日（finmind/sync 時檢查）| `active` / `triggered` → `expired` |
| PATCH /dismiss 呼叫 | 任何 status → `dismissed` |

**前端 UI 疊加**：tranche.status 為 `triggered`（chip + manual 全達成）+ 現價也達成 → 顯示「全達成」badge。`triggered` + 現價未達成 → 顯示「籌碼達成，待價格」。前端不更新 Firestore 的 tranche.status 或 strategy.status。

---

**M-1：`riskRewardRatio` 除以零 + 語義問題**

後端計算前加入守衛條件：

```python
def compute_risk_reward(trade_type, reference_price, stop_loss_price, target_price_low):
    # 語義不適用的操作類型
    if trade_type in ("watch", "exit"):
        return None
    # 分母為零或停損設定錯誤（停損 >= 參考價，R:R 無意義）
    denominator = reference_price - stop_loss_price
    if denominator <= 0:
        return None
    # 目標價低於參考價，R:R 為負（不合理）
    if target_price_low <= reference_price:
        return None
    return round((target_price_low - reference_price) / denominator, 2)
```

`riskRewardRatio` 回傳 `null` 時，前端不顯示風報比視覺元件。

---

**M-2：manual rule 沒有確認 API → 新增端點**

新增端點：

```
PATCH /api/v1/trading-strategies/{stockCode}/rule-status
```

Request body：

```json
{
  "batch": 1,
  "ruleType": "manual",
  "confirmed": true
}
```

- `batch`：1-based（與 `StrategyTranche.batch` 欄位語義一致，避免 off-by-one）；後端依 `tranches[i].batch == batch` 定位目標批次
- `ruleType`：只允許 `manual`（price 類不需要此端點）
- `confirmed`：`true` / `false`
- 找不到對應 `batch` → 回傳 `400 Bad Request`
- 寫入 Firestore 對應 tranche 的 `rule_statuses.manual = confirmed`
- 寫入後依 H-3 定義重新評估 `tranche.status`（chip_* 全 true AND manual 全 non-null 才 triggered），並同步評估 `strategy.status`

---

**M-3：`status` 與 `dismissed` 欄位冗餘**

**修正決策**：兩欄位並存，以下行為統一：

- `PATCH /dismiss` 必須同步設定 **`dismissed = true`** AND **`status = 'dismissed'`**（目前規格只寫了 `dismissed`，需補上 status 同步）
- `dismissed = true` 的優先級永遠高於 `status` 欄位。API 回傳時：若 `dismissed == true`，一律回傳 `status: 'dismissed'`（即使 Firestore 的 `status` 欄位是其他值）
- 反向不成立：`status = 'dismissed'` 但 `dismissed = false`，視為資料不一致，API 以 `dismissed = false` 為準，回傳實際 `status`

---

**M-4：向後相容 `tranches[0]` 缺欄位**

補完向後相容轉換結構：

```json
"tranches": [{
  "batch": 1,
  "priceLow": triggerPrice,
  "priceHigh": triggerPrice,
  "sizeRatio": 1.0,
  "triggerCondition": "",
  "triggerRules": [],
  "ruleStatuses": {},
  "status": "pending"
}]
```

`triggerRules: []` 與 `ruleStatuses: {}` 必須補上，避免前端讀到 `undefined` 而報錯。

---

**L-1：`expires_at` 到期轉換觸發時機**

雙重觸發機制：
1. **每日 finmind/sync 結尾**：掃描所有 `status ∈ ['active', 'triggered']` 且 `expires_at ≠ null` 且 `expires_at < 今日` 的策略，批次更新 `status = 'expired'`
2. **API 讀取時 Lazy eval**：`GET /trading-strategies` 與 `GET /trading-strategies/{stockCode}` 回傳前，若 `expires_at < today`，response 中覆蓋 `status = 'expired'`（不主動寫回 Firestore，下次 sync 才寫）

---

**L-2：`ruleStatuses` 缺 `evaluatedAt` 時間戳**

每個 tranche 新增 `rule_evaluated_at` 欄位（ISO 8601）：

```json
{
  "rule_statuses": { "chip_dealer_buy": true },
  "rule_evaluated_at": "2026-06-08T06:15:00+00:00"
}
```

- finmind/sync 批次寫入 `rule_statuses` 時，同步更新 `rule_evaluated_at = datetime.now(timezone.utc).isoformat()`（含時區資訊 `+00:00`，與 `created_at` 格式一致）
- API camelCase 回傳為 `ruleEvaluatedAt`
- 前端可據此顯示「籌碼資料截至 YYYY-MM-DD」提示

---

**L-3：`tradeType = 'watch'` 時 `sizeRatio` 合計驗證**

`sum(sizeRatio) == 1.0` 驗證邏輯依 `tradeType` 調整：

| tradeType | sizeRatio 驗證 |
|-----------|----------------|
| `entry` | 必須 ∈ [0.99, 1.01] |
| `add` | 必須 ∈ [0.99, 1.01] |
| `reduce` | 必須 ∈ [0.99, 1.01] |
| `exit` | 必須 ∈ [0.99, 1.01] |
| `watch` | **跳過驗證**（觀察清單，無部位比例語義）|

---

## StrategyTranche.shares 欄位（2026-06-08 新增）

`StrategyTranche` 新增必填欄位 `shares: int`，代表 AI 建議的**絕對股數**。

### Firestore 欄位名稱

`shares`（整數）

### MCP `save_trading_strategy` 計算規則

AI 呼叫工具時，每個 tranche 必須填入 `shares`：

| tradeType | 計算方式 |
|-----------|---------|
| `reduce` / `exit` | `round(positionShares × sizeRatio)`，positionShares 從 `get_holdings` 取得 |
| `entry` / `add` | AI 自行決定建議股數（可依目標金額 / 進場中價估算，或以整張 1000 股為單位）|
| `watch` | `0`（無實際操作，填 0）|

### API 回傳

camelCase：`shares`，型別 `int`

### 前端顯示

批次標題行直接顯示：`第 N 批  $X – $Y  ·  10 股`
