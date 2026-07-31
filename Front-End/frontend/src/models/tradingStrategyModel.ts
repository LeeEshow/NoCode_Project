import api from '../api/axios';
import type { ApiResponse, TradingStrategyDTO, StrategyAction, StrategyPriority } from '../types';

export async function getAll(): Promise<TradingStrategyDTO[]> {
  const res = await api.get<ApiResponse<TradingStrategyDTO[]>>('/trading-strategies');
  return res.data.data;
}

export async function getOne(stockCode: string): Promise<TradingStrategyDTO | null> {
  const res = await api.get<ApiResponse<TradingStrategyDTO | null>>(`/trading-strategies/${stockCode}`);
  return res.data.data;
}

export async function upsert(
  stockCode:      string,
  stockName:      string,
  action:         StrategyAction,
  targetQuantity: number,
  priority:       StrategyPriority = 'normal',
  notes:          string           = '',
): Promise<TradingStrategyDTO> {
  const res = await api.put<ApiResponse<TradingStrategyDTO>>(
    `/trading-strategies/${stockCode}`,
    { action, target_quantity: targetQuantity, stock_name: stockName, priority, notes },
  );
  return res.data.data;
}

export async function remove(stockCode: string): Promise<void> {
  await api.delete(`/trading-strategies/${stockCode}`);
}
