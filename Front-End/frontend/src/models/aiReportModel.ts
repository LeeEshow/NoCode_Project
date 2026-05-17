import api from '../api/axios';
import type { ApiResponse, AiReportDTO } from '../types';

export async function getLatestReport(): Promise<AiReportDTO | null> {
  const res = await api.get<ApiResponse<AiReportDTO | null>>('/ai/daily-report');
  return res.data.data;
}

export async function getReportByDate(date: string): Promise<AiReportDTO | null> {
  const res = await api.get<ApiResponse<AiReportDTO | null>>(`/ai/daily-report/${date}`);
  return res.data.data;
}
