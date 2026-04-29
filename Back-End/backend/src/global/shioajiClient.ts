import axios from 'axios';
import type { StockSearchResult, StockQuote, StockHistoryPoint } from '../models/Stock';
import type { IndexCard } from '../models/MarketIndex';

const sjClient = axios.create({
  baseURL: process.env['SHIOAJI_SERVICE_URL'] ?? 'http://localhost:8000',
  timeout: 30_000,
});

export const sjGetAllStocks = async (): Promise<StockSearchResult[]> => {
  const res = await sjClient.get<StockSearchResult[]>('/stocks');
  return res.data;
};

export const sjGetSnapshot = async (stockId: string): Promise<StockQuote> => {
  const res = await sjClient.get<StockQuote>(`/stocks/${encodeURIComponent(stockId)}/snapshot`);
  return res.data;
};

export const sjGetKbars = async (
  stockId: string,
  days: number
): Promise<StockHistoryPoint[]> => {
  const res = await sjClient.get<StockHistoryPoint[]>(
    `/stocks/${encodeURIComponent(stockId)}/kbars`,
    { params: { days } }
  );
  return res.data;
};

export const sjGetTwii = async (): Promise<IndexCard> => {
  const res = await sjClient.get<IndexCard>('/market/twii');
  return res.data;
};

export const sjGetFutures = async (): Promise<IndexCard> => {
  const res = await sjClient.get<IndexCard>('/market/futures');
  return res.data;
};
