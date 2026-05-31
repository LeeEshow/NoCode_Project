import { useState, useMemo, useCallback, useRef } from 'react';
import { fetchSnapshots } from '../models/snapshotModel';
import { fetchIndexKbars } from '../models/marketModel';
import { computePortfolioBeta } from '../utils/portfolioBeta';
import { computeStressScenarios } from '../utils/stressTest';
import type { DailySnapshotDTO, IndexKBar, PortfolioBetaResult, StressScenario, TagStat } from '../types';

export interface ScenarioResult {
  beta:           PortfolioBetaResult | null;
  stress:         StressScenario[];
  sampleDays:     number;
  kbarsAvailable: boolean;   /* false = Shioaji 未啟用，隱藏 Beta 區塊 */
  loading:        boolean;
  error:          string | null;
  fetch:          () => void;
}

export function useScenarioViewModel(
  tagStats: TagStat[],
  totalAssetValue: number,
): ScenarioResult {
  const [snapshots, setSnapshots]           = useState<DailySnapshotDTO[] | null>(null);
  const [kbars,     setKbars]               = useState<IndexKBar[] | null>(null);
  const [kbarsAvailable, setKbarsAvailable] = useState(true);
  const [loading,   setLoading]             = useState(false);
  const [error,     setError]               = useState<string | null>(null);
  const fetchedRef = useRef(false);

  const fetch = useCallback(async () => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const year      = new Date().getFullYear();
      const kbarStart = `${year - 1}-01-01`;

      const [snapCurr, snapPrev, kbarResult] = await Promise.allSettled([
        fetchSnapshots(year),
        fetchSnapshots(year - 1),
        fetchIndexKbars(kbarStart),
      ]);

      const curr = snapCurr.status === 'fulfilled' ? snapCurr.value : [];
      const prev = snapPrev.status === 'fulfilled' ? snapPrev.value : [];
      setSnapshots([...prev, ...curr].sort((a, b) => a.date.localeCompare(b.date)));

      if (kbarResult.status === 'fulfilled') {
        setKbars(kbarResult.value);
      } else {
        setKbarsAvailable(false);
      }
    } catch (err) {
      setError((err as Error).message);
      fetchedRef.current = false;
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const beta = useMemo(() => {
    if (!snapshots || !kbars || kbars.length === 0) return null;
    return computePortfolioBeta(snapshots, kbars);
  }, [snapshots, kbars]);

  const stress = useMemo(
    () => (totalAssetValue > 0 ? computeStressScenarios(tagStats, totalAssetValue) : []),
    [tagStats, totalAssetValue],
  );

  return {
    beta,
    stress,
    sampleDays:     snapshots?.length ?? 0,
    kbarsAvailable,
    loading,
    error,
    fetch,
  };
}
