# 交易策略系統強化規劃

> **文件版本**：v1.0  
> **日期**：2026-06-12  
> **背景**：由全球宏觀策略師、台股投資顧問、獨立風險長三位專家共同討論後整合

---

## 問題陳述

目前交易策略系統存在兩個核心缺口：

### 問題一：批次執行缺乏追蹤
AI 策略可能建議分批次進場（例如：第 1 批 40% 在 185 元、第 2 批 60% 在 178 元）。  
**現況**：使用者執行完第 1 批後，介面沒有任何方式標記「已執行」，下次開啟 Modal 時無法區分哪批已完成、哪批待執行。  
**影響**：使用者依賴記憶或外部筆記，容易重複下單或遺漏批次。

### 問題二：交易策略 vs. 再平衡建議方向衝突
AI 策略屬於**戰術層（TAA）**：短期價格動能、技術型態與籌碼面驅動。  
再平衡建議屬於**戰略層（SAA）**：長期目標權重偏差驅動。  
**現況**：兩套系統並排顯示，偶爾方向相反（例如：AI 建議加碼，再平衡建議減碼至目標權重），使用者面對衝突時缺乏決策輔助。

---

## 設計框架：三階段漸進式強化

```
Phase A  ── 批次執行追蹤           ← 優先，最小可行（MVP）
Phase B  ── 方向衝突偵測與整合     ← 次優先，純前端計算
Phase C  ── 總體環境覆寫警示       ← 選擇性，低優先
```

---

## Phase A：批次執行追蹤

### 目標
讓使用者可以手動確認每一個批次已執行，系統記錄執行時間、成交價、股數，Modal 呈現清楚的完成/待執行狀態。

### A-1. 型別異動（`types/index.ts`）

```ts
// 新增 'executed' 狀態
export type TrancheStatus = 'pending' | 'triggered' | 'skipped' | 'waiting' | 'executed';

// StrategyTranche 新增三個可選欄位
export interface StrategyTranche {
  batch:            number;
  priceLow:         number;
  priceHigh:        number;
  sizeRatio:        number;
  shares:           number;
  triggerCondition: string;
  triggerRules?:    TriggerRule[];
  ruleStatuses?:    Record<string, boolean | null>;
  status:           TrancheStatus;
  // ── Phase A 新增 ──
  executedAt?:      string;   // ISO 8601 timestamp，執行確認時間
  executedPrice?:   number;   // 確認時輸入的成交均價
  executedShares?:  number;   // 實際執行股數（可與建議股數不同）
}
```

### A-2. 後端 API 新增（記錄於 `Task_Backend.md`）

```
PATCH /api/v1/trading-strategies/:stockCode/tranches/:batch/execute

Request Body：
{
  "executedPrice": 182.5,   // 必填：成交均價
  "executedShares": 1000    // 選填：實際股數，省略則沿用 DTO 的 shares
}

Response：
{
  "success": true,
  "data": { ...TradingStrategyDTO }  // 回傳完整更新後的策略
}
```

後端行為：
- 將指定 batch 的 `status` 改為 `'executed'`
- 寫入 `executedAt`（server timestamp）、`executedPrice`、`executedShares`
- 回傳完整 DTO 供前端替換快取

### A-3. ViewModel 異動（`useTradingStrategyViewModel.ts`）

新增方法：
```ts
executeTranche: (stockCode: string, batch: number, executedPrice: number, executedShares?: number) => Promise<void>
```

實作要點：
- **樂觀更新**：立即將該 batch status 改為 `'executed'`，寫入假 executedAt（`new Date().toISOString()`）
- **API 呼叫成功**：以回傳 DTO 取代本機樂觀值（確保 executedAt 是 server 時間）
- **API 呼叫失敗**：rollback 至原始狀態（使用 `strategiesRef.current` 模式，避免 stale closure）
- 使用 `useLatest(strategies)` 已有的 `strategiesRef`，不需額外的 ref

### A-4. TradingStrategyModal UI 設計

**批次狀態視覺**：

| TrancheStatus | 左邊框色 | 標籤 | 操作 |
|:---|:---|:---|:---|
| `pending` | `--muted` | — | 顯示「確認執行」按鈕（若 triggered） |
| `triggered` | `--accent` | `[觸發]` badge | 顯示「確認執行」按鈕（primary） |
| `skipped` | `--muted`（opacity 0.5） | `[略過]` badge | — |
| `waiting` | `--muted` | `[等待中]` badge | — |
| `executed` | `--down` | `[已執行]` badge（down variant） | 顯示執行明細 |

