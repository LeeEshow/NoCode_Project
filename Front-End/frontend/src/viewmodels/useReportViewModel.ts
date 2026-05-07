import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchSnapshots } from '../models/snapshotModel';
import { fetchHoldings } from '../models/holdingModel';
import { useSnapshotStore } from '../stores/snapshotStore';
import type { DailySnapshotDTO, HoldingDTO } from '../types';

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

interface State {
  snapshots: DailySnapshotDTO[];
  holdings:  HoldingDTO[];
  loading:   boolean;
  error:     string | null;
}

export function useReportViewModel() {
  const [state, setState] = useState<State>({
    snapshots: [], holdings: [], loading: true, error: null,
  });

  const liveCash = useSnapshotStore(s => s.cashBalance);

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const [snapshots, holdings] = await Promise.all([
        fetchSnapshots(),
        fetchHoldings(),
      ]);
      setState({ snapshots, holdings, loading: false, error: null });
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: (err as Error).message }));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* 即時摘要 */
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

  /* 快照列表（降序） */
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

  return { summary, rows, loading: state.loading, error: state.error, load };
}
