# 交易策略系統強化規劃

> **文件版本**：v1.2  
> **日期**：2026-06-13  
> **基準狀態**：依目前前端 React / 後端 FastAPI 程式碼盤點後修訂  
> **目的**：補齊 AI 交易策略的「批次執行追蹤」與「策略 / 再平衡衝突決策輔助」，並維持現有 MVVM 與 Firestore DTO 風格

---

## 1. 目前開發狀態評估

### 1.1 後端現況

後端已完成 M13 交易策略 DTO 改版：

- Firestore collection：`trading_strategies`
- singleton-per-stock：每檔股票只保留一份最新 AI 策略
- REST 已有：
  - `GET /api/v1/trading-strategies`
  - `GET /api/v1/trading-strategies/{stockCode}`
  - `PATCH /api/v1/trading-strategies/{stockCode}/dismiss`
  - `PATCH /api/v1/trading-strategies/{stockCode}/rule-status`
  - `DELETE /api/v1/trading-strategies/{stockCode}`
- MCP 已有：
  - `save_trading_strategy`
  - `get_trading_strategy`
- DTO 已支援：
  - `tranches[]`
  - `triggerRules`
  - `ruleStatuses`
  - `ruleEvaluatedAt`
  - `riskRewardRatio`
  - `expiresAt` lazy eval
- 測試已有 `test_m10_trading_strategies.py`，涵蓋新舊 schema、rule-status、dismiss、delete、MCP 驗證。

缺口：

- 尚未支援「使用者已執行某批」的 endpoint。
- `_tranche_to_dto()` 尚未輸出 `executedAt`、`executedPrice`、`executedShares`。
- `_compute_strategy_status()` 尚未處理全部批次完成後的 completed 狀態。
- `StrategyStatus` 後端 / 前端型別尚未包含 `completed`。

### 1.2 前端現況

前端已完成交易策略核心 UI：

- `types/index.ts`
  - 已有 `TradingStrategyDTO`
  - 已有 `StrategyTranche`
  - 已有 `TrancheStatus = pending | triggered | skipped | waiting`
- `models/tradingStrategyModel.ts`
  - 已有 getAll / getOne / dismiss / remove / updateRuleStatus
- `viewmodels/useTradingStrategyViewModel.ts`
  - 已有 strategies map state
  - 已有 `load`、`dismiss`、`remove`、`getStatus`、`confirmManualRule`
  - 已使用 `useLatest(strategies)` 避免部分 stale closure 問題
- `utils/tradingStrategy.ts`
  - 已有 `resolveStrategyStatus`
  - 已有 `ruleKey`
  - 已有 `mergeRealTimePriceStatuses`
- `TradingStrategyModal.tsx`
  - 已呈現策略 header、價格軸、批次列、規則狀態、再平衡建議、AI summary
  - 已支援 manual rule inline 確認
- `HoldingsTable.tsx`
  - 已有 `StrategyBadge`
  - 已可點擊開啟策略 Modal
- `StockExpandPanel`
  - 已接收再平衡 suggestion，展開列已可顯示再平衡相關資訊

缺口：

- 尚未支援 `executed` 批次狀態。
- 尚未提供「確認執行」表單與 API 呼叫。
- 尚未分析交易策略方向與再平衡方向是否衝突。
- `TradingStrategyModal` 已有 `suggestion` prop，但目前只顯示建議，尚未做衝突解讀。
- `HoldingsTable.StrategyBadge` 尚未顯示已完成批次或衝突提示。

---

## 2. 核心問題重新定義

### 問題 A：批次建議沒有執行狀態

AI 可能產生多批次策略，例如：

- 第 1 批：40%，185-190 元
- 第 2 批：60%，175-180 元

目前系統能判斷批次條件是否觸發，但不能記錄使用者是否已實際交易。

風險：

- 使用者可能重複下單。
- 使用者可能忘記某批已完成。
- 策略生命週期無法從「觸發」推進到「完成」。

### 問題 B：TAA 策略與 SAA 再平衡可能方向相反

AI 交易策略偏戰術層 TAA，通常依價格、技術、籌碼、事件驅動。

再平衡建議偏戰略層 SAA，通常依目標權重、風險標籤、流動性與成本效益驅動。

