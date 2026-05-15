import { useState, useCallback, useEffect } from 'react';
import type { RebalanceSnapshot, RebalanceSuggestion, MarketState } from '../types';
import { fetchSnapshots, saveSnapshot } from '../models/rebalanceSnapshotModel';
import { toast } from '../views/components/Toast';

export function useRebalanceSnapshotViewModel() {
  const [snapshots,  setSnapshots]  = useState<RebalanceSnapshot[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [ready,      setReady]      = useState(false);

  const loadSnapshots = useCallback(async () => {
    try {
      const data = await fetchSnapshots(10);
      setSnapshots(data);
      setSelectedId(prev => prev ?? (data.length > 0 ? data[0].id : null));
    } catch { /* 靜默 */ } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => { loadSnapshots(); }, [loadSnapshots]);

  const selectSnapshot = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const triggerCalculation = useCallback(async (
    suggestions: RebalanceSuggestion[],
    params: {
      totalAsset:        number;
      baseThreshold:     number;
      liquidityCapRatio: number;
      marketState:       MarketState;
    },
  ) => {
    setSaving(true);
    try {
      const snap = await saveSnapshot({ params, suggestions });
      setSnapshots(prev => [snap, ...prev].slice(0, 10));
      setSelectedId(snap.id);
      toast.success('再平衡建議已計算並儲存');
    } catch {
      toast.error('再平衡計算儲存失敗');
    } finally {
      setSaving(false);
    }
  }, []);

  const selectedSnapshot = snapshots.find(s => s.id === selectedId) ?? null;

  return { snapshots, selectedSnapshot, selectedId, saving, ready, loadSnapshots, selectSnapshot, triggerCalculation };
}
