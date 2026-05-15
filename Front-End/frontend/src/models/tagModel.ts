import api from '../api/axios';
import type {
  ApiResponse,
  TagDTO,
  AssetTagDTO,
  HoldingTagDTO,
  CreateTagPayload,
  CreateAssetTagPayload,
  UpdateAssetTagPayload,
  AddHoldingTagPayload,
  UpdateHoldingTagPayload,
  MarketState,
  TagCorrelationMatrix,
  CorrelationEntry,
} from '../types';

/* ── Tag ── */

export async function fetchTags(): Promise<TagDTO[]> {
  const res = await api.get<ApiResponse<TagDTO[]>>('/tags');
  return res.data.data;
}

export async function createTag(payload: CreateTagPayload): Promise<TagDTO> {
  const res = await api.post<ApiResponse<TagDTO>>('/tags', payload);
  return res.data.data;
}

export async function updateTag(id: string, payload: Partial<CreateTagPayload>): Promise<TagDTO> {
  const res = await api.put<ApiResponse<TagDTO>>(`/tags/${id}`, payload);
  return res.data.data;
}

export async function deleteTag(id: string): Promise<void> {
  await api.delete(`/tags/${id}`);
}

/* ── Asset-Tag ── */

export async function fetchAssetTags(stockCode?: string): Promise<AssetTagDTO[]> {
  const res = await api.get<ApiResponse<AssetTagDTO[]>>('/asset-tags', {
    params: stockCode ? { stockCode } : undefined,
  });
  return res.data.data;
}

export async function createAssetTag(payload: CreateAssetTagPayload): Promise<AssetTagDTO> {
  const res = await api.post<ApiResponse<AssetTagDTO>>('/asset-tags', payload);
  return res.data.data;
}

export async function updateAssetTag(id: string, payload: UpdateAssetTagPayload): Promise<AssetTagDTO> {
  const res = await api.put<ApiResponse<AssetTagDTO>>(`/asset-tags/${id}`, payload);
  return res.data.data;
}

export async function deleteAssetTag(id: string): Promise<void> {
  await api.delete(`/asset-tags/${id}`);
}

/* ── Holding-Tag（子資源，內嵌於持股）── */

export async function addHoldingTag(stockCode: string, payload: AddHoldingTagPayload): Promise<HoldingTagDTO> {
  const res = await api.post<ApiResponse<HoldingTagDTO>>(`/holdings/${stockCode}/tags`, payload);
  return res.data.data;
}

export async function updateHoldingTag(
  stockCode: string,
  id: string,
  payload: UpdateHoldingTagPayload,
): Promise<HoldingTagDTO> {
  const res = await api.put<ApiResponse<HoldingTagDTO>>(`/holdings/${stockCode}/tags/${id}`, payload);
  return res.data.data;
}

export async function deleteHoldingTag(stockCode: string, id: string): Promise<void> {
  await api.delete(`/holdings/${stockCode}/tags/${id}`);
}

/* ── 市場狀態 ── */

export async function fetchMarketState(): Promise<{ current: MarketState }> {
  const res = await api.get<ApiResponse<{ current: MarketState }>>('/market-state');
  return res.data.data;
}

export async function setMarketState(state: MarketState): Promise<void> {
  await api.put('/market-state', { state });
}

/* ── Tag 動態風險批次重算 ── */

export interface RecalculateDynamicRiskResult {
  updatedCount: number;
  skippedCount: number;
}

export async function recalculateDynamicRisk(marketState: MarketState): Promise<RecalculateDynamicRiskResult> {
  const res = await api.post<ApiResponse<RecalculateDynamicRiskResult>>(
    '/tags/recalculate-dynamic-risk',
    { marketState },
  );
  return res.data.data;
}

/* ── Tag 相關性矩陣 ── */

export async function fetchCorrelationMatrix(): Promise<TagCorrelationMatrix> {
  const res = await api.get<ApiResponse<TagCorrelationMatrix>>('/tag-correlation-matrix');
  return res.data.data;
}

export async function saveCorrelationMatrix(entries: CorrelationEntry[]): Promise<void> {
  await api.put('/tag-correlation-matrix', { entries });
}
