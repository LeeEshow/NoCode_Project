import api from '../api/axios';
import type { ApiResponse, RebalanceRulesDTO } from '../types';

export async function fetchRebalanceRules(): Promise<RebalanceRulesDTO> {
  const res = await api.get<ApiResponse<RebalanceRulesDTO>>('/rebalance-rules');
  return res.data.data;
}

export async function saveRebalanceRules(payload: RebalanceRulesDTO): Promise<void> {
  await api.put('/rebalance-rules', payload);
}