方向可能衝突：

- AI 策略建議加碼，但再平衡建議減碼。
- AI 策略建議停利 / 出場，但再平衡建議買回目標權重。

目前 UI 只並列顯示，缺少一層「這兩個訊號為何衝突、該怎麼判斷」的說明。

---

## 3. 修訂後實作策略

建議順序改為：

```
Phase B  方向衝突偵測與 UI 提示        ✅ 已完成（2026-06-13）
Phase A  批次執行追蹤                 ← 進行中，需後端 API + DTO + 測試
Phase C  風險環境覆寫警示             ← 第三，需先統一 marketState 命名
Phase D  策略生命週期與交易紀錄串接    ← 選配，長期優化
```

調整原因：

- Phase B 不依賴後端，能快速提升決策品質。
- Phase A 牽涉 DTO、Firestore 寫入、測試與前端 rollback，應完整處理。
- Phase C 目前文件使用 `risk_off`，但現有型別是 `risk-off`，需先避免命名不一致。
- Phase D 可把「確認執行」進一步串到交易紀錄，但不應阻塞 MVP。

---

## 4. Phase B：方向衝突偵測與整合

### 4.1 目標

在不改後端的前提下，讓使用者明確知道：

- AI 策略方向
- 再平衡方向
- 是否衝突
- 衝突時的判斷框架

此功能只提示，不阻止操作。

### 4.2 新增 utility

檔案：`Front-End/frontend/src/utils/tradingStrategy.ts`

```ts
import type { RebalanceSuggestion, TradingStrategyDTO, TradeType } from '../types';

export type TradeDirection = 'buy' | 'sell' | 'hold';

export interface DirectionConflictAnalysis {
  hasConflict: boolean;
  strategyDirection: TradeDirection;
  rebalanceDirection: TradeDirection;
  severity: 'none' | 'info' | 'warning';
  title: string;
  description: string;
  suggestion: string;
}

export function resolveStrategyDirection(tradeType: TradeType): TradeDirection {
  if (tradeType === 'entry' || tradeType === 'add') return 'buy';
  if (
    tradeType === 'reduce' ||
    tradeType === 'exit' ||
    tradeType === 'take_profit' ||
    tradeType === 'stop_loss'
  ) {
    return 'sell';
  }
  return 'hold';
}

export function resolveRebalanceDirection(action: RebalanceSuggestion['action']): TradeDirection {
  if (action === 'buy') return 'buy';
  if (action === 'sell') return 'sell';
  return 'hold';
}

export function analyzeDirectionConflict(
  strategy: TradingStrategyDTO,
  suggestion?: RebalanceSuggestion,
): DirectionConflictAnalysis {
  const strategyDirection = resolveStrategyDirection(strategy.tradeType);
  const rebalanceDirection = suggestion
    ? resolveRebalanceDirection(suggestion.action)
    : 'hold';

  const hasConflict =
    strategyDirection !== 'hold' &&
    rebalanceDirection !== 'hold' &&
    strategyDirection !== rebalanceDirection;

  if (!suggestion || suggestion.action === 'hold') {
    return {
      hasConflict: false,
      strategyDirection,
      rebalanceDirection,
      severity: 'none',
      title: '',
      description: '',
      suggestion: '',
    };
  }

  if (!hasConflict) {
    return {
      hasConflict: false,
      strategyDirection,
      rebalanceDirection,
      severity: 'info',
      title: '方向一致',
      description: 'AI 交易策略與再平衡建議方向一致。',
      suggestion: '可同時參考短期訊號與長期配置目標，仍需確認成交成本與流動性。',
    };
  }

  return {
    hasConflict: true,
    strategyDirection,
    rebalanceDirection,
    severity: 'warning',
    title: '方向衝突',
    description: `AI 交易策略偏向${strategyDirection === 'buy' ? '買入 / 加碼' : '賣出 / 減碼'}，但再平衡建議偏向${rebalanceDirection === 'buy' ? '買入 / 加碼' : '賣出 / 減碼'}。`,
    suggestion: '先檢查目前持股權重是否已超出目標區間；若未超限，短期 TAA 訊號可作為分批執行依據；若已明顯超限，應優先降低集中度風險。',
  };
}
```

