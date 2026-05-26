# 個人理財雲端系統
## 數學模型擴充規劃書
### 版本 v1.0 — 2026-05-25

---

## 一、規劃目的

目前系統已具備 Tag-Based 投資組合管理核心，包含：

- Tag 權重分攤
- 相關性矩陣風險公式
- DynamicRisk 動態風險係數
- 動態再平衡門檻
- ADV 流動性過濾
- VIX 自動市場狀態
- 曝險比監控
- 再平衡建議快照

這代表系統已從單純記帳工具，升級為「個人資產配置與風險控管儀表板」。

本規劃書的目標，是在不破壞現有架構的前提下，補上更貼近個人投資決策與財務管理的數學模型，使系統逐步具備：

- 路徑風險評估
- 極端損失評估
- 交易成本與再平衡效益判斷
- 個人現金流安全性分析
- 長期財務目標追蹤
- 外幣、債券與負債納入後的完整資產負債視角

---

## 二、設計原則

### 2.1 先解釋，再最佳化

個人理財系統不應優先追求黑箱最佳化。模型輸出必須能讓使用者理解：

- 目前風險從哪裡來
- 壞情境下可能損失多少
- 是否真的需要交易
- 現金是否足以支撐生活
- 是否正在朝財務目標前進

### 2.2 優先使用歷史資料與可觀測資料

初期避免大量依賴主觀預期報酬。建議優先使用：

- 每日資產快照
- 持股市值
- Tag 權重
- K 線歷史報酬
- VIX / marketStateAuto
- 現金餘額
- 外幣與債券資產
- 使用者輸入的年度計畫與生活支出

### 2.3 模型輸出要能轉化為 UI 決策提示

每個模型都應盡量產生明確狀態，例如：

- 正常
- 觀察
- 警示
- 建議行動

避免只產生一個難以解讀的數字。

---

## 三、模型擴充總覽

| 優先級 | 模型 | 核心用途 | 建議位置 |
|---|---|---|---|
| P0 | 最大回撤模型 | 衡量從高點下跌與恢復能力 | ReportPage / RiskPanel |
| P0 | VaR / CVaR 下行風險 | 衡量極端損失 | RiskPanel |
| P0 | 再平衡成本效益模型 | 判斷交易是否值得執行 | Rebalance 建議 |
| P0 | No-Trade Band | 降低過度交易 | RiskPanel / Rebalance 建議 |
| P1 | 緊急預備金模型 | 衡量現金生活安全性 | PanelHeader / AssetsPage |
| P1 | 目標達成率模型 | 追蹤長期財務目標 | PlanPage / ReportPage |
| P1 | Portfolio Beta | 衡量相對大盤敏感度 | RiskPanel |
| P2 | 輕量壓力測試 | 快速估算情境損失 | RiskPanel 第三 Tab |
| P2 | 匯率曝險模型 | 評估外幣匯率影響 | AssetsPage |
| P2 | 債券 Duration 模型 | 評估利率敏感度 | AssetsPage |
| P3 | 資產負債表模型 | 建立完整淨值視角 | AssetsPage / ReportPage |
| P3 | 因子曝險模型 | 將 Tag 升級為正式 factor exposure | RiskPanel |

---

## 四、P0：投資風險與再平衡品質

### 4.1 最大回撤模型（Maximum Drawdown）

#### 目的

目前 `Risk_total` 衡量的是當下投組結構風險，但無法描述「資產從高點跌落多少」以及「多久才能恢復」。

最大回撤模型可補足路徑風險，特別適合個人投資者評估心理承受度。

#### 核心公式

```text
rolling_peak_t = max(portfolio_value_0 ... portfolio_value_t)
drawdown_t = portfolio_value_t / rolling_peak_t - 1
max_drawdown = min(drawdown_t)
recovery_days = 回到前高所需天數
```

#### 建議輸出

