# 個人理財雲端系統 — 管理層規劃文件

> 版本：3.1（2026-05-30）
> 開發任務：Front-End\Task_Frontend.md、Back-End\Task_Backend.md

---

## 已完成功能總覽

| 階段 | 內容 |
|------|------|
| Phase 1 | Tag 標籤功能（CRUD、Asset-Tag 內嵌、標籤設定 Tab） |
| Phase 2 | 風險模型監控層（Risk_total、Tag 偏差、市場狀態切換、相關性矩陣） |
| Phase 3 | 再平衡決策層（ADV 流動性過濾、快照、觸發按鈕） |
| Phase 4 | 進階優化（DynamicRisk 自動計算、ρ 自動計算、集中度定量警示、每月提醒） |
| Phase 5 移除 | AI 每日早報前後端全移除（Claude API、aiReportService、AiReportModal） |
| Phase 6 | 曝險/流動比模組（曝險比 Badge、VIX 自動市場狀態、RiskPanel 建議提示） |
| Phase A | 數學模型擴充：風險品質補強（MDD、VaR/CVaR、No-Trade Band、再平衡成本效益） |
| Phase B | 數學模型擴充：目標達成率追蹤（今年進度、30年所需報酬、PlanPage PanelHeader） |
| Backend 重建 | Python FastAPI 取代 Node.js Express（M1–M7 全通過，pytest 121/121） |
| UI 升級 | Radix UI Primitives、RiskPanel Tab 重構、收折列重組、Tooltip、View Transitions |
| 部署 | Azure Static Web Apps（前端）+ App Service B1（Python FastAPI）、Easy Auth、每日快照 CI/CD |

---

## 已確認設計決策（參考文件）

### 一、頁面結構

```
┌─────────────────── PanelHeader ───────────────────────────┐
│  日期 / 當天成長率 / 股票現值 / 整年報酬率                   │
│  流動現金 NT$X,XXX,XXX  |  曝 XX% ●                        │
└───────────────────────────────────────────────────────────┘
┌──────────── MarketIndicesRow ─────────────────────────────┐
│  指數小卡 ...                                               │
└───────────────────────────────────────────────────────────┘
┌──────────── 風險再平衡模組（可收折）───────────────────────┐
│ 收折：▼ Risk：1.65  [市場狀態]  ⚠ 2標籤偏差  [快照▾]       │
│       💡 系統建議：Risk-Off（VIX 32.5）（當 auto ≠ 手動時） │
│ 展開：Tab 1 標籤配置 / Tab 2 風險設定                       │
└───────────────────────────────────────────────────────────┘
┌────────────────── 庫存持股 ────────────────────────────────┐
│  持股表格  │  再平衡建議欄                                   │
│  展開列：K線｜籌碼｜基本面｜交易紀錄｜標籤設定               │
└───────────────────────────────────────────────────────────┘
┌────────────────── 關注清單 ────────────────────────────────┐
└───────────────────────────────────────────────────────────┘
```

### 二、計算架構

```
即時資料（5 秒輪詢）
    ↓
[監控層] Risk_total、Δ(tag) → 面板顯示、異常警示
    ↓ 手動觸發
[決策層] ADV → FinalTradeAmount → 買賣股數建議
    ↓ 人工確認
執行交易
```

- 所有計算在**前端**執行，後端只負責資料存取
- 計算單位：全系統統一使用「股」

### 三、API 設計

- Asset-Tag 資料內嵌於持股 JSON（`GET /holdings` 回傳 `tags[]`）
- Tag 維護：獨立 `GET/POST/PUT/DELETE /tags`
- Asset-Tag 操作：`/holdings/:stockCode/tags` 嵌套子資源
- 所有路由前綴 `/api/v1`；回應格式統一 `{ success: true, data: ... }` / `{ success: false, error: "..." }`

### 四、Accessibility 規範

| 項目 | 規範 |
|------|------|
| icon-only 按鈕 | `aria-label` |
| 收折/展開按鈕 | `aria-expanded`、`aria-controls` |
| 表單欄位 | `<label htmlFor>` |
| 驗證訊息 | `aria-live="polite"` |
| 數值欄 | `font-variant-numeric: tabular-nums` |
| 動畫 | `prefers-reduced-motion` fallback |

### 五、全專案圖表配色（莫蘭迪色系）

