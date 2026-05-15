import type { HoldingDTO, KLineDTO, TagDTO, CorrelationEntry } from '../types';

/**
 * 以 sparklines（收盤價序列）計算各 Tag 的日報酬序列。
 * 頁面載入時 sparklines 已全量取得，適合即時計算（取代懶加載的 klines）。
 */
export function calcTagDailyReturnsFromSparklines(
  holdings:  HoldingDTO[],
  sparklines: Record<string, number[]>,
): Map<string, number[]> {
  const totalAsset = holdings.reduce((s, h) => s + h.currentPrice * h.shares, 0);
  if (totalAsset === 0) return new Map();

  /* 收盤價序列 → 日報酬序列 */
  const stockReturns = new Map<string, number[]>();
  let minLen = Infinity;
  for (const h of holdings) {
    const prices = sparklines[h.stockCode];
    if (!prices || prices.length < 2) continue;
    const rets: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      const prev = prices[i - 1];
      rets.push(prev === 0 ? 0 : (prices[i] - prev) / prev);
    }
    stockReturns.set(h.stockCode, rets);
    minLen = Math.min(minLen, rets.length);
  }
  if (!isFinite(minLen) || minLen === 0) return new Map();

  /* 各 Tag 日報酬 */
  const tagNames = new Set<string>();
  for (const h of holdings) for (const ht of h.tags) tagNames.add(ht.tagName);

  const result = new Map<string, number[]>();
  for (const tagName of tagNames) {
    const tagRets: number[] = Array(minLen).fill(0);
    for (const h of holdings) {
      const ht = h.tags.find(t => t.tagName === tagName);
      if (!ht) continue;
      const rets = stockReturns.get(h.stockCode);
      if (!rets) continue;
      const wi      = (h.currentPrice * h.shares) / totalAsset;
      const contrib = wi * (ht.weightRatio / 100);
      for (let t = 0; t < minLen; t++) tagRets[t] += contrib * rets[t];
    }
    result.set(tagName, tagRets);
  }
  return result;
}

/**
 * 計算各 Tag 的日報酬序列（klines 版，供有完整 K 線資料時使用）。
 * tag_daily_return[t] = Σ_i ( w_i × holdingTagWeightRatio_i/100 × stock_return_i[t] )
 * w_i = 持股市值 / 投組總市值
 */
export function calcTagDailyReturns(
  holdings: HoldingDTO[],
  klines:   Record<string, KLineDTO[]>,
): Map<string, number[]> {
  const totalAsset = holdings.reduce((s, h) => s + h.currentPrice * h.shares, 0);
  if (totalAsset === 0) return new Map();

  /* 建立各股日報酬（close-to-close） */
  const stockReturns = new Map<string, number[]>();
  let minLen = Infinity;
  for (const h of holdings) {
    const kl = klines[h.stockCode];
    if (!kl || kl.length < 2) continue;
    const rets: number[] = [];
    for (let i = 1; i < kl.length; i++) {
      const prev = kl[i - 1].close;
      rets.push(prev === 0 ? 0 : (kl[i].close - prev) / prev);
    }
    stockReturns.set(h.stockCode, rets);
    minLen = Math.min(minLen, rets.length);
  }
  if (!isFinite(minLen) || minLen === 0) return new Map();

  /* 各 Tag 日報酬 */
  const tagNames = new Set<string>();
  for (const h of holdings) for (const ht of h.tags) tagNames.add(ht.tagName);

  const result = new Map<string, number[]>();
  for (const tagName of tagNames) {
    const tagRets: number[] = Array(minLen).fill(0);
    for (const h of holdings) {
      const ht = h.tags.find(t => t.tagName === tagName);
      if (!ht) continue;
      const rets = stockReturns.get(h.stockCode);
      if (!rets) continue;
      const wi     = (h.currentPrice * h.shares) / totalAsset;
      const contrib = wi * (ht.weightRatio / 100);
      for (let t = 0; t < minLen; t++) tagRets[t] += contrib * rets[t];
    }
    result.set(tagName, tagRets);
  }
  return result;
}

/** Pearson 相關係數，回傳 [-1, 1] */
export function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 1;
  const meanX = x.reduce((s, v) => s + v, 0) / n;
  const meanY = y.reduce((s, v) => s + v, 0) / n;
  let num = 0, denomX = 0, denomY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num    += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }
  const denom = Math.sqrt(denomX * denomY);
  return denom === 0 ? 1 : Math.max(-1, Math.min(1, num / denom));
}

/** 對所有 Tag pair 計算 Pearson ρ */
export function buildCorrelationEntries(
  tags:       TagDTO[],
  tagReturns: Map<string, number[]>,
): CorrelationEntry[] {
  const entries: CorrelationEntry[] = [];
  for (let i = 0; i < tags.length; i++) {
    const ri = tagReturns.get(tags[i].name);
    for (let j = i + 1; j < tags.length; j++) {
      const rj  = tagReturns.get(tags[j].name);
      const rho = ri && rj ? pearsonCorrelation(ri, rj) : 1;
      entries.push({ tagA: tags[i].name, tagB: tags[j].name, rho: parseFloat(rho.toFixed(3)) });
    }
  }
  return entries;
}

/** 標準差（樣本） */
export function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}
