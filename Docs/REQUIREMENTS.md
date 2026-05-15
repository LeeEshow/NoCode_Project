# 個人理財雲端系統 — Tag-Based 投資組合風險與再平衡系統
# 管理層規劃文件

> 版本：1.1（2026-05-13）
> 參考文件：Docs\Risk and Rebalancing Model.md（專家規格 v2.0）
> 開發任務：Front-End\Task_Frontend.md、Back-End\Task_Backend.md

---

## 實作階段規劃

### Phase 1 — Tag 標籤功能（對應 v2 P0/P1 基礎）

**目標**：讓使用者能建立 Tag、為每支持股設定 Tag 對應，並儲存到後端。不做計算。

**前端工作：**
- 新增「風險再平衡模組」可收折面板（位於 MarketIndicesRow 與庫存持股之間）
  - 收折狀態：顯示 Risk 值 + 展開按鈕
  - 展開狀態：Tag 表格（Inline CRUD）+ 基礎設定（Phase 3 補完）
- 個股展開列新增「標籤設定」Tab（Asset-Tag 對應設定移至此處）
- 展開列新增「交易紀錄」Tab（歷史紀錄＋新增交易移入）
- 移除原有 RiskSettingsModal

**後端 API：**
- `GET/POST/PUT/DELETE /tags`
- Asset-Tag 資料改為**內嵌於持股 JSON**（見 API 設計章節）

---

### Phase 2 — 風險模型 + 顯示（對應 v2 P0 矩陣公式 + P2 警示）

**目標**：前端即時計算並在風險再平衡模組面板顯示 Risk_total 與 Tag 配置狀況（監控層）。

**前端工作：**
- 面板收折列顯示即時 Risk_total（跟 5 秒輪詢）
- 面板展開：Tag 表格的「狀態」欄顯示當前%/目標%、進度條
- 新增 `useRiskViewModel` 實作監控層計算：
  ```
  Risk_total = √( wᵀ × Σ × w )
  w_i = currentPrice × shares / Total_Asset
  actual_tag_weight = Σ w_i × WeightRatio
  Δ(tag) = actual_tag_weight - TargetWeight
  ```
- 相關性矩陣初期 hardcode ρ = 1.0

**後端 API：**
- `GET/PUT /tag-correlation-matrix`（Phase 2 後期）

---

### Phase 3 — 再平衡模型（對應 v2 P1 流動性過濾 + P2 動態門檻）

**目標**：產生每支持股的具體買賣股數建議（決策層，手動觸發）。

**前端工作：**
- HoldingsTable 右側加入再平衡建議欄（月份標題 + 每股：持平 / 賣N股 約NT$X / 買N股 約NT$X）
- 前端實作決策層計算：
  ```
  score_asset = Σ_t (Δ(tag) × asset_tag_weight(t))
  RawTradeAmount = Δ(tag) × Total_Asset
  ADV = 近 N 日平均成交量（N = advLookbackDays，預設 20）
  FinalTradeAmount = min(Raw, ADV × currentPrice × LiquidityCapRatio)
  建議股數 = FinalTradeAmount / currentPrice   ← 單位：股

> ⚠️ 文件修正（Code-Review）：原文 `RawTradeAmount = Δ(tag) × Total_Asset` 為單 Tag 簡化假設，多 Tag 情境下應為
> `RawTradeAmount = score_asset × Total_Asset`，其中 `score_asset = Σ_t (Δ_t × asset_tag_weight(i,t))`
> 程式碼（`useRebalanceViewModel.ts`）已正確實作，此處補正文件。
  ```
- 面板展開下半補完：基礎偏離門檻 slider + 其餘設定

**後端 API：**
- `GET/PUT /rebalance-rules`

---

## 已確認設計決策

### 一、頁面結構（v1.1 更新）

```
┌─────────────────── PanelHeader ───────────────────┐
│  日期 / 當天成長率 / 股票現值 / 整年報酬率           │
└───────────────────────────────────────────────────┘

┌──────────────── MarketIndicesRow ─────────────────┐
│  指數小卡 ...                                       │
└───────────────────────────────────────────────────┘

┌──────────── 風險再平衡模組（可收折）───────────────┐  ← NEW
│ 收折：▼ Risk：1.65              風險再平衡模組 收折  │
│ 展開：見下方說明                                     │
└───────────────────────────────────────────────────┘

┌────────────────── 庫存持股 ────────────────────────┐
│  持股表格（左）  │  再平衡建議欄（右，Phase 3）      │
│  個股展開列：K線｜籌碼｜基本面｜交易紀錄｜標籤設定   │
└───────────────────────────────────────────────────┘

┌────────────────── 關注清單 ────────────────────────┐
└───────────────────────────────────────────────────┘
```