| Token | 名稱 | Hex |
|-------|------|-----|
| `--chart-1` | 煙粉 | `#C8ACA4` |
| `--chart-2` | 苔灰 | `#A8B4A6` |
| `--chart-3` | 霧藍 | `#A0ACBA` |
| `--chart-4` | 燕麥 | `#C4B8A8` |
| `--chart-5` | 薰紫灰 | `#B4AEBC` |
| `--chart-6` | 鴿藍 | `#96A8B4` |

---

## Phase 6 — 曝險/流動比模組（已完成）

### 功能概述

在 PanelHeader 新增**曝險比 Badge**，讓使用者在任意頁面即時掌握資金配置狀態；RiskPanel 收折列顯示 VIX 自動市場狀態建議。

### 核心計算（第一版）

```
曝險部位 = 台股市值（AssetsPage 外幣/債券 pending，暫不納入）
流動部位 = 流動現金（snapshotStore.cashBalance）
曝險比   = 台股市值 ÷（台股市值 + cashBalance）× 100%
```

> 待 AssetsPage 完成後，曝險部位擴充為：台股市值 + 外幣資產台幣值 + 債券台幣值

### 顯示設計

**PanelHeader（方案 C）：**

```
流動現金  NT$X,XXX,XXX  |  曝 72% ●
         ←  90px →
```

- 流動現金輸入框寬度縮至 90px（可容納 7 位數）
- Badge 顏色依「曝險比是否超過動態門檻」判斷：
  - 未超過 → `--down`（安全）
  - 超過 → `--up`（過度曝險）
- Hover Tooltip（Radix Tooltip）：說明計算方式與動態門檻來源

**動態門檻（依 `marketStateAuto`，無手動警戒線）：**

| 市場狀態 | 曝險比上限 |
|---------|-----------|
| `risk-on` | 85% |
| `neutral` | 75% |
| `risk-off` / `liquidity-dry` | 55% |
| `null`（無快照） | 75%（fallback） |

### VIX 自動市場狀態架構

```
每日 14:00 POST /snapshots/record
  → 後端並行抓取 Yahoo Finance ^VIX 當日收盤價
  → 計算 marketStateAuto（VIX < 20 → risk-on、20–30 → neutral、> 30 → risk-off）
  → 存入 daily_snapshot：{ vix, marketStateAuto }
  → 抓取失敗：靜默處理，兩欄位存 null，不中斷快照主流程

前端頁面載入
  → snapshotStore.load()（現有）同時取出 vix、marketStateAuto
  → PanelHeader 曝險比 Badge 使用 marketStateAuto 對應動態門檻
  → 零額外 API 呼叫
```

### RiskPanel 建議提示

當 `snapshotStore.marketStateAuto` 與手動 `marketState` 不一致時，RiskPanel 收折列顯示：

```
💡 系統建議：Risk-Off（VIX 32.5）
```

使用者自行決定是否手動切換；切換後觸發 dynamicRisk 批次重算（現有機制不變）。

---

---

## Phase A — 數學模型：風險品質補強（已完成）

詳細規格見 [`Docs/Financial Model Expansion Roadmap.md`](Financial%20Model%20Expansion%20Roadmap.md)。

### A1 最大回撤模型（MDD）

計算投組從歷史高點的跌幅與恢復能力，補足路徑風險描述。

```
rolling_peak_t = max(portfolio_value_0 ... portfolio_value_t)
drawdown_t     = portfolio_value_t / rolling_peak_t - 1
max_drawdown   = min(drawdown_t)
```

**輸出指標**：currentDrawdown、maxDrawdown、peakDate、troughDate、recoveryDays、isRecovered

**UI**：RiskPanel 下行風險 Tab；PanelHeader 距高點徽章（-5% 觀察 / -10% 警示）

### A2 VaR / CVaR 下行風險模型

歷史模擬法，不引入主觀參數假設。

```
VaR_95  = 歷史日報酬第 5 百分位
CVaR_95 = 最差 5% 日報酬的平均值
```

**資料門檻**：< 60 天顯示「資料不足」；90 天起顯示初版；252 天以上結果較可信

**UI**：RiskPanel 下行風險 Tab，顯示百分比與對應 TWD 金額

### A3 No-Trade Band（觀察區 / 交易區分層）

降低過度交易，避免小偏離觸發不必要再平衡。

```
observe_band = dynamic_threshold
trade_band   = dynamic_threshold × 1.5
```

