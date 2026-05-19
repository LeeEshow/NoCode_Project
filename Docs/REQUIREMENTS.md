# 個人理財雲端系統 — 管理層規劃文件

> 版本：2.0（2026-05-16）
> 開發任務：Front-End\Task_Frontend.md、Back-End\Task_Backend.md

---

## 已完成功能總覽

| 階段 | 內容 |
|------|------|
| Phase 1 | Tag 標籤功能（CRUD、Asset-Tag 內嵌、標籤設定 Tab） |
| Phase 2 | 風險模型監控層（Risk_total、Tag 偏差、市場狀態切換、相關性矩陣） |
| Phase 3 | 再平衡決策層（ADV 流動性過濾、快照、觸發按鈕） |
| Phase 4 | 進階優化（DynamicRisk 自動計算、ρ 自動計算、集中度定量警示、每月提醒） |
| UI 升級 | Radix UI Primitives、RiskPanel Tab 重構、收折列重組、Tooltip、View Transitions |
| 部署 | Azure Static Web Apps（前端）+ App Service B1（Node.js + Python）、Easy Auth、每日快照 CI/CD |

---

## 已確認設計決策（參考文件）

### 一、頁面結構

```
┌─────────────────── PanelHeader ───────────────────┐
│  日期 / 當天成長率 / 股票現值 / 整年報酬率           │
└───────────────────────────────────────────────────┘
┌──────────── MarketIndicesRow ─────────────────────┐
│  指數小卡 ...                                       │
└───────────────────────────────────────────────────┘
┌──────────── 風險再平衡模組（可收折）───────────────┐
│ 收折：▼ Risk：1.65  [市場狀態]  ⚠ 2標籤偏差  [快照▾]│
│ 展開：Tab 1 標籤配置 / Tab 2 風險設定               │
└───────────────────────────────────────────────────┘
┌────────────────── 庫存持股 ────────────────────────┐
│  持股表格  │  再平衡建議欄                           │
│  展開列：K線｜籌碼｜基本面｜交易紀錄｜標籤設定        │
└───────────────────────────────────────────────────┘
┌────────────────── 關注清單 ────────────────────────┐
└───────────────────────────────────────────────────┘
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

## Phase 5 — AI 每日早報

### 功能概述

每天台灣時間 06:00，系統自動將前一日快照 + 持股 + 風險再平衡模組資料送至 Claude API，生成結構化分析報告，儲存至 Firestore，前端新頁面或模組顯示。

### 架構

```
GitHub Actions（每日 22:00 UTC = 台灣 06:00）
  → POST /api/v1/ai/daily-report（後端觸發端點）
      → 收集資料（最新快照 + holdings + rebalance rules/snapshots）
      → 從 Firestore settings 讀取 System Prompt
      → 呼叫 Anthropic Claude API（temperature: 0）
      → 回傳固定結構 JSON
      → 存入 Firestore `daily_ai_reports` collection

前端 AI 早報頁面 / 模組
  → GET /api/v1/ai/daily-report/:date
  → 顯示報告內容
