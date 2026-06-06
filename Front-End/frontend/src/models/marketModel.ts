import api from '../api/axios';
import type { ApiResponse, MarketDataDTO, MarketIndexDTO, BusinessCycleDTO, PmiDTO, IndexKBar } from '../types';

/* 後端 IndexCard 欄位 */
interface RawIndexCard {
  id:            string;
  name:          string;
  price:         number | null;
  change:        number | null;
  changePercent: number | null;
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

export async function fetchIndexKbars(start?: string, end?: string): Promise<IndexKBar[]> {
  const params: Record<string, string> = {};
  if (start) params.start = start;
  if (end)   params.end   = end;
  const res = await api.get<ApiResponse<IndexKBar[]>>('/market/index-kbars', { params });
  return res.data.data;
}

interface RawNdcIndicators {
  businessCycle: { period: string; score: number; light: string; lightLabel: string } | null;
  pmi:           { period: string; pmi: number; nextPublish: string | null } | null;
}

interface IndicesResponse extends ApiResponse<RawIndexCard[]> {
  ndcIndicators?: RawNdcIndicators;
}

export async function fetchMarketData(): Promise<MarketDataDTO> {
  const res = await api.get<IndicesResponse>('/market/indices');
  const ndc = res.data.ndcIndicators;

  const businessCycle: BusinessCycleDTO | null = ndc?.businessCycle
    ? {
        period:     ndc.businessCycle.period,
        score:      ndc.businessCycle.score,
        light:      ndc.businessCycle.light as BusinessCycleDTO['light'],
        lightLabel: ndc.businessCycle.lightLabel,
      }
    : null;

  const pmi: PmiDTO | null = ndc?.pmi ?? null;

  return { indices: res.data.data.map(toMarketIndex), businessCycle, pmi };
}
