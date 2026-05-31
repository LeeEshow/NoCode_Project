import type { ForeignAssetDTO } from '../types';

export interface BondSensitivityResult {
  totalBondValueTwd:  number;
  weightedDuration:   number;   // 加權平均存續期間（年）
  rateUp1PctLoss:     number;   // 升息 1% 估算損失（TWD，正數）
  rateDown1PctGain:   number;   // 降息 1% 估算收益（TWD，正數）
  bondCount:          number;
}

function effectiveRate(item: ForeignAssetDTO): number {
  if (item.currency === 'TWD') return 1;
  return item.useManualRate ? item.manualRate : (item.liveRate ?? 0);
}

function yearsToMaturity(maturityDate: string | null): number {
  if (!maturityDate) return 0;
  const today = new Date();
  const maturity = new Date(maturityDate);
  const diff = (maturity.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  return Math.max(0, diff);
}

export function computeBondSensitivity(items: ForeignAssetDTO[]): BondSensitivityResult {
  const bonds = items.filter(i => i.type === '債券');

  if (bonds.length === 0) {
    return { totalBondValueTwd: 0, weightedDuration: 0, rateUp1PctLoss: 0, rateDown1PctGain: 0, bondCount: 0 };
  }

  let totalBondValueTwd = 0;
  let weightedDurationSum = 0;

  for (const bond of bonds) {
    const rate = effectiveRate(bond);
    const valueTwd = bond.amount * rate;
    const ytm = yearsToMaturity(bond.maturityDate);
    const duration = ytm * 0.8;
    totalBondValueTwd += valueTwd;
    weightedDurationSum += valueTwd * duration;
  }

  const weightedDuration = totalBondValueTwd > 0
    ? weightedDurationSum / totalBondValueTwd
    : 0;

  const sensitivity = totalBondValueTwd * weightedDuration * 0.01;

  return {
    totalBondValueTwd:  Math.round(totalBondValueTwd),
    weightedDuration:   Math.round(weightedDuration * 10) / 10,
    rateUp1PctLoss:     Math.round(sensitivity),
    rateDown1PctGain:   Math.round(sensitivity),
    bondCount:          bonds.length,
  };
}