### 4.3 TradingStrategyModal UI

檔案：`Front-End/frontend/src/views/pages/stock/TradingStrategyModal.tsx`

新增：

- Header badge：衝突時顯示 `方向衝突`
- 再平衡建議下方顯示分析區塊
- 分析區塊放在 `tsm-rebalance` 後、`tsm-summary` 前

UI 文案：

```text
方向衝突
AI 交易策略偏向買入 / 加碼，但再平衡建議偏向賣出 / 減碼。
先檢查目前持股權重是否已超出目標區間；若未超限，短期 TAA 訊號可作為分批執行依據；若已明顯超限，應優先降低集中度風險。
```

CSS：

```css
.tsm-conflict {
  border: 1px solid var(--up-bd);
  background: var(--up-bg);
  border-radius: 6px;
  padding: 12px 14px;
  margin-bottom: 12px;
  font-size: var(--text-sm);
  line-height: 1.6;
}

.tsm-conflict__title {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--up);
  font-weight: 600;
  margin-bottom: 4px;
}

.tsm-conflict__desc {
  color: var(--text);
}

.tsm-conflict__hint {
  color: var(--muted);
  margin-top: 6px;
}
```

### 4.4 HoldingsTable badge

檔案：`Front-End/frontend/src/views/pages/stock/HoldingsTable.tsx`

`StrategyBadge` 建議新增 `suggestion?: RebalanceSuggestion` prop，內部呼叫 `analyzeDirectionConflict()`。

顯示規則：

- 不改變原本 badge variant。
- 若衝突，在 badge 右側顯示 warning icon。
- aria-label 加上「方向衝突」。

---

## 5. Phase A：批次執行追蹤

### 5.1 目標

讓使用者能將每一批 tranche 標記為已實際執行。每個批次支援多筆執行紀錄（`executions[]`），AI 可讀取每批次實際交易了幾筆、各是多少，作為下次策略建議的依據。

**設計原則：**

- 交易紀錄（`/transactions`）是財務事實的唯一來源（source of truth）。
- 批次執行狀態是暫態的：AI 重新寫入策略時，tranches 會被覆寫，但交易紀錄不受影響。
- 批次只儲存執行摘要快照 + `transactionId` 參照，不複製完整交易資料。
- 一個批次可連結多筆交易（例如分次買進）。
- 使用者只填一次資料（在交易紀錄表單），選擇性連結批次，不需重複輸入。

### 5.2 型別異動

檔案：`Front-End/frontend/src/types/index.ts`

```ts
export type StrategyStatus =
  | 'active'
  | 'triggered'
  | 'completed'
  | 'expired'
  | 'dismissed';

export type TrancheStatus =
  | 'pending'
  | 'triggered'
  | 'skipped'
  | 'waiting'
  | 'executed';

/** 批次內單筆執行紀錄，對應一筆交易紀錄的摘要快照 */
export interface TrancheExecution {
  transactionId:  string;   // 指向 /transactions 的 ID（可為空字串，表示手動標記）
  executedAt:     string;   // 成交時間 ISO string
  executedShares: number;   // 成交股數
  executedPrice:  number;   // 成交均價
}

export interface StrategyTranche {
  batch:            number;
  priceLow:         number;
  priceHigh:        number;
  sizeRatio:        number;
  shares:           number;   // AI 建議股數（參考值，非強制）
  triggerCondition: string;
  triggerRules?:    TriggerRule[];
  ruleStatuses?:    Record<string, boolean | null>;
  status:           TrancheStatus;  // executed = executions.length > 0
  executions:       TrancheExecution[];  // 預設空陣列，支援多筆
}
```

**計算欄位（前端 runtime，不存 Firestore）：**

```ts
const totalShares = tranche.executions.reduce((s, e) => s + e.executedShares, 0);
const avgPrice    = totalShares > 0
  ? tranche.executions.reduce((s, e) => s + e.executedPrice * e.executedShares, 0) / totalShares
  : 0;
const pctDone     = tranche.shares > 0 ? (totalShares / tranche.shares) * 100 : 0;
```

### 5.3 後端 DTO mapping

