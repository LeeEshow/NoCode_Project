# 個人理財雲端系統 — 功能規格

> 版本：4.0（2026-07-23）  
> 開發任務：`Front-End/Task_Frontend.md`、`Back-End/Task_Backend.md`

---

## 已完成功能

| 模組 | 功能 |
|------|------|
| **台股總覽** | 持股 CRUD、均價/損益計算、5s 即時報價輪詢（盤中）、交易紀錄 |
| | K 線圖、法人籌碼、基本面；AI 交易策略（tranches 多批次、價格/籌碼觸發規則） |
| | 關注清單（拖拉排序、自訂分組、小卡/表格視圖）、市場指數橫列 |
| **風險再平衡** | Tag 標籤 CRUD、目標配置、`Risk_total = √(wᵀΣw)` 風險量化 |
| | 市場狀態切換（VIX 每日自動偵測建議狀態）、相關性矩陣（Pearson ρ） |
| | No-Trade Band 分層（觀察/交易區）、ADV 流動性過濾、成本效益評估 |
| | Portfolio Beta（大盤日K歷史回歸）、壓力測試（5 種情境預設） |
| | MDD 最大回撤、VaR 95% / CVaR 95%（歷史模擬法） |
| | 因子曝險摘要（Tag actualWeight 排序橫條圖） |
| **其他資產** | 外幣/債券/海外股 CRUD、即時/手動匯率切換 |
| | 匯率曝險（per-currency 佔比、±1% 衝擊金額） |
| | 債券 Duration（代理法：`years_to_maturity × 0.8`、升降息 1% 損益） |
| **績效報告** | 每日資產快照、歷史趨勢折線圖（雙段比較）、每日交易買賣長條圖 |
| | 點擊長條圖查看當日交易明細（股票、股數、均價、金額）、圖例狀態持久化 |
| **年度計畫** | 30 年複利試算、今年進度追蹤（去年實際資產為基準線性插值）、30 年所需報酬估算 |
| **系統** | Easy Auth（Microsoft 帳號）、PanelHeader 曝險比 Badge（各頁面不同模式） |
| | MCP Server（22 Tools，Streamable HTTP + SSE）、每日排程快照 + FinMind 同步 |

---

## 設計決策

### 頁面結構

```
PanelHeader：日期 / 成長率 / 股票現值 / 整年報酬 / 流動部位 / 曝險比 Badge
MarketIndicesRow：大盤指數小卡
RiskPanel（可收折）：收折列顯示 Risk 值 / 偏差 / VIX 建議；展開 Tab 1 標籤配置 / Tab 2 壓力測試
HoldingsTable：持股展開列（K線｜籌碼｜基本面｜交易紀錄｜標籤設定）
WatchlistTable / WatchlistCardGrid：關注清單
```

### 計算架構

```
即時資料（5 秒輪詢）→ [監控層] Risk_total、Δ(tag) → 面板顯示、異常警示
                      ↓ 手動觸發
                      [決策層] ADV → FinalTradeAmount → 買賣股數建議
```

- 所有計算在**前端**執行，後端只負責資料存取
- 計算單位：全系統統一使用「股」

### API 設計

- 所有路由前綴 `/api/v1`；回應格式：`{ success: true, data: ... }` / `{ success: false, error: "..." }`
- Asset-Tag 資料內嵌於 `GET /holdings` 回傳的 `tags[]`
- 持股 Tag 操作：`/holdings/:stockCode/tags` 嵌套子資源

### 曝險比 Badge（PanelHeader）

各頁面 `exposureMode` 決定主指標：

| 頁面 | exposureMode | 主指標 |
|------|-------------|-------|
| StockOverviewPage | `stock` | 台股曝險 |
| AssetsPage | `forex` | 外幣曝險 |
| PlanPage / ReportPage | `investment` | 投資曝險（股+外幣） |

動態門檻（依 `marketStateAuto`）：risk-on 85%、neutral 75%、risk-off / liquidity-dry 55%。

### 圖表配色（莫蘭迪色系）

定義於 `styles/theme.ts` 的 `chartColors`（唯一來源，tokens.css 無對應 CSS 變數）：

| 名稱 | Hex |
|------|-----|
| 煙粉 | `#C8ACA4` |
| 苔灰 | `#A8B4A6` |
| 霧藍 | `#A0ACBA` |
| 燕麥 | `#C4B8A8` |
| 薰紫灰 | `#B4AEBC` |
| 鴿藍 | `#96A8B4` |

### Accessibility 規範

| 項目 | 規範 |
|------|------|
| icon-only 按鈕 | `aria-label` |
| 收折/展開 | `aria-expanded`、`aria-controls` |
| 表單欄位 | `<label htmlFor>` |
| 驗證訊息 | `aria-live="polite"` |
| 數值欄 | `font-variant-numeric: tabular-nums` |
| 動畫 | `prefers-reduced-motion` fallback |

---

## 暫不開發

| 功能 | 說明 |
|------|------|
| AI 每日早報 | 已移除（Phase 5）；若重啟需重新評估 Claude API 成本 |
| Kelly Criterion / MVO | 需快照累積 252 個交易日以上，預期報酬估計須穩定 |
