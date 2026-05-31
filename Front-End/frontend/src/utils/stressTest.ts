import type { TagStat, StressScenario } from '../types';

interface ScenarioDef {
  id:     string;
  name:   string;
  shocks: Record<string, number>;  /* tagName → shock（如 -0.15 = -15%） */
}

const PRESETS: ScenarioDef[] = [
  {
    id:   'market-crash',
    name: '大盤重挫',
    shocks: { 市值型: -0.15, 成長: -0.20, 高股息: -0.10, 科技: -0.18, 金融: -0.12, 台股: -0.15 },
  },
  {
    id:   'semi-cycle',
    name: '半導體循環反轉',
    shocks: { 半導體: -0.25, 成長: -0.15, 科技: -0.20 },
  },
  {
    id:   'liquidity-dry',
    name: '流動性枯竭',
    shocks: { 槓桿: -0.30, 成長: -0.20, 高股息: -0.15, 市值型: -0.10, 台股: -0.12 },
  },
  {
    id:   'twd-appreciation',
    name: '台幣快速升值',
    shocks: { 美股: -0.08, USD: -0.08, 海外: -0.06, 外幣: -0.07, 美元: -0.08 },
  },
  {
    id:   'rate-hike',
    name: '利率上升',
    shocks: { 長債: -0.15, 債券: -0.10, 高股息: -0.05, 金融: -0.05 },
  },
];

export function computeStressScenarios(
  tagStats: TagStat[],
  totalAssetValue: number,
): StressScenario[] {
  return PRESETS.map(preset => {
    let stressedReturn = 0;
    for (const stat of tagStats) {
      const shock = preset.shocks[stat.tagName] ?? 0;
      stressedReturn += (stat.actualWeight / 100) * shock;
    }
    return {
      id:                  preset.id,
      name:                preset.name,
      estimatedReturnPct:  Math.round(stressedReturn * 10000) / 10000,
      estimatedLossAmount: Math.round(Math.abs(stressedReturn) * totalAssetValue),
    };
  });
}