檔案：`Back-End/python-backend/routers/trading_strategies.py`

`_tranche_to_dto()` 新增 `executions` 陣列：

```py
"executions": [
    {
        "transactionId":  e.get("transaction_id", ""),
        "executedAt":     e.get("executed_at"),
        "executedShares": e.get("executed_shares"),
        "executedPrice":  e.get("executed_price"),
    }
    for e in t.get("executions", [])
],
```

舊資料沒有 `executions` 欄位時，`t.get("executions", [])` 回傳空陣列，前端收到 `executions: []`，不需額外相容處理。

### 5.4 新增 API

Endpoint：

```http
POST /api/v1/trading-strategies/{stockCode}/tranches/{batch}/executions
```

Request：

```json
{
  "executedPrice":  182.5,
  "executedShares": 1000,
  "transactionId":  "txn_abc123",
  "executedAt":     "2026-06-13T10:23:00+08:00"
}
```

- `transactionId`：選配，來自交易紀錄 ID；手動標記時可省略（後端存空字串）。
- `executedAt`：選配，前端傳交易紀錄的成交時間；省略時後端以 `datetime.now(TZ_TAIPEI)` 填入。

Response：

```json
{
  "success": true,
  "data": { "...": "TradingStrategyDTO" }
}
```

後端行為：

1. 驗證 strategy 是否存在，不存在回 404。
2. 驗證 batch 是否存在，不存在回 400。
3. 驗證 `executedPrice > 0`。
4. 驗證 `executedShares > 0`。
5. 將新執行紀錄 **append** 至指定 tranche 的 `executions` 陣列：
   ```py
   execution = {
       "transaction_id":  body.transaction_id or "",
       "executed_at":     body.executed_at or datetime.now(TZ_TAIPEI).isoformat(),
       "executed_price":  body.executed_price,
       "executed_shares": body.executed_shares,
   }
   tranche["executions"].append(execution)
   tranche["status"] = "executed"
   ```
6. 重新計算 strategy status：
   - dismissed 優先
   - expired 其次
   - 若所有 tranche 都是 `executed` 或 `skipped`，設為 `completed`
   - 若任一 tranche 是 `triggered`，設為 `triggered`
   - 否則維持 `active`
7. 回傳完整 DTO。

### 5.5 後端測試

檔案：`Back-End/python-backend/tests/test_m10_trading_strategies.py`

新增案例：

- `test_add_execution_success`
  - 建立策略，POST execution 至 batch 1
  - 驗證 tranche.executions 長度為 1、executedAt、executedPrice、executedShares、status = executed
- `test_add_execution_appends_to_list`
  - 連續 POST 兩次 execution 至同一 batch
  - 驗證 executions 長度為 2（多筆累積）
- `test_add_execution_with_transaction_id`
  - 傳入 transactionId，驗證存入 transaction_id 欄位
- `test_add_execution_without_transaction_id`
  - 省略 transactionId，驗證 transaction_id 為空字串
- `test_add_execution_custom_executed_at`
  - 傳入自訂 executedAt，驗證後端使用傳入值而非 now()
- `test_add_execution_nonexistent_strategy_404`
- `test_add_execution_wrong_batch_400`
- `test_add_execution_invalid_price_400`
- `test_add_execution_all_done_sets_completed`
  - 所有批次 executions.length > 0 或 status = skipped 後，strategy.status = completed

### 5.6 前端 model

檔案：`Front-End/frontend/src/models/tradingStrategyModel.ts`

```ts
export async function addTrancheExecution(
  stockCode: string,
  batch: number,
  executedPrice: number,
  executedShares: number,
  transactionId?: string,
  executedAt?: string,
): Promise<TradingStrategyDTO> {
  const res = await api.post<ApiResponse<TradingStrategyDTO>>(
    `/trading-strategies/${stockCode}/tranches/${batch}/executions`,
    {
      executedPrice,
      executedShares,
      ...(transactionId != null ? { transactionId } : {}),
      ...(executedAt    != null ? { executedAt }    : {}),
    },
  );
  return res.data.data;
}
```

### 5.7 前端 ViewModel

檔案：`Front-End/frontend/src/viewmodels/useTradingStrategyViewModel.ts`

