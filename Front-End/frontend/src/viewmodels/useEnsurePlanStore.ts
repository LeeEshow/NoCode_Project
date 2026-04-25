import { useEffect } from 'react';
import { fetchPlanConfig } from '../models/planConfigModel';
import { fetchSnapshots } from '../models/snapshotModel';
import { fetchHoldings } from '../models/holdingModel';
import { fetchForeignAssets } from '../models/foreignAssetModel';
import { buildPlanRows, groupSnapshotsByYear } from '../models/planModel';
import { usePlanStore } from '../stores/planStore';
import { useSnapshotStore } from '../stores/snapshotStore';

export function useEnsurePlanStore() {
  const loaded  = usePlanStore(s => s.loaded);
  const liveCash = useSnapshotStore(s => s.cashBalance);

  useEffect(() => {
    if (loaded) return;

    async function init() {
      try {
        const [config, snapshots, holdings, forex] = await Promise.all([
          fetchPlanConfig(),
          fetchSnapshots(),
          fetchHoldings(),
          fetchForeignAssets(),
        ]);
        const snapsByYear = groupSnapshotsByYear(snapshots);
        const baseRows    = buildPlanRows(config, snapsByYear);
        const liveStock   = holdings.reduce((s, h) => s + h.currentValue * 0.997, 0);
        const liveForex   = forex.reduce((s, item) => {
          if (item.currency === 'TWD') return s + item.amount;
          const rate = item.useManualRate ? item.manualRate : (item.liveRate ?? 0);
          return s + item.amount * rate;
        }, 0);

        const cur = baseRows.find(r => r.status === 'current');
        if (!cur) { usePlanStore.setState({ loaded: true }); return; }

        const stockValue  = liveStock;
        const cashBalance = liveCash > 0 ? liveCash : (cur.cashBalance ?? 0);
        const forexValue  = liveForex;
        const execCapital = cur.execCapital ?? 0;
        const reinvest    = cur.reinvest    ?? 0;
        const totalAsset  = stockValue + forexValue + cashBalance;
        const invested    = execCapital + reinvest;
        const returnValue = totalAsset - invested;
        const returnPct   = invested !== 0 ? totalAsset / invested - 1 : null;

        usePlanStore.setState({
          currentYearReturnPct:   returnPct,
          currentYearReturnValue: returnValue,
          loaded: true,
        });
      } catch { /* silent */ }
    }

    init();
  }, [loaded, liveCash]);
}