| 指標 | 說明 |
|---|---|
| currentDrawdown | 目前距離歷史高點的跌幅 |
| maxDrawdown | 歷史最大回撤 |
| peakDate | 歷史高點日期 |
| troughDate | 最大回撤低點日期 |
| recoveryDays | 從低點回到前高所需天數 |
| isRecovered | 是否已回到前高 |

#### UI 建議

- ReportPage：新增回撤曲線
- RiskPanel：顯示目前回撤與歷史最大回撤
- PanelHeader：當 currentDrawdown 超過警戒線時顯示提示

---

### 4.2 VaR / CVaR 下行風險模型

#### 目的

相關性矩陣可衡量結構風險，但個人投資者更關心極端壞情境下可能虧損多少。

建議先採用歷史模擬法，不引入複雜參數假設。

#### 核心公式

```text
daily_return_t = portfolio_value_t / portfolio_value_(t-1) - 1
VaR_95 = 歷史日報酬第 5 百分位
CVaR_95 = 最差 5% 日報酬的平均值
```

若以金額表示：

```text
VaR_amount = total_asset_value × abs(VaR_95)
CVaR_amount = total_asset_value × abs(CVaR_95)
```

#### 建議輸出

| 指標 | 說明 |
|---|---|
| var95Pct | 95% 信心水準下的單日損失百分比 |
| var95Amount | 對應金額損失 |
| cvar95Pct | 最差 5% 日子的平均損失百分比 |
| cvar95Amount | 對應金額損失 |
| sampleDays | 使用樣本天數 |

#### 注意事項

- 快照資料少於 60 天時，只顯示「資料不足」
- 90 天以上可顯示初版
- 252 天以上可顯示較可信結果

---

### 4.3 再平衡成本效益模型

#### 目的

目前系統可依 Tag 偏離與 ADV 產生交易建議，但還缺少「這筆交易是否值得做」的判斷。

個人投資常見問題不是不知道如何再平衡，而是太頻繁交易。成本效益模型可避免小偏離導致不必要交易。

#### 核心公式

```text
risk_reduction = risk_before - risk_after
deviation_reduction = total_abs_deviation_before - total_abs_deviation_after

benefit_score = a × risk_reduction + b × deviation_reduction
estimated_cost = fee + tax + estimated_slippage
trade_efficiency = benefit_score / estimated_cost
```

簡化版可先採：

```text
trade_efficiency = deviation_reduction / estimated_cost
```

#### 成本項目

| 成本 | 說明 |
|---|---|
| fee | 手續費 |
| tax | 證交稅或交易稅 |
| estimatedSlippage | 依 ADV 與交易金額估算滑價 |

#### 建議輸出

| 狀態 | 條件 | 顯示文字 |
|---|---|---|
| 建議交易 | 效益明顯高於成本 | 建議再平衡 |
| 觀察 | 效益略高於成本 | 可觀察，暫不急 |
| 不建議交易 | 成本高於改善幅度 | 偏離存在，但交易效益不足 |

---

### 4.4 No-Trade Band 模型

#### 目的

再平衡不應只有「觸發 / 不觸發」。建議引入觀察區與交易區，降低過度交易。

#### 核心公式

```text
observe_band = dynamic_threshold
trade_band = dynamic_threshold × trade_band_multiplier
```

建議預設：

```text
trade_band_multiplier = 1.5
```

#### 判斷邏輯

| 偏離程度 | 狀態 | 行為 |
|---|---|---|
| `abs(delta) <= observe_band` | 正常 | 不提示 |
| `observe_band < abs(delta) <= trade_band` | 觀察 | 顯示偏離，但不主動建議交易 |
| `abs(delta) > trade_band` | 交易區 | 進入再平衡建議 |

---

## 五、P1：個人財務安全與目標追蹤

### 5.1 緊急預備金模型

#### 目的

目前系統已有 `cashBalance` 與曝險比，但尚未判斷現金是否足以支撐生活。

緊急預備金模型是個人理財系統的核心安全指標。

#### 核心公式

```text
emergency_months = liquid_cash / monthly_expense
```

#### 建議狀態

