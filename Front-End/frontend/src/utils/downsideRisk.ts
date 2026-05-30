import type { DailySnapshotDTO, MddResult, VarCVarResult } from '../types';

function totalValue(s: DailySnapshotDTO): number {
  return s.stockValue + s.forexValue + s.cashBalance;
}

export function computeMaxDrawdown(snapshots: DailySnapshotDTO[]): MddResult {
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) {
    return { currentDrawdown: 0, maxDrawdown: 0, peakDate: '', troughDate: '', recoveryDays: null, isRecovered: true };
  }

  let peak      = totalValue(sorted[0]);
  let peakDate  = sorted[0].date;
  let maxDD     = 0;
  let troughDate = sorted[0].date;
  let troughPeak = peak;
  let troughPeakDate = peakDate;

  for (const s of sorted) {
    const v = totalValue(s);
    if (v > peak) {
      peak = v;
      peakDate = s.date;
    }
    const dd = peak > 0 ? v / peak - 1 : 0;
    if (dd < maxDD) {
      maxDD       = dd;
      troughDate  = s.date;
      troughPeak  = peak;
      troughPeakDate = peakDate;
    }
  }

  /* 從最大回撤低點往後尋找恢復日 */
  let recoveryDays: number | null = null;
  let isRecovered = false;
  const troughIdx = sorted.findIndex(s => s.date === troughDate);
  if (troughIdx >= 0) {
    for (let i = troughIdx + 1; i < sorted.length; i++) {
      if (totalValue(sorted[i]) >= troughPeak) {
        const troughMs   = new Date(troughDate).getTime();
        const recoveryMs = new Date(sorted[i].date).getTime();
        recoveryDays = Math.round((recoveryMs - troughMs) / 86_400_000);
        isRecovered  = true;
        break;
      }
    }
  }

  const last = sorted[sorted.length - 1];
  const currentPeak = sorted.reduce((p, s) => Math.max(p, totalValue(s)), 0);
  const currentDrawdown = currentPeak > 0 ? totalValue(last) / currentPeak - 1 : 0;

  return {
    currentDrawdown,
    maxDrawdown: maxDD,
    peakDate: troughPeakDate,
    troughDate,
    recoveryDays,
    isRecovered,
  };
}

export function computeVarCVar(snapshots: DailySnapshotDTO[], currentAssetValue?: number): VarCVarResult {
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));

  const dailyReturns: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = totalValue(sorted[i - 1]);
    const curr = totalValue(sorted[i]);
    if (prev > 0) dailyReturns.push(curr / prev - 1);
  }

  const sampleDays = dailyReturns.length;
  const assetValue = currentAssetValue ?? totalValue(sorted[sorted.length - 1]);

  if (sampleDays < 2) {
    return { var95Pct: 0, var95Amount: 0, cvar95Pct: 0, cvar95Amount: 0, sampleDays };
  }

  const asc = [...dailyReturns].sort((a, b) => a - b);
  const cutIdx = Math.max(0, Math.ceil(asc.length * 0.05) - 1);
  const var95Pct  = asc[cutIdx];
  const tailReturns = asc.slice(0, cutIdx + 1);
  const cvar95Pct = tailReturns.length > 0
    ? tailReturns.reduce((s, v) => s + v, 0) / tailReturns.length
    : var95Pct;

  return {
    var95Pct,
    var95Amount:  Math.abs(var95Pct)  * assetValue,
    cvar95Pct,
    cvar95Amount: Math.abs(cvar95Pct) * assetValue,
    sampleDays,
  };
}

/* 計算回撤序列（供圖表使用） */
export function computeDrawdownSeries(
  snapshots: DailySnapshotDTO[],
): { date: string; drawdown: number }[] {
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) return [];

  let peak = totalValue(sorted[0]);
  return sorted.map(s => {
    const v = totalValue(s);
    if (v > peak) peak = v;
    const dd = peak > 0 ? v / peak - 1 : 0;
    return { date: s.date, drawdown: dd };
  });
}
