import { useMemo } from 'react';
import type {
  HoldingDTO, TagStat, KLineDTO,
  RebalanceRulesDTO, RebalanceSuggestion, RebalanceAction,
} from '../types';

export interface RebalanceResult {
  suggestions:      RebalanceSuggestion[];
  volatilityFactor: number;
  dynamicThreshold: number;
}

/* ── 標準差（樣本）── */
function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

/* ── 投組波動係數（Current_Vol / Historical_Vol）── */
export function computeVolatilityFactor(
  holdings:  HoldingDTO[],
  sparklines: Record<string, number[]>,
): number {
  const totalAsset = holdings.reduce((s, h) => s + h.currentPrice * h.shares, 0);
  if (totalAsset === 0) return 1;

  const valid = holdings.filter(h => (sparklines[h.stockCode]?.length ?? 0) >= 2);
  if (valid.length === 0) return 1;

  const weights = valid.map(h => ({
    code: h.stockCode,
    w:    (h.currentPrice * h.shares) / totalAsset,
  }));

  const minLen = Math.min(...valid.map(h => sparklines[h.stockCode].length));
  /* 至少需要 22 個收盤價才能計算出 21 個日報酬（夠算 20 日與 90 日）*/
  if (minLen < 22) return 1;

  const portfolioReturns: number[] = [];
  for (let i = 1; i < minLen; i++) {
    let ret = 0;
    for (const { code, w } of weights) {
      const sl   = sparklines[code];
      const prev = sl[i - 1];
      if (prev === 0) continue;
      ret += w * ((sl[i] - prev) / prev);
    }
    portfolioReturns.push(ret);
  }

  const currentVol    = stdDev(portfolioReturns.slice(-20));
  const historicalVol = stdDev(portfolioReturns);

  if (historicalVol === 0) return 1;
  const factor = currentVol / historicalVol;
  /* 限制在合理範圍，避免極端值扭曲門檻 */
  return Math.max(0.5, Math.min(factor, 3));
}

/* ── 純計算函式（可在 callback 內直接呼叫，不受 Hook 規則限制）── */
export function computeRebalanceSuggestions(
  holdings:   HoldingDTO[],
  tagStats:   TagStat[],
  rules:      RebalanceRulesDTO,
  klines:     Record<string, KLineDTO[]>,
  sparklines: Record<string, number[]>,
): RebalanceResult {
  const totalAsset = holdings.reduce((s, h) => s + h.currentPrice * h.shares, 0);

  const volatilityFactor = computeVolatilityFactor(holdings, sparklines);
  const dynamicThreshold = rules.baseThreshold * volatilityFactor;

  if (totalAsset === 0 || tagStats.length === 0) {
    return { suggestions: [], volatilityFactor, dynamicThreshold };
  }

  const { liquidityCapRatio } = rules;

  const stockWeight = new Map<string, number>(
    holdings.map(h => [h.stockCode, (h.currentPrice * h.shares) / totalAsset])
  );

  /* 僅納入偏離超過動態門檻的 Tag */
  const deltaMap = new Map<string, number>();
  for (const ts of tagStats) {
    if (ts.fallbackBehavior === 'exclude' || ts.targetWeight == null) continue;
    const delta = ts.delta / 100;
    if (Math.abs(delta) <= dynamicThreshold) continue;
    deltaMap.set(ts.tagName, delta);
  }

  const suggestions: RebalanceSuggestion[] = holdings.map(h => {
    let score = 0;
    const wi = stockWeight.get(h.stockCode) ?? 0;
    for (const ht of h.tags) {
      const delta = deltaMap.get(ht.tagName);
      if (delta == null) continue;
      score += delta * (wi * (ht.weightRatio / 100));
    }

    if (score === 0) {
      return { stockCode: h.stockCode, stockName: h.stockName, action: 'hold', shares: 0, estimatedAmount: 0, isLiquidityLimited: false };
    }

    const rawTradeAmount = Math.abs(score) * totalAsset;

    const stockKlines = klines[h.stockCode] ?? [];
    /* 取近 advLookbackDays 根 K 線（排除最後一根當日未收盤）計算 ADV */
    const advDays     = rules.advLookbackDays ?? 20;
    const closedBars  = stockKlines.length >= 2 ? stockKlines.slice(0, -1) : [];
    const recentBars  = closedBars.slice(-advDays);
    const adv         = recentBars.length > 0
      ? recentBars.reduce((s, k) => s + k.volume, 0) / recentBars.length
      : 0;

    let finalTradeAmount = rawTradeAmount;
    let isLiquidityLimited = false;
    if (adv > 0) {
      const maxTradeAmount = adv * h.currentPrice * liquidityCapRatio;
      if (rawTradeAmount > maxTradeAmount) {
        finalTradeAmount   = maxTradeAmount;
        isLiquidityLimited = true;
      }
    }

    const shares  = Math.floor(finalTradeAmount / h.currentPrice);
    const action: RebalanceAction = shares === 0 ? 'hold' : (score > 0 ? 'sell' : 'buy');

    return {
      stockCode:          h.stockCode,
      stockName:          h.stockName,
      action,
      shares,
      estimatedAmount:    shares * h.currentPrice,
      isLiquidityLimited: isLiquidityLimited && shares > 0,
    };
  });

  return { suggestions, volatilityFactor, dynamicThreshold };
}

export function useRebalanceViewModel(
  holdings:   HoldingDTO[],
  tagStats:   TagStat[],
  rules:      RebalanceRulesDTO,
  klines:     Record<string, KLineDTO[]>,
  sparklines: Record<string, number[]>,
): RebalanceResult {
  return useMemo(
    () => computeRebalanceSuggestions(holdings, tagStats, rules, klines, sparklines),
    [holdings, tagStats, rules, klines, sparklines],
  );
}