| 月數 | 狀態 | 說明 |
|---|---|---|
| `< 3` | 不足 | 現金安全墊偏低 |
| `3 - 6` | 基本 | 可支撐短期風險 |
| `6 - 12` | 穩健 | 現金安全性佳 |
| `> 12` | 過高 | 需檢查現金機會成本 |

#### 資料需求

- `cashBalance`
- 使用者設定的 `monthlyExpense`
- 未來可擴充：短期債券、貨幣基金、定存到期日

---

### 5.2 目標達成率 / 年化需求報酬模型

#### 目的

目前已有年度投報計畫，但可進一步判斷目前進度是否超前或落後，以及達成目標需要多少年化報酬。

#### 核心公式

```text
progress_ratio = current_value / expected_value_today
required_return = (target_value / current_value) ^ (1 / years_remaining) - 1
```

若以年度目標線性估算：

```text
expected_value_today = start_value + (target_value - start_value) × elapsed_days / total_days
```

#### 建議輸出

| 指標 | 說明 |
|---|---|
| progressRatio | 目前進度比 |
| requiredReturn | 剩餘期間所需年化報酬 |
| gapAmount | 與目標進度差距 |
| status | 超前 / 符合 / 落後 |

---

### 5.3 Portfolio Beta 模型

#### 目的

Tag DynamicRisk 是自定義風險係數，但使用者仍需要一個容易理解的市場敏感度指標：投組相對於大盤有多激進。

#### 核心公式

若已有個股 beta：

```text
portfolio_beta = Σ(asset_weight × asset_beta)
```

若用歷史報酬回歸：

```text
asset_return = alpha + beta × market_return + error
```

投組層級：

```text
portfolio_return = alpha + beta × market_return + error
```

#### UI 建議

| Beta | 解讀 |
|---|---|
| `< 0.8` | 防禦型 |
| `0.8 - 1.2` | 接近大盤 |
| `> 1.2` | 積極型 |

---

## 六、P2：情境分析與跨資產風險

### 6.1 輕量壓力測試模型

#### 目的

完整壓力測試模組複雜度較高，但可先做參數式輕量版本，讓使用者快速理解特定情境下的可能損失。

#### 核心公式

```text
stressed_return = Σ(tag_weight × shock_tag)
stressed_loss_amount = total_asset_value × abs(stressed_return)
```

#### 預設情境

| 情境 | Shock 設定 |
|---|---|
| 大盤重挫 | 市值型 -15%、成長 -20%、高股息 -10% |
| 半導體循環反轉 | 半導體 -25%、成長 -15% |
| 流動性枯竭 | 槓桿 -30%、成長 -20%、高股息 -15% |
| 台幣快速升值 | USD 資產依匯率曝險調整 |
| 利率上升 | 長債依 duration 估算跌幅 |

---

### 6.2 匯率曝險模型

#### 目的

AssetsPage 完成後，外幣資產應納入曝險比與跨幣別風險管理。

#### 核心公式

```text
currency_weight = currency_value_twd / total_assets
fx_impact = currency_weight × fx_change
```

#### 建議輸出

| 指標 | 說明 |
|---|---|
| currencyWeight | 各幣別佔總資產比例 |
| fxImpact1Pct | 匯率變動 1% 對總資產影響 |
| totalForeignCurrencyWeight | 外幣總曝險 |

---

### 6.3 債券 Duration / 利率敏感度模型

#### 目的

債券資產不應只記錄金額、利率與到期日，也應估算利率變動對價格的影響。

#### 核心公式

```text
price_change_pct ≈ -duration × rate_change
estimated_price_change = bond_value × price_change_pct
```

#### 初期簡化

若尚未記錄 duration，可先用到期年限近似：

```text
duration_proxy = years_to_maturity × 0.8
```

#### UI 建議

- 顯示升息 1% 估算損失
- 顯示降息 1% 估算收益
- 區分短債、長債、類現金

---

## 七、P3：完整財務結構與因子模型

### 7.1 資產負債表淨值模型

