import api from '../api/axios';
import type { ApiResponse } from '../types';

export interface StockListMeta {
  count:     number;
  updatedAt: string | null;
}

export async function fetchStockListMeta(): Promise<StockListMeta> {
  const res = await api.get<ApiResponse<StockListMeta>>('/stocks/list/meta');
  return res.data.data;
}

export async function triggerStockListRefresh(): Promise<StockListMeta> {
  const res = await api.post<ApiResponse<StockListMeta>>('/stocks/list/refresh');
  return res.data.data;
}
