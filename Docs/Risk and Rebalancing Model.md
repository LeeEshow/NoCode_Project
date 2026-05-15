# 個人理財雲端系統
## Tag-Based 投資組合風險與再平衡系統
### 需求規格文件 v2.0 — 2026-05-07（優化版）

---

> **📋 v2.0 優化重點（三位專家審核後）**
>
> - [P0] Risk_total 公式引入相關性矩陣，取代原始線性加總
> - [P0] Tag Risk 係數改為動態（支援市場週期調整）
> - [P1] 平均權重升級為可選自訂權重，預設維持平均
> - [P1] TradeAmount 加入流動性過濾層（日均量上限驗證）
> - [P2] 再平衡觸發門檻引入動態波動率調整
> - [P2] TargetWeight 可選項目定義明確 fallback 行為

---

## 一、設計目標

建立一套以「標籤（Tag）」為核心的投資組合管理模型，用於：

- 多維度風險控管（含相關性矩陣）
- 彈性資產分類（多對多 Tag 關係）
- 自動再平衡決策（動態門檻驅動）
- 流動性感知交易執行（避免滑價損失）

---

## 二、核心概念

### 2.1 Tag（標籤）— 風險維度單位

每個標籤代表一種投資特性與風險維度：

- 成長、高股息、市值型
- 槓桿（正2）
- 產業（半導體、金融…）

### 2.2 Asset 與 Tag（多對多關係）

一檔資產可對應多個標籤，並支援自訂權重比例：

| 資產 | 對應 Tag | 預設權重分配 |
|---|---|---|
| 2330 台積電 | 成長 + 半導體 + 市值型 | 各 33.3%（平均） |
| 0056 元大高股息 | 高股息 + 市值型 | 各 50%（平均） |
| 00894 中信小資高價30 | 高股息 + 市值型 | 各 50%（平均） |
| 00981A 主動統一台股 | 主動 + 成長 | 各 50%（平均） |

> **⚠️ 風控注意：同質 Tag 重疊警告**
>
> 0056 與 00894 持有相同的 Tag（高股息 + 市值型），系統應在 Tag 權重計算時自動合併計算，避免假性分散造成曝險低估。建議於 UI 層顯示「同質 Tag 重疊提示」。

---

## 三、資料模型（Data Models）

### 3.1 Tag 設定

```ts
class Tag {
  string   Name;
  double   BaseRisk;         // 靜態基礎風險係數
  double   DynamicRisk;      // [NEW v2] 動態更新係數（考慮市場週期）
  double?  TargetWeight;     // 目標配置（可選，見 fallback 規則）
  string?  FallbackBehavior; // [NEW v2] "hold" | "exclude"
}
```

### 3.2 Asset 與 Tag 關係

```ts
class AssetTag {
  string AssetId;
  string TagName;
  double WeightRatio; // 預設平均；可自訂覆蓋
}
```

### 3.3 再平衡設定

```ts
class RebalanceRule {
  double BaseThreshold;     // 基礎偏離門檻，例如 0.05
  double VolatilityFactor;  // [NEW v2] 動態倍率（與市場波動率連動）
  double LiquidityCapRatio; // [NEW v2] 最大交易量 / 日均量，例如 0.20
}
```

### 3.4 Tag 相關性矩陣（NEW v2）

```ts
class TagCorrelationMatrix {
  Dictionary<(string, string), double> Correlations;
  // e.g. ("成長", "半導體") -> 0.85
  DateTime LastUpdated;
}
```

---

## 四、權重計算模型

### 4.1 資產權重

```
w_i = (Price × Quantity) / Total_Asset
```

### 4.2 Tag 權重分攤

依 WeightRatio 比例分配（預設平均）：

```
w_tag(i, t) = w_i × WeightRatio(i, t)
actual_tag_weight(t) = Σ_i w_tag(i, t)
```

---

## 五、風險模型（v2 優化）

### 5.1 v1 問題（線性加總）— 已廢棄

> **❌ v1 公式（存在缺陷）**
>
> `Risk_total = Σ(w_tag × Risk_tag)`
>
> 問題：完全忽略 Tag 之間的相關性，成長 + 半導體（ρ ≈ 0.85）嚴重低估真實曝險。

### 5.2 v2 矩陣風險公式（推薦）

> **✅ v2 公式（矩陣計算）**
>
> `Risk_total = √( wᵀ × Σ × w )`
>
> 其中：
> - `w` = Tag 權重向量
> - `Σ` = Tag 相關性矩陣（需定期更新）
>
> 最小化近似（初期可用）：
> ```
> Σ_ij = ρ(i,j) × Risk_i × Risk_j
> ```
>
> 範例：若 ρ(成長, 半導體) = 0.85，Risk_成長 = 0.4，Risk_半導體 = 0.6，
> 有效風險 > 簡單線性加總約 15%～20%

### 5.3 動態 Risk 係數

Tag.DynamicRisk 根據市場環境週期性更新：

| 市場狀態 | 成長 Tag Beta | 高股息 Tag Beta | 更新頻率 |
|---|---|---|---|
| Risk-On（多頭） | 1.5 | 0.8 | 月更新 |
| Risk-Off（空頭） | 2.2 | 1.1 | 月更新 |
| 流動性枯竭 | 2.8 | 1.6 | 立即觸發 |

