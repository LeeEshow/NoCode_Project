/* ============================================================
   types/index.ts — DTO（後端回傳）與 Domain（前端使用）型別定義
   規則：型別只含資料欄位，不含行為方法
   ============================================================ */

/* ── 共用 ─────────────────────────────────────────────────── */

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}

/* ── 市場指數 ──────────────────────────────────────────────── */

export interface MarketIndexDTO {
  symbol:    string;
  name:      string;
  price:     number;
  change:    number;
  changePct: number;
  isUp:      boolean;
}

export interface BusinessCycleDTO {
  period:     string;
  score:      number;
  light:      'red' | 'yellow-red' | 'green' | 'yellow-blue' | 'blue';
  lightLabel: string;
}

export interface PmiDTO {
  period:      string;
  pmi:         number;
  nextPublish: string | null;
}

export interface MarketDataDTO {
  indices:       MarketIndexDTO[];
  businessCycle: BusinessCycleDTO | null;
  pmi:           PmiDTO | null;
}

/* ── 股票搜尋 ───────────────────────────────────────────────── */

export interface StockSearchResultDTO {
  code: string;
  name: string;
}

/* ── 報價來源與狀態（QUOTE-F-01）──────────────────────────── */

export type QuoteSource = 'shioaji' | 'twse' | 'yahoo' | 'unknown';
export type QuoteStatus = 'ok' | 'stale' | 'timeout' | 'error' | 'unavailable';

/* ── 批次報價（POST /stocks/quotes）────────────────────────── */

export interface QuoteDTO {
  stockId:       string;
  name:          string;
  price:         number;       // quoteStatus !== 'ok' 時為 0
  change:        number;
  changePercent: number;       // 後端欄位名稱；對應前端 HoldingDTO.changePct
  high:          number;
  low:           number;
  volume:        number;
  marketStatus:  'TRADING' | 'CLOSED';
  updatedAt:     number;       // Unix timestamp（秒）
  quoteSource:   QuoteSource;
  quoteStatus:   QuoteStatus;
  quoteMessage:  string;       // 失敗說明；ok 時為空字串
}

/* ── 即時報價 ───────────────────────────────────────────────── */

export interface StockQuoteDTO {
  code:      string;
  name:      string;
  price:     number;
  open:      number;
  high:      number;
  low:       number;
  prevClose: number;
  change:    number;
  changePct: number;
  volume:    number;
  isUp:      boolean;
}

/* ── 歷史 K 線 ─────────────────────────────────────────────── */

export interface KLineDTO {
  date:   string;
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
}

/* ── 股票基礎數據 ──────────────────────────────────────────── */

export interface StockProfileDTO {
  // 識別
  stockId: string;
  name:    string | null;
  market:  string | null;

  // 評價指標
  peRatio:   number | null;   // 本益比（trailing）
  pbRatio:   number | null;   // 股價淨值比
  eps:       number | null;   // 每股盈餘（元）
  bookValue: number | null;   // 每股淨值（元）

  // 股利
  dividendYield:  number | null;  // 殖利率（%），如 2.35
  dividendRate:   number | null;  // 現金股利/股（元），如 16.0
  payoutRatio:    number | null;  // 配息率（%）
  exDividendDate: string | null;  // 除息日 "YYYY-MM-DD"

  // 獲利能力（直接為 % 數值，如 53.2 代表 53.2%）
  grossMargin:     number | null;
  operatingMargin: number | null;
  netMargin:       number | null;
  roe:             number | null;

  // 規模/成長
  marketCap:     number | null;  // 市值（元，原始整數）
  revenue:       number | null;  // 總營收（元，原始整數）
  revenueGrowth: number | null;  // YoY 成長率（%）

  // 風險/波動
  fiftyTwoWeekHigh: number | null;  // 52 週最高價
  fiftyTwoWeekLow:  number | null;  // 52 週最低價
  beta:             number | null;  // 相對大盤波動係數

  // 同步資訊（FinMind 最後同步時間，null 代表尚未同步）
  updatedAt: string | null;
}

export interface ChipDTO {
  date:    string;
  foreign: number;
  trust:   number;
  dealer:  number;
}

/* ── 交易紀錄 ───────────────────────────────────────────────── */

export type TransactionType = 'buy' | 'sell';

export interface TransactionDTO {
  id:          string;
  stockCode:   string;
  stockName:   string;
  type:        TransactionType;
  shares:      number;
  price:       number;
  fee:         number;
  date:        string;
  note?:       string;
  createdAt?:  string;
}

