import api from '../api/axios';
import type { ApiResponse, HoldingDTO, KLineDTO, StockProfileDTO, StockSearchResultDTO } from '../types';

/* ── 後端原始型別 ── */
interface RawHolding {
  stockId:        string;
  sharesHeld:     number;
  avgCost:        number;
  totalCost:      number;
  realizedProfit: number;
  costMethod:     string;
  updatedAt:      string;
  currentPrice?:  number;
  change?:        number;
  changePercent?: number;
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
  stockId:           string;
  name:              string;
  market:            string;
  peRatio:           number | null;
  dividendYield:     number | null;
  fiftyTwoWeekHigh:  number;
  fiftyTwoWeekLow:   number;
  marketCap:         number | null;
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
    stockName:       raw.stockId,   // 後端 holdings 不含名稱，以代號顯示
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
    code:          r.stockId,
    name:          r.name,
    pe:            r.peRatio         ?? undefined,
    dividendYield: r.dividendYield   ?? undefined,
    marketCap:     r.marketCap       ?? undefined,
  };
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