**「確認執行」互動流程**：

```
使用者點擊「確認執行」
  → 展開 inline 小表單（不開新 Modal）
  → 欄位：
      成交均價  [NumberInput, 預填當前報價]
      實際股數  [NumberInput, 預填 DTO shares，可調整]
  → 按「送出」→ 樂觀更新 + 呼叫 API
  → 按「取消」→ 收起表單
```

**執行後顯示**（status = 'executed'）：
```
第 1 批  185.0–190.0（40%）  [已執行]
  執行於 2026-06-10 10:23 ・成交 182.5 元 ・1,000 股 ・NT$182,500
```

**CSS class 新增（`TradingStrategyModal.css`）**：

```css
.tsm-tranche--executed   { border-left-color: var(--down); }

.tsm-tranche__exec-form  { ... }   /* inline 確認表單 */
.tsm-tranche__exec-info  { ... }   /* 執行後明細列 */
.tsm-tranche__exec-label { ... }   /* "執行於 ..." 文字 */
```

### A-5. Model 層新增（`tradingStrategyModel.ts`）

```ts
export async function executeTranche(
  stockCode: string,
  batch: number,
  executedPrice: number,
  executedShares?: number,
): Promise<TradingStrategyDTO> {
  const { data } = await api.patch<ApiResponse<TradingStrategyDTO>>(
    `/trading-strategies/${stockCode}/tranches/${batch}/execute`,
    { executedPrice, ...(executedShares != null && { executedShares }) },
  );
  return data.data;
}
```

### A-6. HoldingsTable badge 異動

`StrategyBadge` 追加已執行批次計數：
- 若所有批次皆已執行且策略未過期 → 顯示 `AI 已完成`（variant: `down`）
- 計算邏輯：`tranches.every(t => t.status === 'executed' || t.status === 'skipped')`

---

## Phase B：交易策略 vs. 再平衡方向衝突整合

### 目標
在 TradingStrategyModal 內整合再平衡建議，自動偵測方向衝突並提示使用者，協助決策優先順序。不阻止使用者任何操作，僅提供資訊。

### B-1. 衝突偵測邏輯（純前端，無 API）

**方向映射**：

```ts
// 新增至 utils/tradingStrategy.ts

type Direction = 'buy' | 'sell' | 'hold';

export function resolveStrategyDirection(tradeType: TradeType): Direction {
  if (['entry', 'add'].includes(tradeType))              return 'buy';
  if (['reduce', 'exit', 'take_profit', 'stop_loss'].includes(tradeType)) return 'sell';
  return 'hold';
}

export function resolveRebalanceDirection(action: RebalanceSuggestion['action']): Direction {
  if (action === 'buy')  return 'buy';
  if (action === 'sell') return 'sell';
  return 'hold';
}

export interface ConflictAnalysis {
  hasConflict:      boolean;
  strategyDir:      Direction;
  rebalanceDir:     Direction;
  netSuggestion:    'follow_strategy' | 'follow_rebalance' | 'neutral' | 'no_conflict';
  explanation:      string;
}

export function analyzeDirectionConflict(
  strategy: TradingStrategyDTO,
  suggestion: RebalanceSuggestion | undefined,
): ConflictAnalysis {
  const strategyDir  = resolveStrategyDirection(strategy.tradeType);
  const rebalanceDir = suggestion ? resolveRebalanceDirection(suggestion.action) : 'hold';
  const hasConflict  = suggestion != null
    && strategyDir !== 'hold'
    && rebalanceDir !== 'hold'
    && strategyDir !== rebalanceDir;

  if (!hasConflict) {
    return { hasConflict: false, strategyDir, rebalanceDir, netSuggestion: 'no_conflict', explanation: '' };
  }

  // 衝突時：策略優先（TAA 短期）vs 再平衡（SAA 長期）由使用者自行判斷
  return {
    hasConflict: true,
    strategyDir,
    rebalanceDir,
    netSuggestion: 'neutral',
    explanation:
      `AI 策略（${strategy.tradeType}）建議${strategyDir === 'buy' ? '買入' : '賣出'}，` +
      `但再平衡建議${rebalanceDir === 'buy' ? '加碼' : '減碼'}方向${rebalanceDir === strategyDir ? '相同' : '相反'}。` +
      `建議優先考量持股比例是否已超出目標，若尚在合理範圍內，短期 TAA 可優先。`,
  };
}
```

