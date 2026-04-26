import api from '../api/axios';
import type { ApiResponse, UserPreferences } from '../types';

export async function fetchPreferences(): Promise<UserPreferences> {
  const res = await api.get<ApiResponse<UserPreferences>>('/preferences');
  return res.data.data;
}

export async function updatePreferences(patch: Partial<UserPreferences>): Promise<UserPreferences> {
  const res = await api.put<ApiResponse<UserPreferences>>('/preferences', patch);
  return res.data.data;
}