### 二、風險再平衡模組面板

#### 收折狀態（v1.2 更新）
```
▼ 風險/再平衡模組    Risk：1.65  ⚠    正常    ⚠ 2 標籤偏差    再平衡：[05/03 14:22 ▾]    展開
```

| 區段 | 內容 | 說明 |
|---|---|---|
| 左 | `▼ 風險/再平衡模組` | 展開/收折控點，含模組標題 |
| 中左 | `Risk：1.65  ⚠` | 即時 Risk_total；`hasWarning` 時顯示 ⚠（`--up` 色） |
| 中 | `正常` / `Risk-On` / `Risk-Off` / `流動性枯竭` | 當前市場狀態 Badge（小標籤） |
| 中右 | `⚠ 2 標籤偏差` | 偏差標籤數摘要（偏差數 = 0 時隱藏） |
| 右 | `再平衡：[日期時間 ▾]` | 快照下拉選單（原 HoldingsTable 標題欄移至此處） |

- Phase 1：Risk 值顯示 `—`（尚無計算）
- Phase 2：顯示即時 Risk_total
- 快照下拉：無快照時顯示「—」（disabled）；有快照時列出最近 10 筆，格式 `MM/DD HH:mm`

#### HoldingsTable 再平衡建議欄標題（同步變更）
- **移除**原本內嵌的快照下拉選單
- 欄位標題改為靜態文字：`再平衡建議`
- `selectedSnapshotId` state 仍由 `StockOverviewPage` 持有，透過 props 分別傳給 `RiskPanel`（收折列渲染下拉）與 `HoldingsTable`（根據選中快照渲染建議欄）

#### 展開狀態
```
▲  Risk：1.65                        風險再平衡模組  展開

  Tag      風險值  配置    行為   [進度條]  狀態          說明
  半導體    0.8    ≤ 20%  Hold   ████░░    18% / 20%    {說明}
  成長      0.55   ≤ 40%  Hold   ███░░░    30% / 40%
  高股息    0.3    ≥ 40%  Hold   █████░    44% / 40%    ⚠ 超標
  市值型    0.4    ≤ 30%  Hold   ████░░    25% / 30%
  槓桿      1      ≤ 10%  Hold   ██░░░░     8% / 10%
  [+ Add]

  ───────────────────────────────────────────
  基礎偏離門檻：——●—— ± 5%
  {其餘設定（Phase 3）}
```

**Tag 表格欄位說明：**
- **Tag**：標籤名稱（可點擊編輯 Inline）
- **風險值**：BaseRisk 係數
- **配置**：TargetWeight（含 ≤ / ≥ 符號依風控規則）
- **行為**：FallbackBehavior（Hold / Exclude）
- **進度條**：當前% 填滿程度（Phase 2 才有值）
- **狀態**：`當前% / 目標%`（Phase 2）
- **說明**：偏差提示（Phase 2）

**+ Add 按鈕**：在表格最後一列 Inline 展開新增表單

### 三、個股展開列 Tab 結構（v1.1 更新）

```
K線  ｜  籌碼  ｜  基本面  ｜  交易紀錄（Phase 1）  ｜  標籤設定（Phase 1）
```

**「標籤設定」Tab 內容（取代原 Asset-Tag Modal Tab）：**
- 顯示此股目前掛載的 Tag 與 WeightRatio
- 「+ 加入 Tag」下拉，選擇全局 Tag 清單中的標籤
- WeightRatio onBlur 自動儲存
- 合計驗證（= 100% 綠 / < 100% 橘 / > 100% 紅）

### 四、API 設計（Asset-Tag 內嵌結構）

**設計方向**：Asset-Tag 資料內嵌於持股 JSON，不使用獨立 `/asset-tags` endpoint

