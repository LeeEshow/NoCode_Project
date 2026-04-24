import api from '../api/axios';
import type { ApiResponse, MarketDataDTO, MarketIndexDTO, ExportIndicatorDTO } from '../types';

/* 後端 IndexCard 欄位 */
interface RawIndexCard {
  id:            string;
  name:          string;
  price:         number | null;
  change:        number | null;
  changePercent: number | null;
}

/* 後端 ExportIndicator 欄位 */
interface RawExportIndicator {
  period:     string;
  score:      number | null;
  light:      string | null;
  lightLabel: string | null;
}

function toMarketIndex(raw: RawIndexCard): MarketIndexDTO {
  const price     = raw.price         ?? 0;
  const change    = raw.change        ?? 0;
  const changePct = raw.changePercent ?? 0;
  return {
    symbol:    raw.id,
    name:      raw.name,
    price,
    change,
    changePct,
    isUp: changePct > 0,
  };
}

function toExportIndicator(raw: RawExportIndicator): ExportIndicatorDTO {
  return {
    month: raw.period,
    score: raw.score  ?? 0,
    light: (raw.light ?? 'green') as ExportIndicatorDTO['light'],
    label: raw.lightLabel ?? '',
  };
}

export async function fetchMarketData(): Promise<MarketDataDTO> {
  const [indicesRes, indicatorRes] = await Promise.all([
    api.get<ApiResponse<RawIndexCard[]>>('/market/indices'),
    api.get<ApiResponse<RawExportIndicator | null>>('/market/export-indicator').catch(() => null),
  ]);

  const indices = indicesRes.data.data.map(toMarketIndex);

  const rawIndicator = indicatorRes?.data?.data ?? null;
  const exportIndicator = rawIndicator ? toExportIndicator(rawIndicator) : null;

  return { indices, exportIndicator };
}
