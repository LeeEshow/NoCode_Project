import api from '../api/axios';
import type { ApiResponse, HoldingDTO, HoldingTagDTO, KLineDTO, StockProfileDTO, StockSearchResultDTO, ChipDTO, QuoteSource, QuoteStatus, StockDailyPoint } from '../types';

/* ── 後端原始型別 ── */
interface RawHolding {
  stockId:        string;
  stockName?:     string;
  sharesHeld:     number;
  avgCost:        number;
  totalCost:      number;
  realizedProfit: number;
  costMethod:     string;
  updatedAt:      string;
  currentPrice?:  number;
  change?:        number;
  changePercent?: number;
  tags?:          HoldingTagDTO[];
  quoteSource?:   string;
  quoteStatus?:   string;
  quoteMessage?:  string;
}

interface RawHistoryPoint {
  timestamp: number;
  open:      number;
  high:      number;
  low:       number;
  close:     number;
  volume:    number;
}

interface RawProfile {
  // 識別
  stockId: string;
  name:    string | null;
  market:  string | null;

  // 評價指標
  peRatio:   number | null;
  pbRatio:   number | null;
  eps:       number | null;
  bookValue: number | null;

  // 股利
  dividendYield:  number | null;
  dividendRate:   number | null;
  payoutRatio:    number | null;
  exDividendDate: string | null;

  // 獲利能力
  grossMargin:     number | null;
  operatingMargin: number | null;
  netMargin:       number | null;
  roe:             number | null;

  // 規模/成長
  marketCap:     number | null;
  revenue:       number | null;
  revenueGrowth: number | null;

  // 風險/波動
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow:  number | null;
  beta:             number | null;

  // 同步資訊
  updatedAt: string | null;
}

interface RawSearchResult {
  stockId: string;
  name:    string;
  market:  string;
}

/* ── 轉換函式 ── */
function toHoldingDTO(raw: RawHolding): HoldingDTO {
  const shares         = raw.sharesHeld      ?? 0;
  const costAvg        = raw.avgCost         ?? 0;
  const totalCost      = raw.totalCost       ?? 0;
  const currentPrice   = raw.currentPrice    ?? 0;
  const change         = raw.change          ?? 0;
  const changePct      = raw.changePercent   ?? 0;
  const currentValue     = currentPrice * shares;
  const unrealizedProfit = currentValue - totalCost;
  /* 損益% 用每股報酬率，避免前端 shares 單位（張 vs 股）與 totalCost 不一致造成誤差 */
  const returnPct        = costAvg > 0 ? ((currentPrice - costAvg) / costAvg) * 100 : 0;

  return {
    stockCode:       raw.stockId,
    stockName:       raw.stockName ?? raw.stockId,
    shares,
    costAvg,
    totalCost,
    currentPrice,
    currentValue,
    unrealizedProfit,
    returnPct,
    change,
    changePct,
    isUp: changePct > 0,
    tags:            raw.tags ?? [],
    quoteSource:     raw.quoteSource  as QuoteSource | undefined,
    quoteStatus:     raw.quoteStatus  as QuoteStatus | undefined,
    quoteMessage:    raw.quoteMessage,
  };
}

/* ── API 呼叫 ── */

export async function fetchHoldings(): Promise<HoldingDTO[]> {
  const res = await api.get<ApiResponse<RawHolding[]>>('/holdings');
  return res.data.data.map(toHoldingDTO);
}

export async function fetchSparklineData(stockId: string, days = 90): Promise<number[]> {
  const res = await api.get<ApiResponse<RawHistoryPoint[]>>(`/stocks/${stockId}/history`, {
    params: { days },
  });
  return res.data.data.map(p => p.close);
}

export async function fetchKLine(stockId: string): Promise<KLineDTO[]> {
  const res = await api.get<ApiResponse<RawHistoryPoint[]>>(`/stocks/${stockId}/history`, {
    params: { days: 180 },
  });
  return res.data.data.map(p => ({
    date:   new Date(p.timestamp * 1000).toISOString().slice(0, 10),
    open:   p.open,
    high:   p.high,
    low:    p.low,
    close:  p.close,
    volume: p.volume,
  }));
}

export async function fetchStockProfile(stockId: string): Promise<StockProfileDTO> {
  const res = await api.get<ApiResponse<RawProfile>>(`/stocks/${stockId}/profile`);
  const r = res.data.data;
  return {
    // 識別
    stockId: r.stockId,
    name:    r.name,
    market:  r.market,

    // 評價指標
    peRatio:   r.peRatio,
    pbRatio:   r.pbRatio,
    eps:       r.eps,
    bookValue: r.bookValue,

    // 股利
    dividendYield:  r.dividendYield,
    dividendRate:   r.dividendRate,
    payoutRatio:    r.payoutRatio,
    exDividendDate: r.exDividendDate,

    // 獲利能力
    grossMargin:     r.grossMargin,
    operatingMargin: r.operatingMargin,
    netMargin:       r.netMargin,
    roe:             r.roe,

    // 規模/成長
    marketCap:     r.marketCap,
    revenue:       r.revenue,
    revenueGrowth: r.revenueGrowth,

    // 風險/波動
    fiftyTwoWeekHigh: r.fiftyTwoWeekHigh,
    fiftyTwoWeekLow:  r.fiftyTwoWeekLow,
    beta:             r.beta,

    // 同步資訊
    updatedAt: r.updatedAt,
  };
}

export async function fetchChipData(stockId: string): Promise<ChipDTO[]> {
  const res = await api.get<ApiResponse<ChipDTO[]>>(`/stocks/${stockId}/chip`);
  return res.data.data;
}

export async function searchStocks(q: string): Promise<StockSearchResultDTO[]> {
  const res = await api.get<ApiResponse<RawSearchResult[]>>('/stocks/search', { params: { q } });
  return res.data.data.map(r => ({ code: r.stockId, name: r.name }));
}

export async function recalculateHoldings(
  holdings: Array<{ stockCode: string; shares: number; costAvg: number; totalCost: number }>
): Promise<void> {
  const payload = holdings.map(h => ({
    stockId:        h.stockCode,
    sharesHeld:     h.shares,
    avgCost:        h.costAvg,
    totalCost:      h.totalCost,
    realizedProfit: 0,
    costMethod:     'profit-return',
  }));
  await api.post('/holdings/recalculate', payload);
}

export async function fetchStockInfo(stockId: string): Promise<{ stockId: string; name: string } | null> {
  const res = await api.get<ApiResponse<RawSearchResult[]>>('/stocks/search', { params: { q: stockId } });
  return res.data.data.find(r => r.stockId === stockId) ?? null;
}

export async function fetchStockDailyHistory(stockId: string, start: string, end: string): Promise<StockDailyPoint[]> {
  const res = await api.get<ApiResponse<RawHistoryPoint[]>>(
    `/stocks/${stockId}/history`,
    { params: { start, end } },
  );
  return res.data.data.map(p => ({
    date:  new Date(p.timestamp * 1000).toISOString().slice(0, 10),
    close: p.close,
  }));
}

export async function reorderHoldings(order: string[]): Promise<void> {
  await api.put('/holdings/reorder', { order });
}

export interface HoldingPriceDTO {
  stockCode:        string;
  currentPrice:     number;
  change:           number;
  changePct:        number;
  unrealizedProfit: number;
  quoteSource?:     string;
  quoteStatus?:     string;
  quoteMessage?:    string;
}

export async function fetchHoldingPrices(): Promise<HoldingPriceDTO[]> {
  const res = await api.get<ApiResponse<HoldingPriceDTO[]>>('/holdings/prices');
  return res.data.data;
}
