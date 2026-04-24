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
  code:        string;
  name:        string;
  industry?:   string;
  eps?:        number;
  pe?:         number;
  pb?:         number;
  dividendYield?: number;
  marketCap?:  number;
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

/* ── 外幣 ──────────────────────────────────────────────────── */

export type CurrencyCode = 'USD' | 'JPY' | 'EUR' | 'CNY' | 'HKD' | 'GBP' | 'AUD' | 'SGD';

export interface ForeignCurrencyDTO {
  currency: CurrencyCode;
  amount:   number;
}

export interface ForexRatesDTO {
  rates:     Record<string, number>;
  updatedAt: string;
}

/* ── 債券 ──────────────────────────────────────────────────── */

export interface BondDTO {
  id:           string;
  name:         string;
  couponRate:   number;
  maturityDate: string;
  currency:     string;
  faceValue:    number;
  note?:        string;
}

export interface CreateBondPayload {
  name:         string;
  couponRate:   number;
  maturityDate: string;
  currency:     string;
  faceValue:    number;
  note?:        string;
}

/* ── 投報計畫 ───────────────────────────────────────────────── */

export type InflationScenario = 'low' | 'base' | 'high';
export type KRiskLevel = 'red' | 'yellow-red' | 'green' | 'yellow-blue' | 'blue';

export interface InvestmentPlanDTO {
  annualInvest:      number;
  rBase:             number;
  inflationScenario: InflationScenario;
  kRisk:             KRiskLevel;
  startYear:         number;
  planYears:         number;
}

/* MARC 複利試算表單列（前端計算產出）*/
export interface MARCRow {
  year:           number;
  calendarYear:   number;
  capitalInvested: number;
  interest:       number;
  totalNominal:   number;
  totalReal:      number;
  rNominal:       number;
  rReal:          number;
  isMilestone:    boolean;
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