```json
// GET /holdings 回傳結構（擴充）
{
  "stockCode": "0056",
  "stockName": "元大高股息",
  "currentPrice": 44.72,
  "shares": 4000,
  ...（現有欄位）,
  "tags": [
    { "id": "uuid", "tagName": "高股息", "weightRatio": 50.0 },
    { "id": "uuid", "tagName": "市值型", "weightRatio": 50.0 }
  ]
}
```

**Tag 維護仍使用獨立 endpoint：**
- `GET/POST/PUT/DELETE /tags`

**Asset-Tag 操作改為持股子資源：**
- `POST   /holdings/:stockCode/tags` — 新增此股 Tag 對應
- `PUT    /holdings/:stockCode/tags/:id` — 更新 WeightRatio
- `DELETE /holdings/:stockCode/tags/:id` — 移除 Tag 對應

### 五、計算單位

- **全系統統一使用「股」**（不使用「張」）
- 再平衡建議顯示格式：`賣 200 股  約 NT$8,000` / `買 500 股  約 NT$3,000`
- 決策層計算：`建議股數 = FinalTradeAmount / currentPrice`

### 六、計算架構（雙層，專家建議）

```
即時資料（5秒輪詢）
    ↓
[監控層] Risk_total、Δ(tag) → 面板顯示、異常警示      ← Phase 2
    ↓ 月底 / 手動觸發
[決策層] 引入昨日 ADV → FinalTradeAmount → 買賣股數建議  ← Phase 3
    ↓ 人工確認
執行交易
```

- 所有計算在**前端**執行，後端只負責資料存取
- Risk_total 為純顯示指標，不直接觸發再平衡（移除 {評價} 文字）
- 再平衡觸發依據：`|Δ(tag)| > Dynamic_Threshold`
- ADV 來源：昨日 K 線最後一根 candle（現有 API）

### 七、Accessibility 規範（全 Phase）

| 項目 | 規範 |
|---|---|
| icon-only 按鈕 | 必須有 `aria-label` |
| 收折/展開按鈕 | `aria-expanded`、`aria-controls` |
| 表單欄位 | `<label htmlFor>` 對應每個 input |
| 驗證訊息 | `aria-live="polite"` 包覆 |
| 數值欄 | `font-variant-numeric: tabular-nums` |
| 動畫 | `prefers-reduced-motion` fallback |

---

## 全專案圖表配色（莫蘭迪色系）

> 適用於所有 ECharts 圖表（長條圖、圓餅圖、進度條、多線圖等）
> 原則：極低飽和度（S 8～20%），粉霧質感，不使用鮮豔色

| Token | 名稱 | Hex | 用途 |
|---|---|---|---|
| `--chart-1` | 煙粉 Smoky Rose | `#C8ACA4` | 第一系列 / Tag 1 |
| `--chart-2` | 苔灰 Moss Grey | `#A8B4A6` | 第二系列 / Tag 2 |
| `--chart-3` | 霧藍 Fog Blue | `#A0ACBA` | 第三系列 / Tag 3 |
| `--chart-4` | 燕麥 Oatmeal | `#C4B8A8` | 第四系列 / Tag 4 |
| `--chart-5` | 薰紫灰 Lavender Smoke | `#B4AEBC` | 第五系列 / Tag 5 |
| `--chart-6` | 鴿藍 Pigeon Blue | `#96A8B4` | 第六系列 / Tag 6 / 補充色 |

**使用規則：**
- 圓餅圖 / Tag 配置圖：依序 chart-1 ～ chart-6 分配給各 Tag
- 長條圖對比：chart-1 vs chart-3（暖冷對比）
- Tag 進度條填滿色：對應該 Tag 的 chart-N 色，進度條**不因超標變色**
- 不與系統功能色（`--up` / `--down` / `--accent`）混用於同一圖表

---

## Phase 2 已確認設計決策

### useRiskViewModel 架構
- `StockOverviewPage` 將 `holdings.items`（含即時股價、tags[]）與 `tags`（含 dynamicRisk、targetWeight）作為參數傳入
- `useRiskViewModel(holdings, tags)` 為純計算 ViewModel，內部用 `useMemo` 驅動，**不自行 fetch API**
- holdings 每 5 秒更新 → Risk_total 自動跟著重算，無額外 Request
- Σ 矩陣使用 `tag.dynamicRisk`（非 baseRisk）；初期 dynamicRisk = baseRisk，市場狀態切換後自動生效，**前端 code 不需改動**