### B-2. TradingStrategyModal 異動

**props 異動**：`suggestion?: RebalanceSuggestion`（已存在，保留）

**Modal Header 新增衝突標示**：

```tsx
// tsm-header__badges 區域
const conflict = analyzeDirectionConflict(strategy, suggestion);

{conflict.hasConflict && (
  <StatusBadge variant="up">
    <Icon name="warning" size={14} aria-hidden="true" />
    方向衝突
  </StatusBadge>
)}
```

**Modal 底部新增衝突說明區塊**（衝突時才顯示，位於 tsm-summary 之前）：

```
┌── 方向衝突說明 ──────────────────────────────────────┐
│  ⚠ AI 策略建議「加碼」；再平衡建議「減碼」           │
│                                                      │
│  AI 策略（TAA）：短期籌碼 / 技術面驅動               │
│  再平衡（SAA）：長期目標權重偏差驅動                  │
│                                                      │
│  建議：先確認持股比例是否已逾目標上限（見風險面板）；   │
│  若未逾限，可優先跟從短期 AI 策略。                   │
└───────────────────────────────────────────────────────┘
```

**CSS 新增**：
```css
.tsm-conflict {
  border: 1px solid var(--up-bd);
  background: var(--up-bg);
  border-radius: 6px;
  padding: 12px 14px;
  margin-bottom: 12px;
  font-size: 0.82rem;
  line-height: 1.6;
}
.tsm-conflict__title {
  font-weight: 600;
  color: var(--up);
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.tsm-conflict__row { color: var(--muted); }
.tsm-conflict__hint {
  margin-top: 8px;
  color: var(--text);
  font-style: italic;
}
```

### B-3. StockExpandPanel 的再平衡建議列（已實作）

`RebalanceSuggestionBar` 已在展開列顯示再平衡建議，Phase B 無需額外修改。

### B-4. HoldingsTable StrategyBadge 衝突指示

在 `StrategyBadge` 中，若策略 active 且存在方向衝突，在 badge 右側加一個小型 `warning` icon：

```tsx
{hasConflict && (
  <Icon name="warning" size={12} style={{ color: 'var(--up)', marginLeft: 3 }} />
)}
```

> 注意：衝突圖示為次要視覺，不改變 badge 本身的 variant，避免視覺雜訊過多。

---

## Phase C：總體環境覆寫警示（選擇性）

### 目標
當系統偵測到 Risk-Off 環境（VIX 偏高、`marketStateAuto === 'risk_off'`）時，對**買入方向**的 active tranches 顯示警示，提醒使用者審慎。不阻止操作。

### C-1. 觸發條件

```ts
// 來自 snapshotStore.marketStateAuto
type MarketState = 'risk_on' | 'neutral' | 'risk_off';

const shouldWarnMacro =
  marketStateAuto === 'risk_off' &&
  resolveStrategyDirection(strategy.tradeType) === 'buy';
```

### C-2. TradingStrategyModal 新增警示（條件顯示）

位置：價格軸（PriceAxis）上方，tsm-header 下方。

```
⚠ 當前市場狀態為 Risk-Off（VIX 偏高）
  買入策略在高波動環境下建議縮減批次規模或等待 VIX 回落。
```

CSS class：`.tsm-macro-warn`（`--up` 邊框色，淡色背景）

### C-3. HoldingsTable badge 警示

若 `shouldWarnMacro`，在 badge label 後方附加 `(宏觀)` 文字提示，或以 tooltip 說明。  
低優先，可在 B Phase 完成後評估是否實作。

---

## 資料流總覽

```
後端（Firestore）
  ↓ GET /trading-strategies/:stockCode
useTradingStrategyViewModel.strategies  ← Record<stockCode, DTO>
  ↓ 傳入
TradingStrategyModal
  ├── PriceAxis（stopLoss / targetRange / currentPrice）
  ├── TrancheList
  │     ├── TrancheRow（每批）
  │     │     ├── RuleStatus（chip_* 規則）
  │     │     ├── [確認執行] 按鈕（Phase A）← executeTranche()
  │     │     └── 執行明細（executedAt/Price/Shares）
  │     └── ...
  ├── RebalanceSuggestionBar（tsm-rebalance section）
  ├── ConflictAnalysis Block（Phase B）← analyzeDirectionConflict()
  ├── MacroWarnBlock（Phase C，選擇性）
  └── AI Summary

PATCH /trading-strategies/:stockCode/tranches/:batch/execute
  ↓ 回傳完整 DTO
useTradingStrategyViewModel.strategies[stockCode] 更新
```

