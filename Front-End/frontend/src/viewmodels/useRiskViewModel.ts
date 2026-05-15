import { useMemo } from 'react';
import { chartColors } from '../styles';
import type { HoldingDTO, TagDTO, TagStat, OverlappingTagGroup, CorrelationEntry, TriggerDirection } from '../types';

export interface RiskResult {
  riskTotal:         number;
  tagStats:          TagStat[];
  overlappingGroups: OverlappingTagGroup[];
  hasWarning:        boolean;
}

const EMPTY: RiskResult = { riskTotal: 0, tagStats: [], overlappingGroups: [], hasWarning: false };

export function useRiskViewModel(
  holdings:            HoldingDTO[],
  tags:                TagDTO[],
  baseThreshold:       number,
  correlationEntries:  CorrelationEntry[],
  /* Bug-A: 使用動態門檻判斷 triggered，未傳入時 fallback baseThreshold */
  dynamicThreshold?:   number,
  /* Issue-D: 由 viewmodel 計算 isConcentrationBreached，View 層只讀旗標 */
  concentrationLimit?: number,
): RiskResult {
  return useMemo(() => {
    /* Step 1: totalAsset */
    const totalAsset = holdings.reduce((s, h) => s + h.currentPrice * h.shares, 0);
    if (totalAsset === 0 || tags.length === 0) return EMPTY;

    /* Step 2: 各股投組權重（小數） */
    const stockWeight = new Map<string, number>(
      holdings.map(h => [h.stockCode, (h.currentPrice * h.shares) / totalAsset])
    );

    /* Step 3: 各 Tag 當前配置（小數，exclude 行為跳過） */
    const actualRaw = new Map<string, number>();
    for (const tag of tags) {
      if (tag.fallbackBehavior === 'exclude') { actualRaw.set(tag.name, 0); continue; }
      let sum = 0;
      for (const h of holdings) {
        const wi = stockWeight.get(h.stockCode) ?? 0;
        for (const ht of h.tags) {
          if (ht.tagName === tag.name) sum += wi * (ht.weightRatio / 100);
        }
      }
      actualRaw.set(tag.name, sum);
    }

    /* Step 4: 建立 ρ 查找表（key: "tagA|tagB"，未設定預設 1.0） */
    const rhoMap = new Map<string, number>();
    for (const e of correlationEntries) {
      rhoMap.set(`${e.tagA}|${e.tagB}`, e.rho);
      rhoMap.set(`${e.tagB}|${e.tagA}`, e.rho);
    }
    function getRho(a: string, b: string) {
      return a === b ? 1.0 : (rhoMap.get(`${a}|${b}`) ?? 1.0);
    }

    /* Step 5: Σ_ij wi*wj*Ri*Rj*ρij → Risk_total（使用 dynamicRisk） */
    let riskSq = 0;
    for (const ti of tags) {
      const wi = actualRaw.get(ti.name) ?? 0;
      for (const tj of tags) {
        const wj  = actualRaw.get(tj.name) ?? 0;
        const rho = getRho(ti.name, tj.name);
        riskSq += wi * wj * ti.dynamicRisk * tj.dynamicRisk * rho;
      }
    }
    const riskTotal = Math.sqrt(riskSq);

    /* Step 6: 偏差與觸發（Bug-A：使用 dynamicThreshold，未傳入時 fallback baseThreshold）*/
    const effectiveThreshold = dynamicThreshold ?? baseThreshold;
    const thresholdPP = effectiveThreshold * 100;
    const tagStats: TagStat[] = tags.map((tag, idx) => {
      const actualWeight = (actualRaw.get(tag.name) ?? 0) * 100;
      const delta     = tag.targetWeight != null ? actualWeight - tag.targetWeight : 0;
      const dir: TriggerDirection = tag.triggerDirection ?? 'both';
      const triggered = tag.targetWeight != null && (
        dir === 'upper_only' ? delta > thresholdPP :
        dir === 'lower_only' ? delta < -thresholdPP :
        Math.abs(delta) > thresholdPP
      );
      return {
        tagName:          tag.name,
        baseRisk:         tag.baseRisk,
        targetWeight:     tag.targetWeight,
        fallbackBehavior: tag.fallbackBehavior,
        actualWeight,
        delta,
        triggered,
        chartColor:       chartColors[idx % chartColors.length],
      };
    });

    /* Step 7: 同質 Tag 重疊偵測（Issue-D：由 viewmodel 計算 isConcentrationBreached）*/
    const sigMap = new Map<string, string[]>();
    for (const h of holdings) {
      if (h.tags.length === 0) continue;
      const sig = [...new Set(h.tags.map(t => t.tagName))].sort().join('|');
      const group = sigMap.get(sig) ?? [];
      group.push(h.stockCode);
      sigMap.set(sig, group);
    }
    const overlappingGroups: OverlappingTagGroup[] = [];
    for (const [sig, stockCodes] of sigMap) {
      if (stockCodes.length >= 2) {
        const combinedWeight = stockCodes.reduce((s, code) => s + (stockWeight.get(code) ?? 0), 0);
        overlappingGroups.push({
          stockCodes,
          tagNames: sig.split('|'),
          combinedWeight,
          isConcentrationBreached: concentrationLimit != null && combinedWeight > concentrationLimit,
        });
      }
    }

    const hasWarning = tagStats.some(t => t.triggered) || overlappingGroups.length > 0;
    return { riskTotal, tagStats, overlappingGroups, hasWarning };
  }, [holdings, tags, baseThreshold, correlationEntries, dynamicThreshold, concentrationLimit]);
}