新增：

```ts
const addExecution = useCallback(async (
  stockCode: string,
  batch: number,
  executedPrice: number,
  executedShares: number,
  transactionId?: string,
  executedAt?: string,
) => {
  const original = strategiesRef.current[stockCode];
  const now = executedAt ?? new Date().toISOString();

  // 樂觀更新：立即 append 至本地 executions
  setStrategies(prev => {
    const s = prev[stockCode];
    if (!s) return prev;
    const tranches = s.tranches.map(t => {
      if (t.batch !== batch) return t;
      return {
        ...t,
        status: 'executed' as const,
        executions: [
          ...t.executions,
          { transactionId: transactionId ?? '', executedAt: now, executedPrice, executedShares },
        ],
      };
    });
    return { ...prev, [stockCode]: { ...s, tranches } };
  });

  try {
    const updated = await addTrancheExecutionApi(stockCode, batch, executedPrice, executedShares, transactionId, executedAt);
    setStrategies(prev => ({ ...prev, [stockCode]: updated }));
  } catch {
    if (original) {
      setStrategies(prev => ({ ...prev, [stockCode]: original }));
    }
  }
}, []);
```

回傳物件加入：

```ts
return {
  strategies,
  loading,
  load,
  dismiss,
  remove,
  getStatus,
  confirmManualRule,
  addExecution,
};
```

### 5.8 TradingStrategyModal UI

`TrancheRow` 新增 props：

```ts
onAddExecution?: (
  batch:          number,
  executedPrice:  number,
  executedShares: number,
) => void;
```

顯示規則：

| status | 顯示 | 操作 |
|---|---|---|
| `pending` | 等待中 | 不顯示執行按鈕 |
| `waiting` | 等待中 | 不顯示 |
| `triggered` | 已觸及 | 顯示「手動標記執行」 |
| `skipped` | 已略過 | 不顯示 |
| `executed` | 已執行 | 顯示 executions 列表 + 累計摘要 |

手動標記表單（inline 展開，適用於不經由交易紀錄連結的情況）：

- 預填：
  - `executedPrice = currentPrice > 0 ? currentPrice : tranche.priceHigh`
  - `executedShares = tranche.shares`
- 驗證：成交均價 > 0，實際股數 > 0
- 送出後呼叫 `onAddExecution`（transactionId 省略，後端存空字串）

已執行後顯示（支援多筆）：

```text
第 1 批  [買進]  $185 – $190  2000 股            [已執行]

  2026/06/10  1,000 股 @ 188.00  → #txn_001
  2026/06/12    800 股 @ 186.50  → #txn_004

  累計 1,800 股 ・ 均價 187.39 ・ 目標達成 90%
```

`→ #txn_xxx` 點擊可跳轉至交易紀錄頁（可選實作，Phase D 完成後補）。

### 5.9 HoldingsTable StrategyBadge

完成判斷：

```ts
const isCompleted =
  strategy.tranches.length > 0 &&
  strategy.tranches.every(t => t.executions.length > 0 || t.status === 'skipped');
```

顯示：

- 若 `strategy.status === 'completed'` 或 `isCompleted`：`AI 已完成`
- variant 建議用 `flat` 或 `down`，避免與「觸發停損」的 `up` 混淆。

---

## 6. Phase C：風險環境覆寫警示

### 6.1 前置修正

現有型別：

```ts
export type MarketState = 'neutral' | 'risk-on' | 'risk-off' | 'liquidity-dry';
```

因此文件與實作應使用：

```ts
marketStateAuto === 'risk-off'
```

不可使用 `risk_off`。

### 6.2 觸發條件

```ts
const shouldWarnMacro =
  marketStateAuto === 'risk-off' &&
  resolveStrategyDirection(strategy.tradeType) === 'buy' &&
  strategy.status !== 'completed' &&
  strategy.status !== 'dismissed' &&
  strategy.status !== 'expired';
```

### 6.3 UI 建議

位置：

- `TradingStrategyModal` header 下方、價格軸上方。

文案：

```text
當前市場狀態為 Risk-Off
買入型策略在高波動環境下建議縮小批次、延後執行，或等待 VIX / 市場狀態回到中性。
```

