import api from '../api/axios';
import type { ApiResponse, ForeignCurrencyDTO, UpdateForeignCurrencyPayload, CurrencyCode } from '../types';

interface RawForeignCurrency {
  currencyCode:  string;
  amount:        number;
  useManualRate: boolean;
  manualRate:    number;
  liveRate:      number | null;
  twdValue:      number;
  updatedAt:     string;
}

function toDTO(raw: RawForeignCurrency): ForeignCurrencyDTO {
  return {
    currencyCode:  raw.currencyCode as CurrencyCode,
    amount:        raw.amount        ?? 0,
    useManualRate: raw.useManualRate ?? false,
    manualRate:    raw.manualRate    ?? 0,
    liveRate:      raw.liveRate      ?? null,
    twdValue:      raw.twdValue      ?? 0,
    updatedAt:     raw.updatedAt     ?? '',
  };
}

export async function fetchForeignCurrencies(): Promise<ForeignCurrencyDTO[]> {
  const res = await api.get<ApiResponse<RawForeignCurrency[]>>('/foreign-currencies');
  return res.data.data.map(toDTO);
}

export async function upsertForeignCurrency(
  code: CurrencyCode,
  payload: UpdateForeignCurrencyPayload,
): Promise<ForeignCurrencyDTO> {
  const res = await api.put<ApiResponse<RawForeignCurrency>>(`/foreign-currencies/${code}`, payload);
  return toDTO(res.data.data);
}

export async function deleteForeignCurrency(code: CurrencyCode): Promise<void> {
  await api.delete(`/foreign-currencies/${code}`);
}
