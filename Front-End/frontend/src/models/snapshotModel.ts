import api from '../api/axios';
import type { ApiResponse, DailySnapshotDTO, UpdateSnapshotPayload } from '../types';

export async function fetchSnapshots(year?: number): Promise<DailySnapshotDTO[]> {
  const params = year ? { year } : undefined;
  const res = await api.get<ApiResponse<DailySnapshotDTO[]>>('/snapshots', { params });
  return res.data.data;
}

export async function fetchSnapshot(date: string): Promise<DailySnapshotDTO> {
  const res = await api.get<ApiResponse<DailySnapshotDTO>>(`/snapshots/${date}`);
  return res.data.data;
}

export async function createSnapshot(payload: DailySnapshotDTO): Promise<DailySnapshotDTO> {
  const res = await api.post<ApiResponse<DailySnapshotDTO>>('/snapshots', payload);
  return res.data.data;
}

export async function updateSnapshot(date: string, payload: UpdateSnapshotPayload): Promise<DailySnapshotDTO> {
  const res = await api.put<ApiResponse<DailySnapshotDTO>>(`/snapshots/${date}`, payload);
  return res.data.data;
}
