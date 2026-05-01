import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchPlanConfig, savePlanConfig } from '../models/planConfigModel';
import { fetchSnapshots } from '../models/snapshotModel';
import { fetchHoldings } from '../models/holdingModel';
import { fetchForeignAssets } from '../models/foreignAssetModel';
import { buildPlanRows, groupSnapshotsByYear } from '../models/planModel';
import { useSnapshotStore } from '../stores/snapshotStore';
import { usePlanStore } from '../stores/planStore';
import type { PlanConfigDTO, PlanRow } from '../types';

const PLAN_YEARS = 30;

interface State {
  config:      PlanConfigDTO | null;
  snapsByYear: Map<number, import('../types').DailySnapshotDTO[]>;
  baseRows:    PlanRow[];         // buildPlanRows 原始結果
  liveStock:   number | null;     // holdings 即時股票現值
  liveForex:   number | null;     // 外幣資產即時台幣合計
  loading:     boolean;
  saving:      boolean;
  error:       string | null;
}

export function usePlanViewModel() {
  const [state, setState] = useState<State>({
    config: null, snapsByYear: new Map(), baseRows: [],
    liveStock: null, liveForex: null, loading: true, saving: false, error: null,
  });

  /* 訂閱全域 cashBalance（PanelHeader 輸入後同步） */
  const liveCash = useSnapshotStore(s => s.cashBalance);

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const [config, snapshots, holdings, forex] = await Promise.all([
        fetchPlanConfig(),
        fetchSnapshots(),
        fetchHoldings(),
        fetchForeignAssets(),
      ]);
      const snapsByYear = groupSnapshotsByYear(snapshots);
      const baseRows    = buildPlanRows(config, snapsByYear);
      const liveStock   = holdings.reduce((sum, h) => sum + h.currentValue * 0.997, 0);
      const liveForex   = forex.reduce((sum, item) => {
        if (item.currency === 'TWD') return sum + item.amount;
        const rate = item.useManualRate ? item.manualRate : (item.liveRate ?? 0);
        return sum + item.amount * rate;
      }, 0);
      setState(s => ({ ...s, config, snapsByYear, baseRows, liveStock, liveForex, loading: false }));
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: (err as Error).message }));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* 當年度注入即時資產資料 */
  const rows = useMemo(() => {
    return state.baseRows.map(row => {
      if (row.status !== 'current') return row;
      const stockValue  = state.liveStock ?? row.stockValue;
      const cashBalance = liveCash > 0 ? liveCash : (row.cashBalance ?? 0);
      const forexValue  = state.liveForex ?? row.forexValue ?? 0;
      const execCapital = row.execCapital ?? 0;
      const reinvest    = row.reinvest    ?? 0;
      const totalAsset  = (stockValue ?? 0) + forexValue + cashBalance;
      const invested    = execCapital + reinvest;
      const returnValue = totalAsset - invested;
      const returnPct   = invested !== 0 ? totalAsset / invested - 1 : null;
      return { ...row, stockValue, forexValue, cashBalance, returnValue, returnPct };
    });
  }, [state.baseRows, state.liveStock, state.liveForex, liveCash]);

  /* 同步當年度報酬率到 planStore，供其他頁面讀取 */
  useEffect(() => {
    const cur = rows.find(r => r.status === 'current');
    usePlanStore.setState({
      currentYearReturnPct:   cur?.returnPct   ?? null,
      currentYearReturnValue: cur?.returnValue ?? null,
      loaded: true,
    });
  }, [rows]);

  /* ── 參數更新 ── */
  const updateConfig = useCallback((patch: Partial<PlanConfigDTO>) => {
    setState(s => {
      if (!s.config) return s;
      const next     = { ...s.config, ...patch };
      const baseRows = buildPlanRows(next, s.snapsByYear);
      return { ...s, config: next, baseRows };
    });
  }, []);

  /* ── 儲存 config ── */
  const saveConfig = useCallback(async (config: PlanConfigDTO) => {
    setState(s => ({ ...s, saving: true }));
    try {
      await savePlanConfig(config);
      setState(s => ({ ...s, saving: false }));
    } catch (err) {
      setState(s => ({ ...s, saving: false, error: (err as Error).message }));
    }
  }, []);

  /* ── 年度投入 override ── */
  const setYearOverride = useCallback((yearIndex: number, amount: number) => {
    setState(s => {
      if (!s.config) return s;
      const overrides = { ...s.config.overrides, [String(yearIndex)]: amount };
      const next      = { ...s.config, overrides };
      const baseRows  = buildPlanRows(next, s.snapsByYear);
      return { ...s, config: next, baseRows };
    });
  }, []);

  /* ── 清除 override ── */
  const clearYearOverride = useCallback((yearIndex: number) => {
    setState(s => {
      if (!s.config) return s;
      const { [String(yearIndex)]: _, ...rest } = s.config.overrides;
      const next     = { ...s.config, overrides: rest };
      const baseRows = buildPlanRows(next, s.snapsByYear);
      return { ...s, config: next, baseRows };
    });
  }, []);

  /* ── 當年度再投入 ── */
  const setCurrentYearReinvest = useCallback((amount: number) => {
    setState(s => {
      if (!s.config) return s;
      const next     = { ...s.config, currentYearReinvest: amount };
      const baseRows = buildPlanRows(next, s.snapsByYear);
      return { ...s, config: next, baseRows };
    });
  }, []);

  const rNominal = useMemo(() => {
    if (!state.config) return 0;
    return state.config.rBase * state.config.kRisk;
  }, [state.config]);

  return {
    config:   state.config,
    loading:  state.loading,
    saving:   state.saving,
    error:    state.error,
    rows,
    load,
    updateConfig,
    saveConfig,
    setYearOverride,
    clearYearOverride,
    setCurrentYearReinvest,
    rNominal,
    planYears: PLAN_YEARS,
  };
}
