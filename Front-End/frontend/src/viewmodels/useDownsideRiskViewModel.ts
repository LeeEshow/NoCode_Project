import { useState, useMemo, useCallback, useRef } from 'react';
import { fetchSnapshots } from '../models/snapshotModel';
import { computeMaxDrawdown, computeVarCVar } from '../utils/downsideRisk';
import type { DailySnapshotDTO, MddResult, VarCVarResult } from '../types';

export interface DownsideRiskResult {
  mdd:        MddResult | null;
  varCvar:    VarCVarResult | null;
  sampleDays: number;
  loading:    boolean;
  error:      string | null;
  fetch:      () => void;
}

const MIN_DAYS_INITIAL = 60;

export function useDownsideRiskViewModel(currentAssetValue?: number): DownsideRiskResult {
  const [snapshots, setSnapshots] = useState<DailySnapshotDTO[] | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const fetchedRef = useRef(false);

  const fetch = useCallback(async () => {
    if (fetchedRef.current || loading) return;
    fetchedRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const year = new Date().getFullYear();
      const [curr, prev] = await Promise.all([
        fetchSnapshots(year),
        fetchSnapshots(year - 1),
      ]);
      const all = [...prev, ...curr].sort((a, b) => a.date.localeCompare(b.date));
      setSnapshots(all);
    } catch (err) {
      setError((err as Error).message);
      fetchedRef.current = false;
    } finally {
      setLoading(false);
    }
  }, [loading]);

  const mdd = useMemo(() => {
    if (!snapshots || snapshots.length < 2) return null;
    return computeMaxDrawdown(snapshots);
  }, [snapshots]);

  const varCvar = useMemo(() => {
    if (!snapshots || snapshots.length < MIN_DAYS_INITIAL) return null;
    return computeVarCVar(snapshots, currentAssetValue);
  }, [snapshots, currentAssetValue]);

  return {
    mdd,
    varCvar,
    sampleDays: snapshots?.length ?? 0,
    loading,
    error,
    fetch,
  };
}
