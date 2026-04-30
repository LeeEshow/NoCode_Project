import api from '../api/axios';
import type { ApiResponse, WatchlistItemDTO, CreateWatchlistPayload } from '../types';

/* 後端 Watchlist 回傳（含即時報價注入） */
interface RawWatchlistItem {
  stockId:        string;
  stockName?:     string | null;
  targetPrice:    number;
  note:           string;
  createdAt:      string | Date;
  updatedAt:      string | Date;
  livePrice?:     number | null;
  change?:        number | null;
  changePercent?: number | null;
  judgment?:      string | null;
}

function toWatchlistItemDTO(raw: RawWatchlistItem): WatchlistItemDTO {
  const currentPrice = raw.livePrice    ?? 0;
  const change       = raw.change       ?? 0;
  const changePct    = raw.changePercent ?? 0;
  return {
    id:           raw.stockId,
    stockCode:    raw.stockId,
    stockName:    raw.stockName ?? raw.stockId,
    targetPrice:  raw.targetPrice,
    currentPrice,
    change,
    changePct,
    isUp:   changePct > 0,
    signal: raw.judgment === '買進' ? 'buy' : 'wait',
    note:   raw.note || undefined,
  };
}

export async function fetchWatchlist(): Promise<WatchlistItemDTO[]> {
  const res = await api.get<ApiResponse<RawWatchlistItem[]>>('/watchlist');
  return res.data.data.map(toWatchlistItemDTO);
}

export async function createWatchlistItem(payload: CreateWatchlistPayload): Promise<WatchlistItemDTO> {
  const res = await api.post<ApiResponse<RawWatchlistItem>>('/watchlist', {
    stockId:     payload.stockCode,
    targetPrice: payload.targetPrice,
    note:        payload.note,
  });
  return toWatchlistItemDTO(res.data.data);
}

export async function updateWatchlistItem(
  id: string,
  payload: Partial<CreateWatchlistPayload>,
): Promise<WatchlistItemDTO> {
  const res = await api.put<ApiResponse<RawWatchlistItem>>(`/watchlist/${id}`, {
    targetPrice: payload.targetPrice,
    note:        payload.note,
  });
  return toWatchlistItemDTO(res.data.data);
}

export async function deleteWatchlistItem(id: string): Promise<void> {
  await api.delete(`/watchlist/${id}`);
}

export async function reorderWatchlist(order: string[]): Promise<void> {
  await api.put('/watchlist/reorder', { order });
}
