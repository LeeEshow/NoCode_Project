import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchSnapshots, updateSnapshot } from '../models/snapshotModel';
import { fetchHoldings, fetchStockInfo, fetchStockDailyHistory } from '../models/holdingModel';
import { fetchPlanConfig } from '../models/planConfigModel';
import { useSnapshotStore } from '../stores/snapshotStore';
import type { DailySnapshotDTO, HoldingDTO, StockComparisonItem } from '../types';
import { toast } from '../views/components/Toast';

const COMPARISON_RANGE_KEY  = 'report_comparison_range';
const COMPARISON_STOCKS_KEY = 'report_comparison_stocks';
const YEAR_START = '2026-01-01';
const YEAR_END   = '2026-12-31';

function loadComparisonRange(): { start: string; end: string } {
  try {
    const raw = localStorage.getItem(COMPARISON_RANGE_KEY);
    if (!raw) return { start: YEAR_START, end: YEAR_END };
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const { start, end } = obj;
    if (typeof start !== 'string' || typeof end !== 'string') return { start: YEAR_START, end: YEAR_END };
    return { start, end };
  } catch {
    return { start: YEAR_START, end: YEAR_END };
  }
}

function loadSavedStockIds(): string[] {
  try {
    const raw = localStorage.getItem(COMPARISON_STOCKS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return (arr as unknown[]).filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

interface State {
  snapshots:         DailySnapshotDTO[];
  holdings:          HoldingDTO[];
  rBase:             number;
  loading:           boolean;
  error:             string | null;
  stockComparisons:  StockComparisonItem[];
  comparisonStart:   string;
  comparisonEnd:     string;
  comparisonLoading: boolean;
}

export interface ReportSummary {
  totalInvested: number;
  stockValue:    number;
  cashBalance:   number;
  totalAsset:    number;
  returnValue:   number;
  returnRate:    number;
}

export interface ReportRow extends DailySnapshotDTO {
  netReturn:     number;
  totalInvested: number;
  returnRate:    number;
}

export function useReportViewModel() {
  const initRange = loadComparisonRange();
  const [state, setState] = useState<State>({
    snapshots:         [],
    holdings:          [],
    rBase:             0.08,
    loading:           true,
    error:             null,
    stockComparisons:  [],
    comparisonStart:   initRange.start,
    comparisonEnd:     initRange.end,
    comparisonLoading: false,
  });

  const liveCash = useSnapshotStore(s => s.cashBalance);

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const [snapshots, holdings, planConfig] = await Promise.all([
        fetchSnapshots(),
        fetchHoldings(),
        fetchPlanConfig(),
      ]);

      const savedIds = loadSavedStockIds();
      const range    = loadComparisonRange();
      let stockComparisons: StockComparisonItem[] = [];
      if (savedIds.length > 0) {
        const results = await Promise.allSettled(
          savedIds.map(async id => {
            const [info, data] = await Promise.all([
              fetchStockInfo(id),
              fetchStockDailyHistory(id, range.start, range.end),
            ]);
            if (!info) return null;
            return { stockId: id, name: info.name, data } satisfies StockComparisonItem;
          }),
        );
        stockComparisons = results
          .filter((r): r is PromiseFulfilledResult<StockComparisonItem> =>
            r.status === 'fulfilled' && r.value !== null)
          .map(r => r.value);
      }

      setState(s => ({
        ...s,
        snapshots,
        holdings,
        rBase: planConfig.rBase,
        loading: false,
        error: null,
        stockComparisons,
        comparisonStart: range.start,
        comparisonEnd:   range.end,
      }));
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: (err as Error).message }));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ── 個股比較 ── */

  const addStockComparison = useCallback(async (stockId: string, start: string, end: string) => {
    const id = stockId.trim().toUpperCase();
    if (!id) return;
    if (state.stockComparisons.some(c => c.stockId === id)) {
      toast.error(`${id} 已在清單中`);
      return;
    }
    setState(s => ({ ...s, comparisonLoading: true }));
    try {
      const [info, data] = await Promise.all([
        fetchStockInfo(id),
        fetchStockDailyHistory(id, start, end),
      ]);
      if (!info) {
        toast.error(`找不到股票代碼 ${id}`);
        setState(s => ({ ...s, comparisonLoading: false }));
        return;
      }
      if (data.length === 0) {
        toast.error(`${id} 在此區間無資料`);
        setState(s => ({ ...s, comparisonLoading: false }));
        return;
      }
      setState(prev => {
        const updated = [...prev.stockComparisons, { stockId: id, name: info.name, data }];
        localStorage.setItem(COMPARISON_STOCKS_KEY, JSON.stringify(updated.map(s => s.stockId)));
        localStorage.setItem(COMPARISON_RANGE_KEY, JSON.stringify({ start, end }));
        return { ...prev, stockComparisons: updated, comparisonLoading: false, comparisonStart: start, comparisonEnd: end };
      });
    } catch (err) {
      toast.error(`新增失敗：${(err as Error).message}`);
      setState(s => ({ ...s, comparisonLoading: false }));
    }
  }, [state.stockComparisons]);

  const removeStockComparison = useCallback((stockId: string) => {
    setState(prev => {
      const updated = prev.stockComparisons.filter(s => s.stockId !== stockId);
      localStorage.setItem(COMPARISON_STOCKS_KEY, JSON.stringify(updated.map(s => s.stockId)));
      return { ...prev, stockComparisons: updated };
    });
  }, []);

  const updateComparisonRange = useCallback(async (start: string, end: string) => {
    localStorage.setItem(COMPARISON_RANGE_KEY, JSON.stringify({ start, end }));
    setState(s => ({ ...s, comparisonStart: start, comparisonEnd: end, comparisonLoading: true }));
    try {
      const currentIds = state.stockComparisons.map(s => s.stockId);
      if (currentIds.length === 0) {
        setState(s => ({ ...s, comparisonLoading: false }));
        return;
      }
      const results = await Promise.allSettled(
        currentIds.map(async id => {
          const [info, data] = await Promise.all([
            fetchStockInfo(id),
            fetchStockDailyHistory(id, start, end),
          ]);
          if (!info) return null;
          return { stockId: id, name: info.name, data } satisfies StockComparisonItem;
        }),
      );
      const updated = results
        .filter((r): r is PromiseFulfilledResult<StockComparisonItem> =>
          r.status === 'fulfilled' && r.value !== null)
        .map(r => r.value);
      setState(s => ({ ...s, stockComparisons: updated, comparisonLoading: false }));
    } catch {
      setState(s => ({ ...s, comparisonLoading: false }));
    }
  }, [state.stockComparisons]);

  const updateSnapshotNote = useCallback(async (date: string, note: string) => {
    try {
      await updateSnapshot(date, { note });
      setState(prev => ({
        ...prev,
        snapshots: prev.snapshots.map(s => s.date === date ? { ...s, note } : s),
      }));
    } catch (err) {
      toast.error(`備註更新失敗：${(err as Error).message}`);
      throw err;
    }
  }, []);

  /* ── 計算 ── */

  const summary = useMemo((): ReportSummary | null => {
    const latest = state.snapshots.at(-1);
    if (!latest && state.holdings.length === 0) return null;
    const stockValue    = state.holdings.reduce((sum, h) => sum + h.currentValue, 0);
    const cashBalance   = liveCash > 0 ? liveCash : (latest?.cashBalance ?? 0);
    const forexValue    = latest?.forexValue ?? 0;
    const totalInvested = (latest?.execCapital ?? 0) + (latest?.reinvest ?? 0);
    const totalAsset    = stockValue + forexValue + cashBalance;
    const returnValue   = totalAsset - totalInvested;
    const returnRate    = totalInvested > 0 ? returnValue / totalInvested : 0;
    return { totalInvested, stockValue, cashBalance, totalAsset, returnValue, returnRate };
  }, [state.snapshots, state.holdings, liveCash]);

  const rows: ReportRow[] = useMemo(() =>
    [...state.snapshots]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(s => {
        const totalInvested = s.execCapital + s.reinvest;
        const netReturn     = s.stockValue + s.forexValue + s.cashBalance - totalInvested;
        const returnRate    = totalInvested > 0 ? netReturn / totalInvested : 0;
        return { ...s, netReturn, totalInvested, returnRate };
      }),
  [state.snapshots]);

  return {
    summary,
    rows,
    snapshots:            state.snapshots,
    rBase:                state.rBase,
    loading:              state.loading,
    error:                state.error,
    stockComparisons:     state.stockComparisons,
    comparisonStart:      state.comparisonStart,
    comparisonEnd:        state.comparisonEnd,
    comparisonLoading:    state.comparisonLoading,
    addStockComparison,
    removeStockComparison,
    updateComparisonRange,
    updateSnapshotNote,
    load,
  };
}