export interface CreateTransactionPayload {
  stockCode:  string;
  stockName:  string;
  type:       TransactionType;
  shares:     number;
  price:      number;
  fee:        number;
  date:       string;
  note?:      string;
}

/* ── 庫存持股 ───────────────────────────────────────────────── */

export interface HoldingTagDTO {
  id:          string;
  tagName:     string;
  weightRatio: number;
}

export interface AddHoldingTagPayload {
  tagName:     string;
  weightRatio: number;
}

export interface UpdateHoldingTagPayload {
  weightRatio: number;
}

export interface HoldingDTO {
  stockCode:      string;
  stockName:      string;
  shares:         number;
  costAvg:        number;
  totalCost:      number;
  currentPrice:   number;
  currentValue:   number;
  unrealizedProfit: number;
  returnPct:      number;
  change:         number;
  changePct:      number;
  isUp:           boolean;
  tags:           HoldingTagDTO[];
  quoteSource?:   QuoteSource;
  quoteStatus?:   QuoteStatus;
  quoteMessage?:  string;
}

export interface RecalculatePayload {
  holdings: Array<{
    stockCode:  string;
    shares:     number;
    costAvg:    number;
    totalCost:  number;
  }>;
}

/* ── 關注清單 ───────────────────────────────────────────────── */

export interface WatchlistItemDTO {
  id:           string;
  stockCode:    string;
  stockName:    string;
  targetPrice:  number;
  currentPrice: number;
  change:       number;
  changePct:    number;
  isUp:         boolean;
  signal:       'buy' | 'wait';
  note?:        string;
  quoteSource?:  QuoteSource;
  quoteStatus?:  QuoteStatus;
  quoteMessage?: string;
}

export interface CreateWatchlistPayload {
  stockCode:   string;
  stockName:   string;
  targetPrice: number;
  note?:       string;
}

/* ── 外幣資產（統一） ───────────────────────────────────────── */

export type ForeignAssetType = '活存' | '定存' | '債券';

export interface ForeignAssetDTO {
  id:            string;
  type:          ForeignAssetType;
  name:          string;
  currency:      string;
  amount:        number;
  interestRate:  number;
  maturityDate:  string | null;
  useManualRate: boolean;
  manualRate:    number;
  liveRate:      number | null;
  updatedAt:     string;
}

export interface CreateForeignAssetPayload {
  type:          ForeignAssetType;
  name:          string;
  currency:      string;
  amount:        number;
  interestRate:  number;
  maturityDate:  string | null;
  useManualRate: boolean;
  manualRate:    number;
}

/* ── 外幣（舊，保留相容） ──────────────────────────────────── */

export type CurrencyCode = 'USD' | 'JPY' | 'EUR' | 'CNY' | 'HKD' | 'GBP' | 'AUD' | 'SGD';

export interface ForeignCurrencyDTO {
  currencyCode:  CurrencyCode;
  amount:        number;
  useManualRate: boolean;
  manualRate:    number;
  liveRate:      number | null;
  twdValue:      number;
  updatedAt:     string;
}

export interface UpdateForeignCurrencyPayload {
  amount:        number;
  useManualRate: boolean;
  manualRate:    number;
}

export interface ForexRatesDTO {
  rates:     Record<string, number>;
  updatedAt: string;
}

/* ── 債券 ──────────────────────────────────────────────────── */

export interface BondDTO {
  id:           string;
  name:         string;
  couponRate:   number;   // raw decimal：0.045 = 4.5%
  maturityDate: string;
  currency:     string;
  faceValue:    number;
  note?:        string;
  twdEstimate:  number;
}

export interface CreateBondPayload {
  name:         string;
  couponRate:   number;   // raw decimal
  maturityDate: string;
  currency:     string;
  faceValue:    number;
  note?:        string;
}

/* ── 投報計畫 ───────────────────────────────────────────────── */

export type InflationScenario = 'low' | 'base' | 'high';

/* 景氣係數：red=0.85 yellow-red=0.95 green=1.00 yellow-blue=1.05 blue=1.10 */
export type KRiskLevel = 'red' | 'yellow-red' | 'green' | 'yellow-blue' | 'blue';

export interface PlanConfigDTO {
  annualInvest:        number;
  rBase:               number;           // raw decimal，0.08 = 8%
  inflation:           InflationScenario;
  kRisk:               number;           // numeric（0.85 / 0.95 / 1.00 / 1.05 / 1.10）
  startYear:           number;
  overrides:           Record<string, number>; // { "1": 150000 } yearIndex→ 計畫投入
  currentYearReinvest: number;
}