#### 目的

若系統要從投資儀表板升級為完整個人財務管理工具，需納入負債與淨值。

#### 核心公式

```text
net_worth = total_assets - total_liabilities
debt_ratio = total_liabilities / total_assets
liquidity_ratio = liquid_assets / short_term_liabilities
```

#### 建議負債類型

- 房貸
- 信貸
- 信用卡
- 分期付款
- 其他應付款

---

### 7.2 因子曝險模型

#### 目的

目前 Tag 系統已接近因子模型。未來可將 Tag 從分類工具升級為正式的 factor exposure。

#### 核心公式

```text
portfolio_exposure_factor = Σ(asset_weight × factor_loading)
```

#### 建議因子

- 成長
- 高股息
- 半導體
- 金融
- 市值型
- 槓桿
- 主動型
- 匯率曝險
- 利率曝險
- 流動性曝險

---

## 八、暫不建議優先開發的模型

### 8.1 Kelly Criterion

Kelly Criterion 理論上可推導最佳下注比例，但對勝率與報酬分布假設極度敏感。

在個人投資場景中，若資料不足或估計誤差過大，容易導出過度激進配置。因此建議等到至少累積 252 個交易日以上的投組報酬資料後，再評估是否作為研究型指標，而非直接作為交易建議。

### 8.2 完整均值變異最佳化

Mean-Variance Optimization 需要預期報酬、波動率與相關性矩陣。系統目前已有相關性與風險係數基礎，但預期報酬估計仍不穩定。

若過早導入，容易產生看似精準、實際脆弱的配置建議。因此建議先完成下行風險、回撤、成本效益與壓力測試後，再考慮是否導入限制式最佳化。

---

## 九、建議實作路線

### Phase A：風險品質補強

| 順序 | 項目 | 依賴資料 |
|---|---|---|
| A1 | 最大回撤模型 | daily_snapshots |
| A2 | VaR / CVaR | daily_snapshots |
| A3 | No-Trade Band | tagStats、dynamicThreshold |
| A4 | 再平衡成本效益 | rebalance suggestions、交易成本設定 |

### Phase B：個人財務安全

| 順序 | 項目 | 依賴資料 |
|---|---|---|
| B1 | 緊急預備金 | cashBalance、monthlyExpense |
| B2 | 目標達成率 | plan_config、daily_snapshots |
| B3 | 年化需求報酬 | plan_config、current net worth |

### Phase C：市場敏感度與情境分析

| 順序 | 項目 | 依賴資料 |
|---|---|---|
| C1 | Portfolio Beta | K 線、大盤指數 |
| C2 | 輕量壓力測試 | Tag 權重、shock preset |
| C3 | 壓力測試 UI | RiskPanel Tab |

### Phase D：跨資產整合

| 順序 | 項目 | 依賴資料 |
|---|---|---|
| D1 | 匯率曝險 | foreign_assets、即時匯率 |
| D2 | 債券 Duration | bond maturity、rate |
| D3 | 曝險比擴充 | 台股 + 外幣 + 債券 |

### Phase E：完整個人財務管理

| 順序 | 項目 | 依賴資料 |
|---|---|---|
| E1 | 負債資料模型 | liabilities |
| E2 | 淨值模型 | assets、liabilities |
| E3 | 因子曝險模型 | Tag / Factor loading |

---

## 十、結論

目前系統最適合的下一步，不是直接導入複雜最佳化模型，而是補上四個基礎風控能力：

1. 回撤風險
2. 極端下行風險
3. 再平衡交易效益
4. 個人現金安全性

這些模型能讓系統從「知道目前配置長什麼樣子」，進一步變成「知道這個配置是否適合使用者承受、是否值得交易、是否能支持長期財務目標」。

建議依 Phase A → Phase B → Phase C → Phase D → Phase E 逐步推進，並維持現有原則：前端負責純計算與顯示，後端負責資料存取與快照紀錄；若未來模型計算量增加，再評估是否將部分計算移至後端或快照背景任務。
