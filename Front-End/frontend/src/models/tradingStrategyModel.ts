import api from '../api/axios';
import type { ApiResponse, TradingStrategyDTO } from '../types';

export async function addTrancheExecution(
  stockCode:      string,
  batch:          number,
  executedPrice:  number,
  executedShares: number,
  transactionId?: string,
  executedAt?:    string,
): Promise<TradingStrategyDTO> {
  const res = await api.post<ApiResponse<TradingStrategyDTO>>(
    `/trading-strategies/${stockCode}/tranches/${batch}/executions`,
    {
      executedPrice,
      executedShares,
      ...(transactionId != null ? { transactionId } : {}),
      ...(executedAt    != null ? { executedAt }    : {}),
    },
  );
  return res.data.data;
}

export async function getAll(): Promise<TradingStrategyDTO[]> {
  const res = await api.get<ApiResponse<TradingStrategyDTO[]>>('/trading-strategies');
  return res.data.data;
}

export async function getOne(stockCode: string): Promise<TradingStrategyDTO | null> {
  const res = await api.get<ApiResponse<TradingStrategyDTO | null>>(`/trading-strategies/${stockCode}`);
  return res.data.data;
}

export async function dismiss(stockCode: string): Promise<void> {
  await api.patch(`/trading-strategies/${stockCode}/dismiss`);
}

export async function remove(stockCode: string): Promise<void> {
  await api.delete(`/trading-strategies/${stockCode}`);
}

export async function updateRuleStatus(
  stockCode: string,
  batch: number,
  ruleType: string,
  confirmed: boolean,
): Promise<void> {
  await api.patch(`/trading-strategies/${stockCode}/rule-status`, { batch, ruleType, confirmed });
}