---

## 各 Phase 實作範疇估算

| Phase | 前端工作 | 後端工作 | 複雜度 |
|:---|:---|:---|:---|
| **A：批次執行追蹤** | `types/index.ts`、`tradingStrategyModel.ts`、`useTradingStrategyViewModel.ts`、`TradingStrategyModal.tsx`、`TradingStrategyModal.css`、`HoldingsTable.tsx` | 新增 `PATCH /trading-strategies/:stockCode/tranches/:batch/execute`、Firestore 寫入邏輯 | 中（後端需新 endpoint） |
| **B：衝突整合** | `utils/tradingStrategy.ts`（新增函式）、`TradingStrategyModal.tsx`、`TradingStrategyModal.css`、`HoldingsTable.tsx` | 無 | 低（純前端） |
| **C：宏觀覆寫** | `TradingStrategyModal.tsx`、`TradingStrategyModal.css` | 無 | 低（讀 snapshotStore 現有資料） |

---

## 後端需求（記錄至 `Task_Backend.md`）

### B-TSD-01：新增批次執行確認 API

```
PATCH /api/v1/trading-strategies/:stockCode/tranches/:batch/execute

Auth：Bearer token（現有機制）

Params：
  :stockCode  string  股票代號
  :batch      number  批次編號（1-based）

Body：
  executedPrice   number  必填，成交均價
  executedShares  number  選填，實際股數

Response 200：
  { success: true, data: TradingStrategyDTO }

Response 404：
  { success: false, error: "Strategy not found" }

Response 400：
  { success: false, error: "Batch not found" }

後端行為：
  1. 取出 Firestore 中 stockCode 對應的 strategy document
  2. 找到 tranches[batch-1]，更新：
     - status: 'executed'
     - executedAt: server timestamp（ISO 8601）
     - executedPrice: body.executedPrice
     - executedShares: body.executedShares ?? tranche.shares
  3. 重新評估整體 strategy.status（如所有批次 executed/skipped → 'completed'，如有 backend 支援）
  4. 回傳完整更新後的 strategy document
```

---

## 實作順序建議

1. **Phase B 先行**（純前端，無後端依賴，可立即開始）
   - `analyzeDirectionConflict()` 加入 `utils/tradingStrategy.ts`
   - `TradingStrategyModal` 渲染衝突區塊
   - `HoldingsTable` StrategyBadge 加衝突 icon

2. **Phase A 後行**（需後端配合）
   - 前端型別、UI 先準備好（可用 loading/error 狀態 mock）
   - 後端 endpoint 完成後接通真實 API
   - 後端任務記錄於 `Task_Backend.md`

3. **Phase C 按需**
   - Phase A+B 穩定後，根據使用回饋決定是否實作

---

## 注意事項與設計原則

### MVVM 遵守
- 所有新邏輯（`analyzeDirectionConflict`、`resolveStrategyDirection`）放在 `utils/tradingStrategy.ts`（純函式）
- `executeTranche` 方法放在 `useTradingStrategyViewModel`（副作用 + 狀態管理）
- `TradingStrategyModal` 只負責渲染，不含計算邏輯

### 樂觀更新 + stale closure 防護
- 延續現有 `strategiesRef = useLatest(strategies)` 模式
- rollback 時使用 `strategiesRef.current[stockCode]` 而非 closure 中的 state

### TypeScript 嚴格性
- `executedAt?` / `executedPrice?` / `executedShares?` 三個欄位皆為可選，確保舊資料無需 migration
- `TrancheStatus` 聯合型別加入 `'executed'` 後，所有 switch/exhaustive 檢查需同步更新

### 停損觸發 vs 批次執行 的區分
- `status: 'triggered'`：系統計算出 tranche 的觸發條件已滿足（被動）
- `status: 'executed'`：使用者主動確認已執行（主動）
- 兩者可同時存在：triggered 但尚未執行 → 顯示「確認執行」按鈕；executed 後不再顯示按鈕

---

*文件由 Claude Code 依三位專家討論結果整理。實作時依 Phase 順序進行，後端需求以 B-TSD-01 編號追蹤。*
