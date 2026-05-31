import type { ForeignAssetDTO } from '../types';

export interface CurrencyExposure {
  valueTwd:     number;
  weight:       number;   // 0-100
  fxImpact1Pct: number;   // NT$ 影響額（匯率變動 1%）
}

export interface FxExposureResult {
  byCode:        Record<string, CurrencyExposure>;  // 僅含 weight >= 0.5% 的幣別
  totalFxWeight: number;   // 所有非 TWD 幣別合計（%）
  totalAssets:   number;
}

function effectiveRate(item: ForeignAssetDTO): number {
  if (item.currency === 'TWD') return 1;
  return item.useManualRate ? item.manualRate : (item.liveRate ?? 0);
}

export function computeFxExposure(
  items: ForeignAssetDTO[],
  liveStockValue: number,
  cashBalance: number,
): FxExposureResult {
  const foreignTwd = items.reduce((sum, item) => {
    const rate = effectiveRate(item);
    return sum + item.amount * rate;
  }, 0);
  const totalAssets = liveStockValue + foreignTwd + cashBalance;

  if (totalAssets <= 0) return { byCode: {}, totalFxWeight: 0, totalAssets: 0 };

  const rawByCode: Record<string, number> = {};
  for (const item of items) {
    if (item.currency === 'TWD') continue;
    const rate = effectiveRate(item);
    if (rate <= 0) continue;
    rawByCode[item.currency] = (rawByCode[item.currency] ?? 0) + item.amount * rate;
  }

  let totalFxWeight = 0;
  const byCode: Record<string, CurrencyExposure> = {};
  for (const [code, valueTwd] of Object.entries(rawByCode)) {
    const weight = (valueTwd / totalAssets) * 100;
    totalFxWeight += weight;
    if (weight >= 0.5) {
      byCode[code] = {
        valueTwd:     Math.round(valueTwd),
        weight:       Math.round(weight * 10) / 10,
        fxImpact1Pct: Math.round(valueTwd * 0.01),
      };
    }
  }

  return {
    byCode,
    totalFxWeight: Math.round(totalFxWeight * 10) / 10,
    totalAssets:   Math.round(totalAssets),
  };
}