### RiskPanel 展開表格「說明」欄
- 進度條**不變色**，所有偏差狀態一律以說明欄文字顯示：

| 說明欄文字 | 情境 |
|---|---|
| `✓ 配置正常` | 當前配置在目標範圍內 |
| `偏差 +4%` | 有偏差但未超過 Dynamic_Threshold |
| `⚠ 偏差 +6%，建議再平衡` | 超過 Dynamic_Threshold |

### 同質 Tag 重疊警示
- 顯示位置：**個股展開列「標籤設定」Tab 內**
- 當該股的 Tag 組合與其他持股完全相同時顯示提示
- 範例：「0056 與 00894 持有相同標籤，注意集中度」

### 相關性矩陣
- Phase 2 初期：ρ 全部 hardcode 為 **1.0**（最保守估計），不開放 UI 輸入
- Phase 2 後期：開放手動輸入，UI 位於 **RiskPanel 展開區塊下方**（可收折子區塊）

---

## Phase 2 後期 已確認設計決策

### 市場狀態切換 UI

- **位置**：RiskPanel 展開區塊，相關性矩陣子區塊上方
- **UI 形式**：Radio group — `正常 / Risk-On / Risk-Off / 流動性枯竭`
- **行為**：選擇後呼叫 `PUT /market-state`，完成後重新 `loadTags()`，`useRiskViewModel` 自動用新 `dynamicRisk` 重算
- **Tag 預設值設定**：TagManagerTab Inline 編輯表單新增三個欄位：`Risk-On 係數 / Risk-Off 係數 / 流動性枯竭係數`（範圍 0–3，未填預設等於 `baseRisk`）
- **`正常` 狀態**：`dynamicRisk = baseRisk`，不需 preset

### 相關性矩陣 UI

- **位置**：RiskPanel 展開區塊最下方，可收折子區塊（預設收折）
- **UI 形式**：N × N 上三角表格，欄列標頭為 Tag 名稱；對角線灰化（固定 ρ = 1.0）
- **操作**：每格為 inline 數值 input（範圍 0–1），`onBlur` 整筆呼叫 `PUT /tag-correlation-matrix`
- **載入時機**：RiskPanel 展開時呼叫 `GET /tag-correlation-matrix`，`useTagViewModel` 負責 fetch
- **useRiskViewModel 整合**：接受 `correlationEntries` 作為第三參數，Phase 2 後期啟用；ρ 未設定的 pair 仍預設 1.0

---

## Phase 3 已確認設計決策

### 再平衡快照（Rebalance Snapshot）

- 每次觸發計算後，前端將**當時的參數 + 計算結果**整包 `POST /rebalance-snapshots` 存入後端
- 快照結構：`createdAt`、`params`（totalAsset / baseThreshold / liquidityCapRatio / marketState）、`suggestions[]`（每股：action / shares / estimatedAmount / isLiquidityLimited）
- 頁面載入時取最新一筆顯示（`GET /rebalance-snapshots?limit=10`）
- HoldingsTable 建議欄標題旁加下拉選單，可切換檢視歷史快照（最多 10 筆）

### 再平衡觸發按鈕

- 位置：**RiskPanel 展開區塊底部**
- 按下後：前端執行決策層計算 → 儲存快照 → 重新載入清單並選中最新筆

### VolatilityFactor

- Phase 3 初期：hardcode = 1.0（`Dynamic_Threshold = BaseThreshold`，門檻固定）
- Phase 3 後期：以現有 K 線 API 計算 `Current_Vol / Historical_Vol`，全前端實作，不需新後端 API

### 收折 / 展開動畫

- 使用 CSS `grid-template-rows: 0fr → 1fr` transition（平滑高度動畫，不受內容高度限制）
- 持續時間：250ms ease-out
- `@media (prefers-reduced-motion: reduce)` fallback：直接切換，無動畫

---

## 進階優化 已確認設計決策

### 同質 Tag 集中度定量警示

- 在 `useRiskViewModel` 計算重疊群組時，同時計算各群組合計持股市值佔總資產的百分比
- 超過集中度門檻時升級為警示（原本只有定性提示）
- **門檻**：可設定，預設 70%，範圍 50%～95%，UI 位於 RiskPanel 展開設定區，label「同質 Tag 集中度上限」
- **顯示位置（雙顯）**：
  1. RiskPanel 展開表格說明欄：受影響的 Tag 行顯示「⚠ 同質集中 XX%，超過上限」
  2. 個股展開列「標籤設定」Tab：顯示群組佔比（現有 2-F 提示升級為含數字）
