import { Tag } from '../models/Tag';
import { AssetTag } from '../models/AssetTag';
import { Holding } from '../models/Holding';
import { Stock } from '../models/Stock';
import { MarketStateName } from '../models/MarketState';

export interface RecalculateResult {
  updatedCount: number;
  skippedCount: number;
}

function clamp(v: number): number {
  return Math.max(0, Math.min(3, v));
}

function popStd(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
}

function dailyReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) out.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  return out;
}

export async function recalculateDynamicRisk(
  marketState: MarketStateName
): Promise<RecalculateResult> {
  const [tags, allAssetTags, allHoldings] = await Promise.all([
    Tag.findAll(),
    AssetTag.findAll(),
    Holding.findAll(),
  ]);

  const activeSet = new Set(allHoldings.filter(h => h.sharesHeld > 0).map(h => h.stockId));

  // tagName → 有效持股清單（只含 sharesHeld > 0 的股票）
  const tagHoldingsMap = new Map<string, { stockCode: string; weightRatio: number }[]>();
  for (const at of allAssetTags) {
    if (!activeSet.has(at.stockCode)) continue;
    const list = tagHoldingsMap.get(at.tagName) ?? [];
    list.push({ stockCode: at.stockCode, weightRatio: at.weightRatio });
    tagHoldingsMap.set(at.tagName, list);
  }

  // 收集需要歷史資料的唯一股票代號
  const neededStocks = new Set<string>();
  for (const holdings of tagHoldingsMap.values()) {
    for (const { stockCode } of holdings) neededStocks.add(stockCode);
  }

  // 並行取得 90 日收盤價，單筆失敗不中斷
  const historyResults = await Promise.allSettled(
    [...neededStocks].map(async (stockCode) => ({
      stockCode,
      closes: (await Stock.getHistory(stockCode, 90)).map(p => p.close),
    }))
  );

  const closesMap = new Map<string, number[]>();
  for (const r of historyResults) {
    if (r.status === 'fulfilled') closesMap.set(r.value.stockCode, r.value.closes);
  }

  // 計算各 Tag 的 vol_ratio → presets → dynamicRisk
  const updates: {
    id: string;
    dynamicRisk: number;
    marketStatePresets: { riskOn: number; riskOff: number; liquidityDry: number };
  }[] = [];
  let skippedCount = 0;

  for (const tag of tags) {
    const holdings = tagHoldingsMap.get(tag.name);
    if (!holdings || holdings.length === 0) {
      skippedCount++;
      continue;
    }

    // 建立各股日報酬序列（排除取不到歷史資料的股票）
    const stockSeries: { returns: number[]; weight: number }[] = [];
    for (const { stockCode, weightRatio } of holdings) {
      const closes = closesMap.get(stockCode);
      if (!closes || closes.length < 2) continue;
      stockSeries.push({ returns: dailyReturns(closes), weight: weightRatio / 100 });
    }

    if (stockSeries.length === 0) {
      skippedCount++;
      continue;
    }

    // 對齊最短序列，計算加權 Tag 日報酬
    const minLen = Math.min(...stockSeries.map(s => s.returns.length));
    const tagReturns: number[] = [];
    for (let i = 0; i < minLen; i++) {
      let r = 0;
      for (const { returns, weight } of stockSeries) r += weight * returns[i];
      tagReturns.push(r);
    }

    // vol_ratio：資料不足 20 筆或 baseVol = 0 時預設 1.0
    let volRatio = 1.0;
    if (tagReturns.length >= 20) {
      const recentVol = popStd(tagReturns.slice(-20));
      const baseVol   = popStd(tagReturns);
      if (baseVol > 0) volRatio = recentVol / baseVol;
    }

    const { baseRisk } = tag;
    const riskOn       = clamp(baseRisk * 1.3 * volRatio);
    const riskOff      = clamp(baseRisk * 1.8 * volRatio);
    const liquidityDry = clamp(baseRisk * 2.5 * volRatio);

    const dynamicRisk =
      marketState === 'risk-on'       ? riskOn       :
      marketState === 'risk-off'      ? riskOff      :
      marketState === 'liquidity-dry' ? liquidityDry :
      clamp(baseRisk * volRatio); // neutral

    updates.push({ id: tag.id, dynamicRisk, marketStatePresets: { riskOn, riskOff, liquidityDry } });
  }

  if (updates.length > 0) await Tag.batchUpdateRisk(updates);

  return { updatedCount: updates.length, skippedCount };
}
