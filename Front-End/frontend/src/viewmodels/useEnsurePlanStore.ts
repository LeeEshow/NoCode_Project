import { useEffect } from 'react';
import { fetchPlanConfig } from '../models/planConfigModel';
import { fetchSnapshots } from '../models/snapshotModel';
import { fetchForeignAssets } from '../models/foreignAssetModel';
import { buildPlanRows, groupSnapshotsByYear } from '../models/planModel';
import { usePlanStore } from '../stores/planStore';

export function useEnsurePlanStore() {
  const loaded = usePlanStore(s => s.loaded);

  useEffect(() => {
    if (loaded) return;

    async function init() {
      try {
        const [config, snapshots, forex] = await Promise.all([
          fetchPlanConfig(),
          fetchSnapshots(),
          fetchForeignAssets(),
        ]);
        const snapsByYear = groupSnapshotsByYear(snapshots);
        const baseRows    = buildPlanRows(config, snapsByYear);
        const cur         = baseRows.find(r => r.status === 'current');

        if (!cur) { usePlanStore.setState({ loaded: true }); return; }

        const forexValue = forex.reduce((s, item) => {
          if (item.currency === 'TWD') return s + item.amount;
          const rate = item.useManualRate ? item.manualRate : (item.liveRate ?? 0);
          return s + item.amount * rate;
        }, 0);

        usePlanStore.setState({
          execCapital: cur.execCapital ?? 0,
          reinvest:    cur.reinvest    ?? 0,
          forexValue,
          loaded: true,
        });
      } catch { /* silent */ }
    }

    init();
  }, [loaded]);
}