此階段低優先，建議等 Phase A/B 穩定後再做。

---

## 7. Phase D：交易紀錄串接

### 7.1 設計原則

| 角色 | 說明 |
|---|---|
| 交易紀錄（`/transactions`） | 財務事實的唯一來源，永久保存 |
| 批次執行（`tranche.executions[]`） | 暫態摘要快照，AI 覆寫策略時隨 tranches 重置 |

使用者只需在**交易紀錄表單**填入一次資料，選擇性連結批次，系統將執行摘要同步寫入 `executions[]`。批次不持有完整交易資料，僅保存 `transactionId` 引用與顯示所需的快照欄位。

### 7.2 使用者流程（Transaction-first）

```
使用者在交易紀錄表單填入一筆交易
（股票代號、買/賣、股數、均價、日期）
           ↓
表單底部出現選配區：「連結至 AI 策略批次」
系統偵測：此股票是否有 triggered / pending 批次？
           ↓ 有，顯示批次選擇器（見 7.3）
使用者選擇連結的批次（或選「不連結」）
           ↓ 送出
① 建立交易紀錄（主資料，永久保存）
② 若已選批次，呼叫 POST /tranches/{batch}/executions
   帶入 transactionId、executedPrice、executedShares、executedAt
```

### 7.3 批次選擇 UI

**設計原則**：視覺復用 `TradingStrategyModal` 中既有的 `.tsm-tranche` 元件，保持一致的資訊呈現方式，降低認知負擔。

```
連結至 AI 策略批次

┌─────────────────────────────────────────────────────────┐
│ ◉  第 1 批  [買進]  $185 – $190  2000 股   [已觸及]   │  ← 系統預選
└─────────────────────────────────────────────────────────┘
   已選：藍色左邊框 + 淡藍背景（復用 .tsm-tranche--open）

┌─────────────────────────────────────────────────────────┐
│ ○  第 2 批  [買進]  $175 – $180  1000 股   [等待中]   │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ ○  不連結至任何批次                                      │
└─────────────────────────────────────────────────────────┘
```

**系統預選邏輯**：優先 `triggered` 批次；無 triggered 時取最小 batch 號的 `pending` 批次。  
**使用者可改選**：即使當前價格已跌至第 2 批區間，使用者仍可手動選擇連結第 1 批或第 2 批，由使用者自行判斷歸屬。  
**不做累計計算**：批次沒有「已執行 N/M 股」的強制進度追蹤；使用者多次連結同一批次，executions 累計增加，目標達成率為 runtime 計算的參考值，非強制合約。

**CSS 實作（最少新增）**：

```css
/* 批次選擇 radio icon，其餘樣式直接復用 .tsm-tranche / .tsm-tranche--open */
.tx-tranche-radio {
  color: var(--dim);
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.tsm-tranche--open .tx-tranche-radio {
  color: var(--accent);
}
```

### 7.4 策略被 AI 覆寫時的行為

| 資料 | 結果 |
|---|---|
| 交易紀錄（`/transactions`） | 完整保留，不受策略影響 |
| `tranche.executions[]` | 隨新策略的 tranches 被清空 |
| `transactionId` 引用的連結 | 隨批次消失，但交易紀錄本身不受影響 |

MVP 可接受覆寫後連結斷開。UI 應將 `strategy.createdAt` 顯示清楚，讓使用者知道當前是新策略。後續可補規則：若新舊策略 tradeType / price bands 高度相似，嘗試保留同 batch 的 executions。

### 7.5 Phase D 不做的事（MVP 範圍外）

- 自動建立交易紀錄（需 holdings recalculation + Firestore batch write + rollback）。
- 從交易紀錄頁點擊「查看連結的批次」（需雙向引用）。
- 批次跳過操作（`PATCH /tranches/{batch}/skip`，另一個 endpoint）。

---

## 8. 實作任務拆分

### ✅ FE-TSD-01：方向衝突 utility（已完成）

- 新增 `resolveStrategyDirection`
- 新增 `resolveRebalanceDirection`
- 新增 `analyzeDirectionConflict`
- TypeScript build 驗收通過。

### ✅ FE-TSD-02：TradingStrategyModal 衝突提示（已完成）

