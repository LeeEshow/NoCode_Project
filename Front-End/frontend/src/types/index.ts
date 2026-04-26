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

export interface ExportIndicatorDTO {
  month:   string;
  score:   number;
  light:   'red' | 'yellow-red' | 'green' | 'yellow-blue' | 'blue';
  label:   string;
}

export interface MarketDataDTO {
  indices:         MarketIndexDTO[];
  exportIndicator: ExportIndicatorDTO | null;
}

/* ── 股票搜尋 ───────────────────────────────────────────────── */

export interface StockSearchResultDTO {
  code: string;
  name: string;
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
  code:          string;
  name:          string;
  industry?:     string;
  eps?:          number;
  pe?:           number;
  pb?:           number;
  dividendYield?: number;
  marketCap?:    number;
  revenue?:      number;
  grossMargin?:  number;
  roe?:          number;
  roa?:          number;
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

export interface DailySnapshotDTO {
  date:             string;
  totalInvested:    number;
  stockValue:       number;
  cashBalance:      number;
  forexValue:       number;
  unrealizedProfit: number;
  realizedProfit:   number;
  returnRate:       number;
  note?:            string;
}

export interface UpdateSnapshotPayload {
  cashBalance?: number;
  note?:        string;
}

/* ── 使用者設定 ────────────────────────────────────────────── */

export type CostMethod = 'profit-return' | 'cost-retain';

export interface SettingsDTO {
  costMethod:       CostMethod;
  defaultCurrency?: string;
  startYear?:       number;
}

/* ── 使用者偏好設定 ──────────────────────────────────────────── */

export type ExpandTab = 'kline' | 'chip';

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
