import axios from 'axios';
import { nodeCache } from './cache';
import type { StockQuote, StockHistoryPoint, StockSearchResult } from '../models/Stock';
import type { IndexCard } from '../models/MarketIndex';

const client = axios.create({
  baseURL: process.env['SHIOAJI_API_URL'] ?? 'http://localhost:8000',
  timeout: 5000,
});

/** 從 NodeCache 查股票名稱（不觸發任何 fetch） */
function peekStockName(stockId: string): string {
  const list = nodeCache.get<StockSearchResult[]>('stocks:all-list');
  return list?.find(s => s.stockId === stockId)?.name ?? stockId;
}

/** GET /quote/{stock_id} → StockQuote */
export async function sjGetStockQuote(stockId: string): Promise<StockQuote> {
  const { data } = await client.get<{
    code: string; price: number; open: number; high: number; low: number;
    volume: number; change: number | null; change_percent: number | null; timestamp: string;
  }>(`/quote/${stockId}`);

  return {
    stockId,
    name:          peekStockName(stockId),
    price:         data.price,
    change:        data.change        ?? 0,
    changePercent: data.change_percent ?? 0,
    high:          data.high,
    low:           data.low,
    volume:        data.volume,
    marketStatus:  'OPEN',
    updatedAt:     Math.floor(new Date(data.timestamp).getTime() / 1000),
  };
}

/** GET /kline/{stock_id}?interval=1D&days=N → StockHistoryPoint[] */
export async function sjGetStockHistory(
  stockId: string,
  days: number
): Promise<StockHistoryPoint[]> {
  const { data } = await client.get<{
    data: Array<{ ts: string; open: number; high: number; low: number; close: number; volume: number }>;
  }>(`/kline/${stockId}`, { params: { interval: '1D', days } });

  return data.data.map(bar => ({
    timestamp: Math.floor(new Date(bar.ts).getTime() / 1000),
    open:      bar.open,
    high:      bar.high,
    low:       bar.low,
    close:     bar.close,
    volume:    bar.volume,
  }));
}

/** GET /index/taiex + /index/futures → { twii, futures } */
export async function sjGetTwIndices(): Promise<{ twii: IndexCard; futures: IndexCard }> {
  const [taiexRes, futuresRes] = await Promise.all([
    client.get<{ price: number; change: number | null; change_percent: number | null }>('/index/taiex'),
    client.get<{ price: number; change: number | null; change_percent: number | null }>('/index/futures'),
  ]);

  return {
    twii: {
      id: 'twii', name: '台股大盤',
      price:         taiexRes.data.price,
      change:        taiexRes.data.change        ?? null,
      changePercent: taiexRes.data.change_percent ?? null,
    },
    futures: {
      id: 'futures', name: '台指期',
      price:         futuresRes.data.price,
      change:        futuresRes.data.change        ?? null,
      changePercent: futuresRes.data.change_percent ?? null,
    },
  };
}

/** GET /health → 健康狀態 */
export async function sjHealth(): Promise<{ status: string; connected: boolean }> {
  const { data } = await client.get('/health');
  return data;
}
