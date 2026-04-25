import api from '../api/axios';
import type { ApiResponse, ForeignAssetDTO, CreateForeignAssetPayload } from '../types';

export async function fetchForeignAssets(): Promise<ForeignAssetDTO[]> {
  const res = await api.get<ApiResponse<ForeignAssetDTO[]>>('/foreign-assets');
  return res.data.data;
}

export async function createForeignAsset(payload: CreateForeignAssetPayload): Promise<ForeignAssetDTO> {
  const res = await api.post<ApiResponse<ForeignAssetDTO>>('/foreign-assets', payload);
  return res.data.data;
}

export async function updateForeignAsset(
  id: string,
  payload: Partial<CreateForeignAssetPayload>,
): Promise<ForeignAssetDTO> {
  const res = await api.put<ApiResponse<ForeignAssetDTO>>(`/foreign-assets/${id}`, payload);
  return res.data.data;
}

export async function deleteForeignAsset(id: string): Promise<void> {
  await api.delete(`/foreign-assets/${id}`);
}
