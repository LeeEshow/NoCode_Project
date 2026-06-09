# 個人理財雲端系統 — 前端開發任務清單

> 參考文件：Front-End\CLAUDE.md

**指派後端開發**：遇到以下情況，請把後端開發需求寫入 D:\Project\NoCode_Project\Back-End\Task_Backend.md 任務清單的最後段
> 1. 前端設計變更，影響後端API資料結構
> 2. 新增功能需後端開發新API
> 3. 前端發現API資訊異常，需要後端排錯時

---

## 待辦

目前無待辦項目。

---

### ✅ F-01 交易策略 DTO 改版 + UI 全面重設計（已完成 2026-06-09）

> 關聯後端任務：`Task_Backend.md M13`

**完成項目**
- `types/index.ts`：新增 `TriggerRule`、`TrancheStatus`、`StrategyTranche`，更新 `TradingStrategyDTO`
- `utils/tradeCost.ts`：費率常數抽出，`useRebalanceViewModel` 改 import
- `utils/tradingStrategy.ts`：新增 `resolveStrategyStatus()`、`ruleKey()`、`mergeRealTimePriceStatuses()`
- `TradingStrategyModal`：全面重設計（price axis 進度條、批次規則展開、現價下方標籤）
- `HoldingsTable` / `WatchlistTable`：策略欄改為批次進度 + StatusBadge
- `useTradingStrategyViewModel`：`dismiss()` 樂觀更新同步 `dismissed: true` + `status: 'dismissed'`

---

## UI 設計要點（全 Phase 適用）

### 色彩規範
- 買入建議（Phase 3）：`--accent #6A8FB5`
- 賣出建議（Phase 3）：`--up #B87A7A`
- WeightRatio 超標：`--up #B87A7A`
- WeightRatio 不足：`--accent #6A8FB5`
- WeightRatio 正常：`--down #7CA88D`

### 計算單位
- 全系統統一使用「**股**」
- 再平衡建議格式：`賣 200 股  約 NT$8,000` / `買 500 股  約 NT$3,000`

### Accessibility 必要項
- 所有 icon-only 按鈕必須有 `aria-label`
- 收折/展開面板：`aria-expanded`、`aria-controls`
- 表單欄位：`<label htmlFor>` 對應
- 驗證訊息：`aria-live="polite"` 包覆
- Tab 元件：`role="tablist"` / `role="tab"` / `role="tabpanel"` / `aria-selected`
- 數值欄：`font-variant-numeric: tabular-nums`
- 動畫：`@media (prefers-reduced-motion: reduce)` fallback
- Native select：明確設定 `background-color` 與 `color`