/* 統一試算 Table 每行（純前端計算產出）*/
export interface PlanRow {
  yearIndex:    number;
  calendarYear: number;
  isMilestone:  boolean;       // 10/15/20/30 年

  /* 計畫側 */
  planCapital:       number;
  planInvest:        number;
  expectedProfit:    number;   // (planCapital + planInvest) × rNominal
  expectedTotal:     number;
  expectedTotalReal: number;   // 購買力折現

  /* 執行側 */
  status:      'past' | 'current' | 'future';
  execCapital: number | null;
  reinvest:    number | null;
  stockValue:  number | null;
  forexValue:  number | null;
  cashBalance: number | null;
  returnValue: number | null;  // 總資產 − (execCapital + reinvest)
  returnPct:   number | null;  // 總資產 / (execCapital + reinvest) − 1
}

/* ── 年度結算 ───────────────────────────────────────────────── */

export interface YearlyRecordDTO {
  id:           string;
  year:         number;
  prevTotal:    number;
  invested:     number;
  stockValue:   number;
  cashBalance:  number;
  forexValue:   number;
  returnRate:   number;
  settledAt:    string;
  note?:        string;
}

export interface CreateYearlyRecordPayload {
  year:        number;
  prevTotal:   number;
  invested:    number;
  stockValue:  number;
  cashBalance: number;
  forexValue:  number;
  settledAt:   string;
  note?:       string;
}

/* ── 每日快照 ───────────────────────────────────────────────── */

export interface SnapshotHoldingDTO {
  stockCode:        string;
  stockName:        string;
  shares:           number;
  costAvg:          number;
  currentPrice:     number;
  currentValue:     number;
  unrealizedProfit: number;
}

export interface DailySnapshotDTO {
  date:             string;
  execCapital:      number;
  reinvest:         number;
  stockValue:       number;
  cashBalance:      number;
  forexValue:       number;
  unrealizedProfit: number;
  note?:            string;
  recordedAt?:      string;
  holdings?:        SnapshotHoldingDTO[];
  vix?:             number | null;
  marketStateAuto?: MarketState | null;
}

export interface UpdateSnapshotPayload {
  cashBalance?: number;
  note?:        string;
}

export interface StockDailyPoint {
  date:  string;
  close: number;
}

export interface StockComparisonItem {
  stockId: string;
  name:    string;
  data:    StockDailyPoint[];
}

/* ── Tag ────────────────────────────────────────────────────── */

export type FallbackBehavior = 'hold' | 'exclude';

export type MarketState = 'neutral' | 'risk-on' | 'risk-off' | 'liquidity-dry';

export type TriggerDirection = 'both' | 'upper_only' | 'lower_only';

export interface TagDTO {
  id:               string;
  name:             string;
  baseRisk:         number;
  dynamicRisk:      number;
  targetWeight:     number | null;
  fallbackBehavior: FallbackBehavior;
  triggerDirection: TriggerDirection;
  marketStatePresets?: {
    riskOn:       number;
    riskOff:      number;
    liquidityDry: number;
  };
}

export interface CreateTagPayload {
  name:              string;
  baseRisk:          number;
  targetWeight?:     number | null;
  fallbackBehavior?: FallbackBehavior;
  triggerDirection?: TriggerDirection;
  marketStatePresets?: {
    riskOn?:       number;
    riskOff?:      number;
    liquidityDry?: number;
  } | null;
}

export type UpdateTagPayload = Partial<CreateTagPayload>;

export interface CorrelationEntry {
  tagA: string;
  tagB: string;
  rho:  number;
}

export interface TagCorrelationMatrix {
  lastUpdated:      string;
  entries:          CorrelationEntry[];
  previousEntries?: CorrelationEntry[];
}

/* ── 風險模型（Phase 2）────────────────────────────────────── */

export interface TagStat {
  tagName:          string;
  baseRisk:         number;
  targetWeight:     number | null;
  fallbackBehavior: FallbackBehavior;
  actualWeight:     number;   /* 當前配置%（0~100） */
  delta:            number;   /* 偏差 = actual - target（null target 時為 0） */
  triggered:        boolean;  /* |delta| > observeBand（進入觀察區） */
  inTradeZone:      boolean;  /* |delta| > tradeBand（進入交易區，觸發再平衡）*/
  chartColor:       string;
}

