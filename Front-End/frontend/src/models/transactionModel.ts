import api from '../api/axios';
import type { ApiResponse, TransactionDTO, CreateTransactionPayload } from '../types';

/* 後端 Transaction 欄位 */
interface RawTransaction {
  id:            string;
  stockId:       string;
  type:          'buy' | 'sell';
  date:          string;
  shares:        number;
  pricePerShare: number;
  fee:           number;
  note:          string;
  createdAt:     string;
}

function toTransactionDTO(raw: RawTransaction): TransactionDTO {
  return {
    id:        raw.id,
    stockCode: raw.stockId,
    stockName: raw.stockId,   // 後端 transactions 不含名稱
    type:      raw.type,
    shares:    raw.shares,
    price:     raw.pricePerShare,
    fee:       raw.fee,
    date:      raw.date.slice(0, 10),  // ISO → yyyy-MM-dd
    note:      raw.note || undefined,
    createdAt: raw.createdAt,
  };
}

export async function fetchTransactions(stockCode: string): Promise<TransactionDTO[]> {
  const res = await api.get<ApiResponse<RawTransaction[]>>('/transactions', {
    params: { stock_id: stockCode },   // 後端用 stock_id 當 query param
  });
  return res.data.data.map(toTransactionDTO);
}

export async function fetchTransactionsInRange(
  start: string,
  end: string,
): Promise<TransactionDTO[]> {
  const res = await api.get<ApiResponse<RawTransaction[]>>('/transactions', {
    params: { start_date: start, end_date: end },
  });
  return res.data.data.map(toTransactionDTO);
}

export async function createTransaction(payload: CreateTransactionPayload): Promise<TransactionDTO> {
  const res = await api.post<ApiResponse<RawTransaction>>('/transactions', {
    stockId:       payload.stockCode,
    type:          payload.type,
    date:          payload.date,
    shares:        payload.shares,
    pricePerShare: payload.price,
    fee:           payload.fee,
    note:          payload.note,
  });
  return toTransactionDTO(res.data.data);
}

export async function updateTransaction(
  id: string,
  payload: Partial<CreateTransactionPayload>,
): Promise<TransactionDTO> {
  const body: Record<string, unknown> = {};
  if (payload.type  !== undefined) body['type']          = payload.type;
  if (payload.date  !== undefined) body['date']          = payload.date;
  if (payload.shares !== undefined) body['shares']       = payload.shares;
  if (payload.price  !== undefined) body['pricePerShare'] = payload.price;
  if (payload.fee    !== undefined) body['fee']          = payload.fee;
  if (payload.note   !== undefined) body['note']         = payload.note;

  const res = await api.put<ApiResponse<RawTransaction>>(`/transactions/${id}`, body);
  return toTransactionDTO(res.data.data);
}

export async function deleteTransaction(id: string): Promise<void> {
  await api.delete(`/transactions/${id}`);
}