| 偏離程度 | 狀態 | 行為 |
|---------|------|------|
| ≤ observe_band | 正常 | 不提示 |
| observe_band < δ ≤ trade_band | 觀察 | 顯示偏離，不主動建議交易 |
| > trade_band | 交易區 | 進入再平衡建議 |

### A4 再平衡成本效益模型

判斷交易是否值得執行，避免成本大於改善幅度。

```
trade_efficiency = deviation_reduction / estimated_cost
estimated_cost   = fee + tax + estimated_slippage
```

**輸出標籤**：建議交易 / 可觀察 / 效益不足

---

## Phase B — 數學模型：目標達成率追蹤（已完成）

詳細規格見 [`Docs/Financial Model Expansion Roadmap.md`](Financial%20Model%20Expansion%20Roadmap.md)。

> **B1 緊急預備金**：已移除。進入本系統的資金均為已分配的投資資金，無需緊急預備金追蹤。

### B2 今年進度追蹤

與計畫目標比較，衡量當年投組進度是否超前或落後。

```
elapsed_fraction = (今日 - 1/1) / (12/31 - 1/1)
expected_today   = 去年實際資產 + (今年計畫目標 - 去年實際資產) × elapsed_fraction
progress_ratio   = 目前資產 / expected_today
gap_amount       = 目前資產 - expected_today
```

**關鍵設計**：起始點使用去年最後一筆快照的實際資產（非計畫理論值），避免累積誤差造成進度虛高。

**狀態判斷**：progressRatio > 1.03 → 超前；0.97–1.03 → 符合；< 0.97 → 落後

**UI**：PlanPage PanelHeader「今年進度」格，Hover Tooltip 顯示完整計算鏈（起始值 / 今年目標 / 年度天數% / 今日期望 / 實際資產 / 進度比公式 / 差距公式）

### B3 年化需求報酬估算

估算達成第 30 年計畫目標所需的年化報酬率，判斷是否在計畫設定範圍內可達。

```
required_return = (第30年目標 / 目前資產)^(1 / 剩餘年數) - 1
```

**可達性判斷**：required_return ≤ rBase × kRisk → accent（可達）；否則 → 警示色

**UI**：PlanPage PanelHeader「30年所需報酬」格，Hover Tooltip 顯示目標 / 現值 / 剩餘年數 / 公式 / 計畫設定報酬率

### PlanPage PanelHeader 調整

| 調整 | 說明 |
|------|------|
| 移除「計畫達標」 | 語意與「今年進度」重疊（二元達標 → 連續進度比） |
| 新增「今年進度」 | progressRatio% + 差距萬元 + Tooltip |
| 新增「30年所需報酬」 | requiredReturn% / 年 + 剩餘年數 + Tooltip |

---

## 暫不開發

### AI 每日早報
- 原規劃透過 Claude API 每日生成結構化分析報告
- 已移除前後端相關實作（Phase 5 移除任務已完成）
- 如未來重啟，需重新評估 API 成本與系統提示設計

### 個人化警戒線自動推算
- Kelly Criterion、均值變異最佳化（MVO）
- 需快照累積至少 252 個交易日，且預期報酬估計需穩定

---

## 待後續討論（Phase C、D、E）

規劃細節見 [`Docs/Financial Model Expansion Roadmap.md`](Financial%20Model%20Expansion%20Roadmap.md)。

| Phase | 項目 | 依賴條件 |
|-------|------|---------|
| C1 | Portfolio Beta | 批次個股 beta API 或大盤歷史序列 API |
| C2 | 輕量壓力測試（Tag × Shock Preset） | 純前端，可直接開發 |
| C3 | 壓力測試 UI（RiskPanel 新 Tab） | 純前端，可直接開發 |
| D1 | 匯率曝險模型 | 外幣資產即時台幣值（已有） |
| D2 | 債券 Duration 模型 | 到期年限 + 利率資料（已有） |
| E1–E3 | 資產負債表、因子曝險 | 負債資料模型（新增） |

**Phase C1 後端需求**：批次取得所有持股 beta（`GET /fundamentals?codes=...`），或新增大盤歷史日收盤 API（`GET /market/history/TAIEX?days=252`）。C2/C3 純前端，不需後端支援。

- Phase 6 曝險比：AssetsPage 完成後，擴充曝險部位納入外幣資產與債券台幣值
