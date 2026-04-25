import api from '../api/axios';
import type { ApiResponse, PlanConfigDTO } from '../types';

const DEFAULT_CONFIG: PlanConfigDTO = {
  annualInvest:        300_000,
  rBase:               0.08,
  inflation:           'base',
  kRisk:               1.00,
  startYear:           new Date().getFullYear(),
  overrides:           {},
  currentYearReinvest: 0,
};

export async function fetchPlanConfig(): Promise<PlanConfigDTO> {
  try {
    const res = await api.get<ApiResponse<PlanConfigDTO>>('/plan/config');
    return res.data.data;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function savePlanConfig(payload: PlanConfigDTO): Promise<PlanConfigDTO> {
  const res = await api.put<ApiResponse<PlanConfigDTO>>('/plan/config', payload);
  return res.data.data;
}
