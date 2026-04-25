import api from '../api/axios';
import type { ApiResponse, BondDTO, CreateBondPayload } from '../types';

interface RawBond {
  id:           string;
  name:         string;
  couponRate:   number;
  maturityDate: string;
  currency:     string;
  faceValue:    number;
  note:         string;
  createdAt:    string;
  updatedAt:    string;
  twdEstimate:  number;
}

function toDTO(raw: RawBond): BondDTO {
  return {
    id:           raw.id,
    name:         raw.name,
    couponRate:   raw.couponRate,
    maturityDate: raw.maturityDate,
    currency:     raw.currency,
    faceValue:    raw.faceValue,
    note:         raw.note || undefined,
    twdEstimate:  raw.twdEstimate ?? 0,
  };
}

export async function fetchBonds(): Promise<BondDTO[]> {
  const res = await api.get<ApiResponse<RawBond[]>>('/bonds');
  return res.data.data.map(toDTO);
}

export async function createBond(payload: CreateBondPayload): Promise<BondDTO> {
  const res = await api.post<ApiResponse<RawBond>>('/bonds', payload);
  return toDTO(res.data.data);
}

export async function updateBond(id: string, payload: Partial<CreateBondPayload>): Promise<BondDTO> {
  const res = await api.put<ApiResponse<RawBond>>(`/bonds/${id}`, payload);
  return toDTO(res.data.data);
}

export async function deleteBond(id: string): Promise<void> {
  await api.delete(`/bonds/${id}`);
}