export interface OverlappingTagGroup {
  stockCodes:              string[];
  tagNames:                string[];
  combinedWeight:          number;  /* 群組合計持股市值 / totalAsset（0~1） */
  isConcentrationBreached: boolean; /* combinedWeight > concentrationLimit */
}

/* ── Asset-Tag ──────────────────────────────────────────────── */

export interface AssetTagDTO {
  id:          string;
  stockCode:   string;
  stockName:   string | null;
  tagName:     string;
  weightRatio: number;
}

export interface CreateAssetTagPayload {
  stockCode:   string;
  tagName:     string;
  weightRatio: number;
}

export interface UpdateAssetTagPayload {
  weightRatio: number;
}

/* ── 使用者設定 ────────────────────────────────────────────── */

export type CostMethod = 'profit-return' | 'cost-retain';

export interface SettingsDTO {
  costMethod:       CostMethod;
  defaultCurrency?: string;
  startYear?:       number;
}

/* ── 使用者偏好設定 ──────────────────────────────────────────── */

export type ExpandTab = 'kline' | 'chip' | 'tx' | 'tags';

export interface ChartPreferences {
  showK:      boolean;
  showMA5:    boolean;
  showMA20:   boolean;
  showMA60:   boolean;
  showVolume: boolean;
  zoomLock:   boolean;
}

export interface UserPreferences {
  chart:     ChartPreferences;
  expandTab: ExpandTab;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  chart:     { showK: true, showMA5: true, showMA20: true, showMA60: true, showVolume: true, zoomLock: false },
  expandTab: 'kline' as ExpandTab,
};

/* ── 再平衡規則（Phase 3）───────────────────────────────────── */

export interface RebalanceRulesDTO {
  baseThreshold:     number;
  liquidityCapRatio: number;
  advLookbackDays:   number; /* ADV 計算天數，預設 20 */
  concentrationLimit: number; /* 同質 Tag 集中度上限（小數），預設 0.70 */
}

/* ── 再平衡決策層（Phase 3）────────────────────────────────── */

export type RebalanceAction = 'buy' | 'sell' | 'hold';

export interface RebalanceSuggestion {
  stockCode:          string;
  stockName:          string;
  action:             RebalanceAction;
  shares:             number;
  estimatedAmount:    number;
  isLiquidityLimited: boolean;
  estimatedCost?:     number;  /* 估算手續費 + 證交稅（TWD）*/
  efficiencyLabel?:   '建議交易' | '可觀察' | '效益不足';
}

/* ── 下行風險模型結果 ───────────────────────────────────────── */

export interface MddResult {
  currentDrawdown: number;       /* 目前距高點跌幅，如 -0.032 */
  maxDrawdown:     number;       /* 歷史最大回撤（最負值），如 -0.152 */
  peakDate:        string;       /* 歷史高點日期 */
  troughDate:      string;       /* 最大回撤低點日期 */
  recoveryDays:    number | null;/* 從低點回到前高所需天數，null=未回到 */
  isRecovered:     boolean;
}

export interface VarCVarResult {
  var95Pct:     number;  /* 95% 信心水準下的單日損失百分比（負值） */
  var95Amount:  number;  /* 對應 TWD 金額損失 */
  cvar95Pct:    number;  /* 最差 5% 日子的平均損失百分比（負值） */
  cvar95Amount: number;  /* 對應 TWD 金額損失 */
  sampleDays:   number;
}

/* ── 計畫目標追蹤（Phase B）────────────────────────────────── */

export interface PlanGoalResult {
  /* B2：今年進度 */
  progressRatio:  number;                          /* current / expectedToday */
  gapAmount:      number;                          /* current - expectedToday（TWD）*/
  progressStatus: 'ahead' | 'on-track' | 'behind';
  /* B3：30年所需報酬 */
  requiredReturn: number;                          /* 年化報酬（decimal）*/
  yearsRemaining: number;
  isAchievable:   boolean;                         /* requiredReturn <= rNominal */
  /* Tooltip 計算明細 */
  startValue:     number;                          /* 去年 12/31 實際資產（B2 起始點）*/
  expectedToday:  number;                          /* 今日計畫期望值（線性插值）*/
  currentValue:   number;                          /* 今日實際資產 */
  elapsedPct:     number;                          /* 今年已過百分比（0–100）*/
  elapsedDays:    number;                          /* 今年已過天數 */
  yearTarget:     number;                          /* 今年計畫年末目標 */
  targetValue:    number;                          /* 第 30 年計畫目標 */
  rNominal:       number;                          /* rBase × kRisk */
}

