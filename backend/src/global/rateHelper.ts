import { MarketIndex } from '../models/MarketIndex';
import { getOrSet } from './cache';

/**
 * 取得即時匯率 Map（code → 台幣匯率），TWD 固定為 1
 * 使用 market:forex-rates 快取（TTL 300s）
 */
export async function getLiveRateMap(): Promise<Record<string, number | null>> {
  const rates = await getOrSet(
    'market:forex-rates',
    () => MarketIndex.fetchForexRates(),
    300
  );
  const map: Record<string, number | null> = { TWD: 1 };
  for (const r of rates) map[r.code] = r.rate;
  return map;
}
