import api from '../api/axios';
import type { ApiResponse, SettingsDTO } from '../types';

export async function fetchSettings(): Promise<SettingsDTO> {
  const res = await api.get<ApiResponse<SettingsDTO>>('/settings');
  return res.data.data;
}

export async function updateSettings(patch: Partial<SettingsDTO>): Promise<SettingsDTO> {
  const res = await api.put<ApiResponse<SettingsDTO>>('/settings', patch);
  return res.data.data;
}