- **影響範圍**：`useRiskViewModel` 回傳的 `OverlappingTagGroup` 新增 `combinedWeight: number`；`RebalanceRulesDTO` 或獨立設定欄位新增 `concentrationLimit: number`（待決定存放位置）

---

### DynamicRisk 自動計算

- **手動 preset 保留**：Tag Inline 編輯表單的三個係數欄位（Risk-On / Risk-Off / 流動性枯竭）維持手動可填
- **自動計算按鈕**：Inline 表單新增「自動計算」按鈕，計算後以建議值填入三個欄位（可手動覆蓋再儲存）
- **計算方法修正（v1.1）**：
  > ⚠️ 原始規格以年化標準差直接作為 DynamicRisk，與 baseRisk 單位不同（1200x 量綱差異），已廢棄。
  
  改以 **baseRisk 為錨點，乘上近期波動比與市場狀態倍率**：
  ```
  recent_vol = std(近 20 日 tag_daily_return)   // 近期波動
  base_vol   = std(近 90 日 tag_daily_return)   // 基準波動
  vol_ratio  = recent_vol / base_vol             // 近期相對基準的波動倍數

  建議 Risk-On 係數    = baseRisk × 1.3 × vol_ratio
  建議 Risk-Off 係數   = baseRisk × 1.8 × vol_ratio
  建議流動性枯竭係數   = baseRisk × 2.5 × vol_ratio
  ```
  - `vol_ratio = 1`（市場平穩）→ 建議值 = baseRisk × 市場倍率（如 0.6 → 0.78 / 1.08 / 1.50）
  - `vol_ratio > 1`（近期波動放大）→ 建議值同步放大，提高風險係數
  - `vol_ratio < 1`（近期波動收斂）→ 建議值同步縮小
- **互動流程**：按下「自動計算」→ 三個欄位以建議值填入（橘色底色標示「待確認」）→ 使用者可直接儲存或手動修改後儲存

---

### ρ 相關性矩陣自動計算

- **觸發方式**：手動按鈕「重新計算 ρ」，位於 2-H 矩陣 UI 旁邊
- **計算方法**（全前端，不需新 API）：
  1. 取各持股近 90 日每日報酬率（現有 K 線 API）
  2. 每天算各 Tag 日報酬率：`tag_return(t, day) = Σ_i ( w_i × daily_return_i × weightRatio_i )`
  3. Pearson 相關係數 → ρ(tagA, tagB)
- **確認流程**：計算完後顯示結果讓使用者確認，確認後才 `PUT /tag-correlation-matrix` 儲存
- **快照**：不需完整快照系統；後端每次儲存新矩陣時自動備份前一版（僅保留最近 2 版）
- **相關性異動警示（§8.1）**：前端確認儲存前比較新舊 ρ，任一 pair 差距 > 0.2 → 顯示「⚠ 相關性異動警示，建議重新評估再平衡」；差距 > 0.2 的 pair 在矩陣表格內標記橘色
- **後端擴充**：`GET /tag-correlation-matrix` 回傳結構新增 `previousEntries[]` 欄位供前端比較
- **連動再平衡**：
  - 監控層（Risk_total / tagStats）：`useRiskViewModel` 為純 `useMemo`，`correlationEntries` 變動後自動重算，**無需額外處理**
  - 決策層（再平衡快照）：維持手動觸發；ρ 儲存後若任一 pair 變化 > 0.2，在「計算再平衡」按鈕旁顯示「⚠ 相關性已更新，現有再平衡建議可能已過期，建議重新計算」

---

### 再平衡每月提醒（§8.3 條件 B）

- **觸發條件**：每月 1 日，若當月尚無再平衡快照（最新快照的 `createdAt` 不在本月）
- **顯示位置**：RiskPanel 收折列靜態文字提示：「⏰ 本月尚未執行再平衡，建議計算」
- **消失條件**：使用者觸發一次再平衡計算後（當月有快照），提示自動消失
- **實作**：前端根據 `snapshots[0].createdAt` 與當月日期比對，純前端邏輯，不需後端

---

### ADV 計算精確度