export interface RebalanceSnapshot {
  id:        string;
  createdAt: string;
  params: {
    totalAsset:        number;
    baseThreshold:     number;
    liquidityCapRatio: number;
    marketState:       MarketState;
  };
  suggestions: RebalanceSuggestion[];
}

/* ── 情境分析（Phase C）────────────────────────────────────── */

export interface IndexKBar {
  timestamp: number;
  open:      number;
  high:      number;
  low:       number;
  close:     number;
  volume:    number;
}

export type BetaStatus = 'insufficient' | 'reference' | 'display' | 'reliable';

export interface PortfolioBetaResult {
  realizedBeta: number;
  alpha:        number;   /* 年化截距（daily alpha × 252） */
  rSquared:     number;
  sampleDays:   number;
  status:       BetaStatus;
}

export interface StressScenario {
  id:                  string;
  name:                string;
  estimatedReturnPct:  number;   /* 負值，如 -0.083 */
  estimatedLossAmount: number;   /* TWD 金額（正數） */
}

/* ── AI 交易策略（F01）───────────────────────────────────────── */

export type TradeType =
  | 'entry' | 'add' | 'reduce' | 'exit'
  | 'stop_loss' | 'take_profit' | 'watch';

export type StrategyConfidence = 'high' | 'medium' | 'low';
export type StrategyTimeframe  = 'short' | 'medium' | 'long';

/**
 * 策略生命週期狀態。
 * - 新資料（M13）：後端維護並回傳，前端直接使用。
 * - 舊資料（只有 triggerPrice）：後端僅能回傳 'active'/'expired'/'dismissed'，
 *   'triggered' 由前端 resolveStrategyStatus() 補算。
 */
export type StrategyStatus = 'active' | 'triggered' | 'expired' | 'dismissed';

// ── 觸發規則 ──────────────────────────────────────────────────

export type TriggerRuleType =
  | 'price_in_range'   // 現價落在 priceLow ~ priceHigh（與 tranche 自動連動）
  | 'price_above'      // 現價 > value
  | 'price_below'      // 現價 < value
  | 'price_above_ma'   // 現價 > MA(period)，前端即時評估
  | 'chip_dealer_buy'  // 自營商淨買 > 0，連續 period 日，後端每日評估
  | 'chip_foreign_buy' // 外資淨買 > 0，連續 period 日，後端每日評估
  | 'chip_trust_buy'   // 投信淨買 > 0，連續 period 日，後端每日評估
  | 'manual';          // 宏觀事件，使用者手動確認，永遠 null

export interface TriggerRule {
  type:    TriggerRuleType;
  value?:  number;   // price_above / price_below 使用
  period?: number;   // MA 週期（5/20/60）或籌碼連續天數
}

// ── 批次腳本 ──────────────────────────────────────────────────

export type TrancheStatus = 'pending' | 'triggered' | 'skipped' | 'waiting';

export interface StrategyTranche {
  batch:            number;
  priceLow:         number;
  priceHigh:        number;
  sizeRatio:        number;           // 佔總部位比例 0.0–1.0
  shares:           number;           // AI 建議股數（entry/add=買進；reduce/exit=賣出）
  triggerCondition: string;
  triggerRules?:    TriggerRule[];
  /** 後端每日評估結果，key 格式由 ruleKey() 決定；只含 chip_* 類，price 類由前端即時計算 */
  ruleStatuses?:    Record<string, boolean | null>;
  status:           TrancheStatus;
}

// ── 主 DTO ────────────────────────────────────────────────────

export interface TradingStrategyDTO {
  // 識別
  stockCode:      string;
  stockName:      string;
  createdAt:      string;
  expiresAt?:     string;
  // 定性
  tradeType:      TradeType;
  timeframe:      StrategyTimeframe;
  confidence:     StrategyConfidence;
  referencePrice: number;
  // 多批次進場（新）；後端 fallback 補值，舊資料可能為空陣列
  tranches:               StrategyTranche[];
  // 風控（舊資料可能為 null，後端未完成回填時的向後相容）
  stopLossPrice:          number | null;
  targetPriceLow:         number | null;
  targetPriceHigh:        number | null;
  riskRewardRatio:        number | null;
  // 條件
  triggerCondition:       string;
  invalidationCondition:  string;
  summary:                string;
  // 狀態
  status:                 StrategyStatus;
  dismissed:              boolean;
  // 舊欄位（deprecated，向後相容）
  triggerPrice?:          number;
  targetPrice?:           number;
}
