import { useState, useCallback } from 'react';
import {
  fetchTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
} from '../models/transactionModel';
import { recalculateHoldings } from '../models/holdingModel';
import type { TransactionDTO, CreateTransactionPayload } from '../types';

export interface CostCalcResult {
  shares:    number;
  costAvg:   number;
  totalCost: number;
}

/* 依所有交易記錄計算持倉成本（加權平均法） */
export function calcCostFromTransactions(txs: TransactionDTO[]): CostCalcResult {
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
  let shares = 0;
  let totalCost = 0;

  for (const tx of sorted) {
    if (tx.type === 'buy') {
      totalCost += tx.shares * tx.price + tx.fee;
      shares    += tx.shares;
    } else {
      const avg = shares > 0 ? totalCost / shares : 0;
      shares    -= tx.shares;
      totalCost -= tx.shares * avg;
      totalCost -= tx.fee;
    }
  }

  const costAvg = shares > 0 ? totalCost / shares : 0;
  return { shares: Math.max(0, shares), costAvg, totalCost: Math.max(0, totalCost) };
}

interface State {
  items:   TransactionDTO[];
  loading: boolean;
  saving:  boolean;
  error:   string | null;
}

export function useTransactionsViewModel(stockCode: string | null) {
  const [state, setState] = useState<State>({
    items: [], loading: false, saving: false, error: null,
  });

  const load = useCallback(async () => {
    if (!stockCode) return;
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const items = await fetchTransactions(stockCode);
      setState(s => ({ ...s, items, loading: false }));
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: (err as Error).message }));
    }
  }, [stockCode]);

  const addTx = useCallback(async (
    payload: CreateTransactionPayload,
    onSuccess?: () => void,
  ) => {
    setState(s => ({ ...s, saving: true, error: null }));
    try {
      await createTransaction(payload);
      const items = await fetchTransactions(payload.stockCode);
      const calc = calcCostFromTransactions(items);
      await recalculateHoldings([{ stockCode: payload.stockCode, ...calc }]);
      setState(s => ({ ...s, items, saving: false }));
      onSuccess?.();
    } catch (err) {
      setState(s => ({ ...s, saving: false, error: (err as Error).message }));
    }
  }, []);

  const updateTx = useCallback(async (
    id: string,
    payload: Partial<CreateTransactionPayload>,
    onSuccess?: () => void,
  ) => {
    setState(s => ({ ...s, saving: true, error: null }));
    try {
      await updateTransaction(id, payload);
      if (stockCode) {
        const items = await fetchTransactions(stockCode);
        const calc = calcCostFromTransactions(items);
        await recalculateHoldings([{ stockCode, ...calc }]);
        setState(s => ({ ...s, items, saving: false }));
      }
      onSuccess?.();
    } catch (err) {
      setState(s => ({ ...s, saving: false, error: (err as Error).message }));
    }
  }, [stockCode]);

  const deleteTx = useCallback(async (id: string, onSuccess?: () => void) => {
    setState(s => ({ ...s, saving: true, error: null }));
    try {
      await deleteTransaction(id);
      if (stockCode) {
        const items = await fetchTransactions(stockCode);
        const calc = calcCostFromTransactions(items);
        await recalculateHoldings([{ stockCode, ...calc }]);
        setState(s => ({ ...s, items, saving: false }));
      }
      onSuccess?.();
    } catch (err) {
      setState(s => ({ ...s, saving: false, error: (err as Error).message }));
    }
  }, [stockCode]);

  return { ...state, load, addTx, updateTx, deleteTx };
}
