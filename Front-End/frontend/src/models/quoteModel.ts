import api from '../api/axios';
import type { ApiResponse, QuoteDTO } from '../types';

export async function fetchQuotesByCodes(
  codes: string[],
): Promise<Record<string, QuoteDTO>> {
  const res = await api.post<ApiResponse<Record<string, QuoteDTO>>>('/stocks/quotes', { codes });
  return res.data.data;
}