- Header 新增衝突 badge（`hasConflict` 時顯示）。
- 再平衡建議與衝突分析合併為 `.tsm-insight` block，移至 AI 建議下方。
- AI 建議與 insight block 中間加分隔線 `.tsm-section-divider`。
- CSS 新增 `.tsm-insight*`、`.tsm-conflict__*`、`.tsm-section-divider`。

### ✅ FE-TSD-03：HoldingsTable 衝突提示（已完成，調整設計）

- 評估後決定不在表格欄位顯示 warning icon，維持原本簡潔的 badge。
- 衝突資訊集中在 TradingStrategyModal 內呈現。

### BE-TSD-01：execute tranche endpoint

- 新增 request validation。
- 更新 tranche raw dict。
- 更新 strategy status。
- 回傳完整 DTO。
- 補 pytest。

### FE-TSD-04：addExecution model / viewmodel

- model 新增 `addTrancheExecution()`（POST `/executions`）。
- viewmodel 新增 `addExecution()`，樂觀 append 至 `executions[]`，API 失敗 rollback。
- 回傳 `addExecution` 給 page。

### FE-TSD-05：TradingStrategyModal 執行確認 UI

- `TrancheRow` 新增 inline 手動標記表單（`triggered` 狀態時顯示）。
- `executed` 狀態顯示 `executions[]` 列表 + 累計摘要（totalShares、avgPrice、pctDone）。
- CSS 新增 `.tsm-tranche__exec-*`。

### FE-TSD-06：StrategyBadge 完成狀態

- 完成判斷改為 `executions.length > 0 || status === 'skipped'`。
- 顯示 `AI 已完成`，variant = `flat`。
- `StrategyStatus` 補 `completed`。

### FE-TSD-07：交易紀錄表單批次選擇 UI

- 在交易紀錄 Modal 底部新增「連結至 AI 策略批次」選配區。
- 偵測同股票是否有 `triggered` / `pending` 批次（從 `useTradingStrategyViewModel` 讀取）。
- 批次列表使用 `.tsm-tranche` 視覺設計，選中態復用 `.tsm-tranche--open`。
- Radio icon 新增 `.tx-tranche-radio` class。
- 系統預選第一個 `triggered` 批次；使用者可改選任一批次或「不連結」。
- 送出時若已選批次，呼叫 `addExecution()`，帶入 `transactionId`、`executedAt`。

---

## 9. 驗收標準

### Phase B 驗收

- AI 加碼 + 再平衡減碼時，Modal header 顯示方向衝突。
- AI 減碼 / 出場 + 再平衡買入時，Modal header 顯示方向衝突。
- 同方向或 hold 不顯示衝突。
- HoldingsTable badge 右側出現 warning icon。
- `npm run build` 通過。

### Phase A 驗收

- triggered tranche 可點擊「手動標記執行」。
- inline 表單可輸入成交均價與股數。
- 送出後立即在 executions 列表顯示新筆。
- 同一批次可多次新增 execution，列表累計顯示。
- API 成功後以後端回傳的 DTO 校正 server timestamp。
- API 失敗時 rollback 至送出前狀態。
- 重新整理頁面後 executions 仍存在。
- 全部批次 executions.length > 0 或 skipped 後，策略顯示 `AI 已完成`。
- 後端 pytest 通過。
- 前端 `npm run build` 通過。

### Phase D 驗收

- 建立交易紀錄時，若同股票有 triggered/pending 批次，顯示批次選擇器。
- 批次選擇器樣式與 TradingStrategyModal 中的批次列一致（`.tsm-tranche`）。
- 系統預選第一個 triggered 批次；使用者可改選其他批次或不連結。
- 送出後：交易紀錄建立成功，且選擇的批次 executions 新增一筆。
- 策略 Modal 中對應批次的 executions 列表即時更新。
- 未選批次時，交易紀錄正常建立，策略狀態不變。
- 前端 `npm run build` 通過。

### Phase C 驗收

- `marketStateAuto === 'risk-off'` 且策略方向為買入時顯示警示。
- 賣出 / 觀察 / 已完成 / 已忽略 / 已過期策略不顯示。
- 不影響使用者確認執行。

