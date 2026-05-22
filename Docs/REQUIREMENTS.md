# 個人理財雲端系統 — 管理層規劃文件

> 版本：2.1（2026-05-21）
> 開發任務：Front-End\Task_Frontend.md、Back-End\Task_Backend.md

---

## 已完成功能總覽

| 階段 | 內容 |
|------|------|
| Phase 1 | Tag 標籤功能（CRUD、Asset-Tag 內嵌、標籤設定 Tab） |
| Phase 2 | 風險模型監控層（Risk_total、Tag 偏差、市場狀態切換、相關性矩陣） |
| Phase 3 | 再平衡決策層（ADV 流動性過濾、快照、觸發按鈕） |
| Phase 4 | 進階優化（DynamicRisk 自動計算、ρ 自動計算、集中度定量警示、每月提醒） |
| Phase 6 | 曝險/流動比模組（曝險比 Badge、VIX 自動市場狀態、RiskPanel 建議提示） |
| UI 升級 | Radix UI Primitives、RiskPanel Tab 重構、收折列重組、Tooltip、View Transitions |
| 部署 | Azure Static Web Apps（前端）+ App Service B1（Node.js + Python）、Easy Auth、每日快照 CI/CD |

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

## Phase 6 — 曝險/流動比模組

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

### 後端異動

| 檔案 | 異動 |
|------|------|
| `DailySnapshotDoc` | 新增 `vix: number \| null`、`marketStateAuto: MarketState \| null` |
| `snapshotsController.ts` | `POST /snapshots/record` 並行抓 `^VIX`，失敗靜默 |
| `GET /snapshots` | 回傳結構含新欄位，舊快照缺欄位 fallback `null` |

### 前端異動

| 檔案 | 異動 |
|------|------|
| `types/index.ts` | `DailySnapshotDTO` 新增 `vix?`、`marketStateAuto?` |
| `stores/snapshotStore.ts` | 擴充 `vix`、`marketStateAuto` 欄位 |
| `PanelHeader` | 曝險比 Badge（方案 C）、流動現金欄位縮寬 |
| `RiskPanel` | 收折列 `marketStateAuto` 建議提示 |

---

## 暫不開發

### AI 每日早報
- 原規劃透過 Claude API 每日生成結構化分析報告
- 已移除前後端相關實作（Phase 5 移除任務已完成）
- 如未來重啟，需重新評估 API 成本與系統提示設計

### 壓力測試模組（§8.4）
- 三種情境（大盤重挫 / 半導體循環反轉 / 流動性枯竭）模擬功能
- 複雜度高、實用頻率低

### 個人化警戒線自動推算
- Kelly Criterion、歷史最大回撤回推
- 需快照累積至少 90 天，目前資料不足

---

## 待後續討論

- Phase 6 曝險比：AssetsPage 完成後，擴充曝險部位納入外幣資產與債券台幣值