### 5.4 風控限制規則

| Tag | 限制類型 | 閾值 | 說明 |
|---|---|---|---|
| 高股息 | 下限 | ≥ 30% | 穩定現金流保障 |
| 成長 | 上限 | ≤ 40% | 避免過度集中高 Beta |
| 槓桿 | 上限 | ≤ 10% | 極端行情保護 |
| 單一 Tag 組合 | 集中度 | ≤ 70% | 新增：防止假性分散 |

---

## 六、再平衡模型（v2 優化）

### Step 1：計算 Tag 當前權重

```
actual_tag_weight(t) = Σ_i (w_i × WeightRatio(i, t))
```

### Step 2：動態偏差門檻（NEW v2）

```
Dynamic_Threshold = BaseThreshold × (Current_Vol / Historical_Vol)

// 高波動時門檻放寬（避免頻繁交易）
// 低波動時門檻收緊（更敏感再平衡）

Δ(tag) = actual_tag_weight(t) - TargetWeight(t)
觸發條件：|Δ(tag)| > Dynamic_Threshold
```

### Step 3：資產評分

```
score_asset = Σ_t (Δ(tag) × asset_tag_weight(t))
score > 0 → 賣出方向
score < 0 → 買入方向
```

### Step 4：流動性感知交易量（NEW v2）

```
RawTradeAmount  = Δ(tag) × Total_Asset
MaxTradeAmount  = ADV × LiquidityCapRatio   // ADV = 日均成交量

// 流動性過濾
FinalTradeAmount = min(RawTradeAmount, MaxTradeAmount)

// 若 RawTradeAmount > MaxTradeAmount，記錄「流動性不足警告」
```

### Step 5：TargetWeight Fallback 規則（NEW v2）

| FallbackBehavior | 行為說明 | 適用情境 |
|---|---|---|
| `"hold"` | 維持現有權重，不納入再平衡計算 | 觀察期 Tag |
| `"exclude"` | 完全排除於再平衡邏輯之外 | 實驗性 Tag |
| 未設定（null） | 預設為 `"hold"` | 所有未設定 Tag |

---

## 七、MVP 實作清單（優先順序）

| 優先級 | 功能 | 說明 | 複雜度 |
|---|---|---|---|
| 🔴 P0 | Tag + BaseRisk | 核心標籤與風險係數 | 低 |
| 🔴 P0 | 矩陣風險公式 | 取代線性加總，至少用 ρ 近似 | 中 |
| 🔴 P0 | Asset 多 Tag 對應 | 多對多關係 + WeightRatio | 低 |
| 🟠 P1 | 自訂 Tag WeightRatio | 非平均分配支援 | 低 |
| 🟠 P1 | TargetWeight + Fallback | 設定目標與未設定行為 | 低 |
| 🟠 P1 | 流動性過濾層 | TradeAmount 上限驗證 | 中 |
| 🟡 P2 | 動態 Risk 係數 | 週期性更新 DynamicRisk | 高 |
| 🟡 P2 | 動態再平衡門檻 | 與波動率指標掛鉤 | 中 |
| 🟡 P2 | 同質 Tag 重疊警示 | UI 層顯示集中度警告 | 低 |

---

## 八、進階擴充（Phase 2）

### 8.1 動態相關性更新

- 每月以近 90 日報酬率重新計算 Tag 相關性矩陣
- 若 ρ 變化 > 0.2，觸發「相關性異常警示」

### 8.2 動態風險（波動率）

```
DynamicRisk_tag = std(近90日報酬率) × 市場週期調整因子
```

### 8.3 再平衡觸發條件

- 條件 A：`|Δ| > Dynamic_Threshold`（偏離驅動）
- 條件 B：每月固定執行一次（時間驅動）
- 條件 C：Tag 相關性矩陣大幅更新後強制評估（NEW v2）

### 8.4 壓力測試模組

| 情境 | 模擬條件 | 預期組合影響 |
|---|---|---|
| 大盤重挫 -15% | 所有 Beta > 1 的 Tag 同步下跌 | 預估 -12% ~ -15% |
| 半導體循環反轉 | 半導體 Tag 單獨承壓 | 預估 -20% ~ -28% |
| 流動性枯竭 | ETF 折價 + 流動性上限觸發 | 預估 -30% ~ -35% |

---

## 九、設計優點

- 多維風險控制：透過 Tag 相關性矩陣精確計算真實組合風險
- 流動性感知：交易量受日均量限制，避免市場衝擊
- 動態適應性：風險係數與再平衡門檻隨市場環境調整
- 高擴展性：新增 Tag 無需修改核心邏輯
- 假性分散防護：同質 Tag 重疊自動偵測與警示

---

## 十、結論

> **核心架構總結**
>
> 👉 使用 Tag 作為風險與配置的基本單位
> 👉 透過相關性矩陣（非線性加總）控制整體投組真實風險
> 👉 動態門檻 + 流動性過濾確保再平衡可執行性
> 👉 反推至 Asset 執行交易，流動性不足時自動降量並發出警示
>
> 此設計具備高度彈性與擴充性，適合作為個人理財系統的核心架構。
> 建議依 P0 → P1 → P2 順序分三期迭代實作。

---

*版本 v2.0 | 優化審核：Global Macro Strategist × TW Stock Advisor × Risk Manager*