- ADV 定義改為「近 N 日平均成交量」，取代原本「昨日單根 candle volume」
- N 為可設定參數，預設 20 天，範圍 5～60 天
- **UI 位置**：RiskPanel 展開設定區（與 baseThreshold、liquidityCapRatio 並列），數字輸入框，label「ADV 計算天數」
- **影響範圍**：`RebalanceRulesDTO` 新增 `advLookbackDays: number`；後端 `GET/PUT /rebalance-rules` 同步擴充（Breaking Change）；`useRebalanceViewModel` 改用此參數

---

## Phase 5 — AI 顧問評估

### 設計決策

- **觸發方式**：前端三個獨立按鈕，各自觸發對應評估
- **顯示位置**：獨立 Modal，三個 Tab（Tag 設定 / 目標配置 / 交易策略）
- **架構**：前端 → `POST /ai/evaluate` 後端 proxy → Anthropic Claude API（API Key 存於後端環境變數）

### 三個評估項目

| 項目 | type 參數 | 送出資料 | 對應 Skill system prompt |
|---|---|---|---|
| 1. 個股 Tag 設定建議（新增/刪除/配比） | `"tag"` | holdings + tags + 市場狀態 | `tw-stock-investment-advisor` |
| 2. Tag 目標配置建議（targetWeight） | `"weight"` | tagStats + riskTotal + totalAsset | `risk-manager` |
| 3. 再平衡交易策略 | `"trade"` | rebalanceSnapshot + tagStats | 兩者協同 |

### 後端 API

- `POST /ai/evaluate { type, data }` — 後端依 type 選對應 system prompt（來自 Skill 定義複製），呼叫 Claude API 回傳結構化評估結果
- Anthropic API Key 存於後端環境變數，**絕不暴露於前端**
- 建議模型：`claude-sonnet-4-6`

### 待規劃細項（下次討論）
- API 回傳格式（structured JSON 或 Markdown）
- 各 type 的完整送出資料結構
- 前端 Modal UI 細節

---

---

## RiskPanel 展開區塊 UI 重構 已確認設計決策

### 分頁結構（Tab Layout）

展開狀態改為雙 Tab 佈局，取代原本線性排列：

```
▲  Risk：1.65                        風險再平衡模組  展開

  ┌─ 標籤配置 ──┬─ 風險設定 ─────────────────────────┐
  │              │                                    │
  └──────────────┴────────────────────────────────────┘
```

**Tab 1 — 標籤配置**
- Tag 表格（Tag 名稱 / 風險值 / 配置目標 / 行為 / 進度條 / 狀態 / 說明）
- 進度條填滿色：**統一使用一種顏色**（`--accent #6A8FB5`），不依 Tag 序號循環不同莫蘭迪色
  - 原本「Tag 進度條填滿色對應 chart-N」規則**廢棄**，改為單色，視覺更簡潔
- `[+ Add]` 按鈕（Inline 新增 Tag）

**Tab 2 — 風險設定**
- 市場狀態 Radio group（正常 / Risk-On / Risk-Off / 流動性枯竭）
- 偏離門檻 slider（baseThreshold）
- 流動性上限 slider（liquidityCapRatio）
- ADV 計算天數 輸入框（advLookbackDays）
- 同質 Tag 集中度上限 slider（concentrationLimit）
- VolatilityFactor 計算值（唯讀標籤，自動更新）
- **相關性矩陣（N×N 上三角表格）**：
  - 移除可收折包裝，**常開顯示**（不再有折疊按鈕）
  - 「重新計算 ρ」按鈕位於矩陣標題右側
  - ρ 差距 > 0.2 的 pair 標記橘色（確認流程不變）
- 「計算再平衡」觸發按鈕（RiskPanel 底部）

### Tab 元件規範
- Tab 使用 `role="tablist"` / `role="tab"` / `role="tabpanel"` / `aria-selected`
- 切換不觸發 API（設定類 tab 無需重載，RiskPanel `onExpand` 時已載入矩陣）
- Tab 欄位樣式沿用 `global.css` 標準 Tab（與個股展開列一致）

---

## 暫不開發

### 壓力測試模組（§8.4）
- 三種情境（大盤重挫 / 半導體循環反轉 / 流動性枯竭）模擬功能
- 複雜度高、實用頻率低，暫不排入開發計畫

---

## 待後續討論

- （暫無）