---

## 10. 風險與注意事項

### 10.1 策略覆寫的資料安全性

MCP `save_trading_strategy` 目前是 AI 覆寫 singleton strategy。若 AI 重新寫入同一檔股票，tranches 連同 `executions[]` 都會被新策略取代。

**但財務資料不受影響**：因為 v1.2 設計下，完整交易明細保存在 `/transactions`，批次只存快照與 `transactionId` 引用。策略被覆寫後，交易紀錄本身完整存在，只是與批次的連結斷開。

MVP 接受此行為。UI 應把 `strategy.createdAt` 顯示清楚，讓使用者知道這是新策略。後續可補規則：若新舊策略 tradeType / price bands 高度相似，嘗試保留同 batch 的 executions（依序號比對）。

### 10.2 completed 狀態需前後端一致

若後端新增 `completed`，前端 `StrategyStatus`、`resolveStrategyStatus`、Modal badge、Holdings badge 都要同步更新。

### 10.3 skipped 的來源尚未完整

目前前端 / 後端尚未提供「略過批次」操作。若 `skipped` 只由 AI 寫入，Phase A 可以先只處理 `executed`；若要讓使用者略過，需新增另一個 endpoint：

```http
PATCH /api/v1/trading-strategies/{stockCode}/tranches/{batch}/skip
```

此 endpoint 不列入 MVP。

### 10.4 交易策略不是交易指令

UI 文案應避免「立即買入」「必須賣出」等命令式語氣。建議使用：

- 建議
- 偏向
- 可考慮
- 需確認

### 10.5 金融風險聲明

此系統是個人投資輔助工具。AI 策略、再平衡與風險模型都應視為決策參考，不應替代使用者判斷。

---

## 11. 建議落地順序

1. 實作 Phase B（FE-TSD-01/02/03）：方向衝突偵測，最快產生價值，純前端。
2. 實作 BE-TSD-01：`POST /tranches/{batch}/executions` endpoint 與 pytest。
3. 實作 FE-TSD-04 / FE-TSD-05：`addExecution` model/viewmodel + Modal 手動標記 UI。
4. 實作 FE-TSD-06：StrategyBadge 完成狀態。
5. 實作 FE-TSD-07：交易紀錄表單批次選擇 UI（Phase D 主體）。
6. 視使用回饋決定 Phase C（風險環境警示）。

---

## 12. 更新摘要

相較 v1.0，v1.1 主要修正：

- 補上前後端目前實作狀態，避免把已完成與未完成項目混在一起。
- 調整優先順序：Phase B 先於 Phase A，因為純前端且能快速落地。
- 補上 `completed` 策略生命週期。
- 修正 `risk_off` 命名為現有型別使用的 `risk-off`。
- 補上後端 DTO mapping、API validation、pytest 驗收。
- 補上 MCP 覆寫可能清掉 executed 狀態的風險。
- 將「確認執行」與「建立交易紀錄」拆開，避免 MVP 過度耦合。

相較 v1.1，**v1.2** 主要修正：

- **批次執行模型重構**：`StrategyTranche` 的單一 `executedAt/Price/Shares` 欄位改為 `executions: TrancheExecution[]`，支援一個批次多筆執行紀錄。
- **新增 `TrancheExecution` 型別**：`{ transactionId, executedAt, executedShares, executedPrice }`。
- **API 從 PATCH 改為 POST**：`POST /tranches/{batch}/executions`，每次呼叫 append 而非覆蓋。
- **交易紀錄設計為 source of truth**：批次只存摘要快照 + transactionId 引用，不複製完整財務資料，策略覆寫時財務資料不受損。
- **Phase D 完整重寫**：Transaction-first 流程、批次選擇 UI 復用 `.tsm-tranche` 視覺設計、系統預選 + 使用者可改選任一批次。
- **不做累計強制追蹤**：AI 建議股數為參考值，目標達成率為 runtime 計算，不影響批次 executed 狀態判斷。
- **新增 FE-TSD-07**：交易紀錄表單批次選擇 UI 任務。
- **新增 Phase D 驗收標準**。
- **更新 10.1**：說明 executions 設計下策略覆寫的安全性。