```

### System Prompt 管理

- 三位專家角色（宏觀策略師、台股投顧、風險長）合併為**一份 System Prompt**
- 存於 Firestore `settings/main` 的 `aiSystemPrompt` 欄位
- 前端**設定頁新增編輯 UI**，可直接編輯 System Prompt，無需重新部署
- 修改後立即生效（後端每次打 API 前從 DB 讀取最新版本）

### Response 結構（固定 JSON Schema）

```json
{
  "reportDate": "2026-05-16",
  "marketState": "Risk-On | Neutral | Risk-Off",
  "summary": "綜合評估文字",
  "exposureAnalysis": {
    "currentRatio": 78,
    "suggestedRatio": 70,
    "action": "建議減碼 8%"
  },
  "stockStrategies": [
    {
      "stockId": "2330",
      "stockName": "台積電",
      "action": "持有 | 加碼 | 減碼 | 觀望",
      "entryPrice": null,
      "exitPrice": 950,
      "timing": "本週若反彈至月線壓力區可分批減碼",
      "reason": "理由說明"
    }
  ],
  "riskWarnings": ["警示1", "警示2"],
  "generatedAt": "2026-05-16T22:10:00Z"
}
```

> 第一版不納入外幣與債券的個別建議；`stockStrategies` 僅涵蓋台股持倉。

### 後端 API

| 端點 | 說明 |
|------|------|
| `POST /api/v1/ai/daily-report` | 觸發當日報告生成（GitHub Actions 呼叫） |
| `GET  /api/v1/ai/daily-report/:date` | 取得指定日期報告（`date` 格式 `YYYY-MM-DD`） |
| `GET  /api/v1/ai/daily-report` | 取得最新一筆報告 |

- Anthropic API Key 存於**後端環境變數**（Azure App Service 設定），絕不暴露前端
- 建議模型：`claude-sonnet-4-5`
- `temperature: 0`，確保輸出穩定

### 前端

- 設定頁（`SettingsModal`）新增「AI 早報 System Prompt」編輯區
  - `<textarea>` 多行輸入，`onBlur` debounce `PUT /settings`
  - 顯示「上次更新時間」
- AI 早報頁面（新增路由 `/ai-report` 或整合至現有頁面 — 待決定）
  - 顯示最新報告，可切換歷史日期
  - 依 `reportDate` 和 `generatedAt` 標示資料新鮮度

### GitHub Actions（`daily-ai-report.yml`）

```yaml
on:
  schedule:
    - cron: '0 22 * * 0-4'  # 台灣時間 06:00，週一至週五（前一晚 UTC）
  workflow_dispatch:

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger AI daily report
        run: |
          curl -X POST \
            https://finance-backend-hzhvcpckemgedaeq.southeastasia-01.azurewebsites.net/api/v1/ai/daily-report \
            -H "Content-Type: application/json" \
            --fail --silent --show-error
```

> ⚠️ cron 注意：台灣週一早 06:00 = UTC 週日 22:00（`0 22 * * 0-4`，對應 UTC 週日至週四晚）

---

## Phase 6 — 曝險/流動比模組

### 功能概述

在風險再平衡模組（RiskPanel）新增**曝險部位 vs 流動部位**的顯示與警示，讓使用者即時掌握資金配置狀態。

### 核心計算

```
曝險部位 = 台股市值 + 外幣資產台幣值 + 債券台幣值
流動部位 = 流動現金（PanelHeader 已有）
曝險比   = 曝險部位 ÷（曝險部位 + 流動部位）× 100%
```

### 顯示設計

**三色警戒區間：**

| 曝險比 | 狀態 |
|--------|------|
| < 60% | 🟢 保守 |
| 60–80% | 🟡 均衡 |
| > 80% | 🔴 過度曝險 |

**顯示資訊：**
- 目前曝險比（百分比）
- 使用者自訂警戒線（預設 75%，可調整）
- 「距離目標比例差 NT$ X 萬」具體行動數字

### Risk On/Off 動態調節

| 市場狀態 | 建議曝險比上限 |
|---------|--------------|
| Risk-On（VIX < 20） | 85% |
| Neutral（VIX 20–30） | 75% |
| Risk-Off（VIX > 30） | 55% |

- 後端打 `/market` 時順帶計算 `marketStateAuto`（VIX 為依據，`^VIX` 已可從 Yahoo Finance 取得）
- 前端顯示「系統建議：Risk-On」，使用者可手動覆蓋（沿用現有市場狀態切換機制）
- 警戒線隨市場狀態動態調整；使用者手動鎖定時顯示「手動設定中」

### 警戒線初始值策略

- 第一版：固定預設 75%，使用者可手動調整
- 快照累積 90 天後：可從歷史資料回推個人化參數
- 警戒線存於 `rebalance-rules`（或 `settings`，待決定）

### 實作位置

- **前端**：`useRiskViewModel` 或新增 `useExposureViewModel`，計算 `exposureRatio`、`exposureWarning`
- **顯示位置**：RiskPanel 收折列補充顯示，或展開 Tab 1 底部新增一列
- **後端**：無需新 API（資料已有），若需自動 VIX 市場狀態則擴充 `/market` 回傳

---

## 暫不開發

### 壓力測試模組（§8.4）
- 三種情境（大盤重挫 / 半導體循環反轉 / 流動性枯竭）模擬功能
- 複雜度高、實用頻率低

### 個人化警戒線自動推算
- Kelly Criterion、歷史最大回撤回推
- 需快照累積至少 90 天，目前資料不足

---

## 待後續討論

- Phase 5 AI 早報前端顯示位置（新路由頁面 vs 整合至現有頁面）
- Phase 6 曝險比警戒線存放位置（`rebalance-rules` vs `settings`）
- Phase 5 `daily-ai-report.yml` cron 時間確認（cron 週期與台灣時區對應）
