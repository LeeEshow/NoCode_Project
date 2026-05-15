import api from '../api/axios';
import type { ApiResponse, RebalanceSnapshot, RebalanceSuggestion, MarketState } from '../types';

export async function fetchSnapshots(limit = 10): Promise<RebalanceSnapshot[]> {
  const res = await api.get<ApiResponse<RebalanceSnapshot[]>>('/rebalance-snapshots', {
    params: { limit },
  });
  return res.data.data;
}

export async function saveSnapshot(payload: {
  params: {
    totalAsset:        number;
    baseThreshold:     number;
    liquidityCapRatio: number;
    marketState:       MarketState;
  };
  suggestions: RebalanceSuggestion[];
}): Promise<RebalanceSnapshot> {
  const res = await api.post<ApiResponse<RebalanceSnapshot>>('/rebalance-snapshots', payload);
  return res.data.data;
}
