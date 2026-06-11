import type { TradingStrategyDTO, StrategyStatus, TradeType, TriggerRule, StrategyTranche } from '../types';

export function computeStrategyStatus(
  s: TradingStrategyDTO,
  currentPrice: number,
): StrategyStatus {
  if (s.dismissed) return 'dismissed';
  if (s.expiresAt && new Date() > new Date(s.expiresAt)) return 'expired';
  const t = s.tradeType;
  const buyTypes       = ['entry', 'add'] as TradeType[];
  const sellAboveTypes = ['reduce', 'exit', 'take_profit'] as TradeType[];
  if (buyTypes.includes(t)       && s.triggerPrice != null && currentPrice <= s.triggerPrice) return 'triggered';
  if (t === 'stop_loss'          && s.triggerPrice != null && currentPrice <= s.triggerPrice) return 'triggered';
  if (sellAboveTypes.includes(t) && s.triggerPrice != null && currentPrice >= s.triggerPrice) return 'triggered';
  return 'active';
}

/**
 * 解析策略的最終顯示狀態。
 * - 新資料（有 tranches）：後端已維護 DTO.status，直接回傳。
 * - 舊資料（只有 triggerPrice）：後端只能回傳 active/expired/dismissed，
 *   triggered 需前端用 currentPrice 比對 triggerPrice 補算。
 */
export function resolveStrategyStatus(
  dto: TradingStrategyDTO,
  currentPrice: number,
): StrategyStatus {
  if (dto.tranches && dto.tranches.length > 0) {
    return dto.status;
  }
  return computeStrategyStatus(dto, currentPrice);
}

/**
 * 生成 ruleStatuses 的 key。
 * 格式：
 *   - type only               → "{type}"
 *   - type + period（chip/MA）→ "{type}_{period}"
 *   - type + value（price_*） → "{type}_{value}"
 */
export function ruleKey(rule: TriggerRule): string {
  if (rule.period != null) return `${rule.type}_${rule.period}`;
  if (rule.value  != null) return `${rule.type}_${rule.value}`;
  return rule.type;
}

/** 合併前端即時 price rule 評估結果到 ruleStatuses */
export function mergeRealTimePriceStatuses(
  tranche: StrategyTranche,
  currentPrice: number,
  sparkline: number[],
): Record<string, boolean | null> {
  const merged = { ...(tranche.ruleStatuses ?? {}) };
  for (const rule of tranche.triggerRules ?? []) {
    const key = ruleKey(rule);
    if (rule.type === 'price_in_range') {
      merged[key] = currentPrice >= tranche.priceLow && currentPrice <= tranche.priceHigh;
    } else if (rule.type === 'price_above' && rule.value != null) {
      merged[key] = currentPrice > rule.value;
    } else if (rule.type === 'price_below' && rule.value != null) {
      merged[key] = currentPrice < rule.value;
    } else if (rule.type === 'price_above_ma' && rule.period != null) {
      const slice = sparkline.slice(-rule.period);
      if (slice.length >= rule.period) {
        const ma = slice.reduce((s, v) => s + v, 0) / slice.length;
        merged[key] = currentPrice > ma;
      } else {
        merged[key] = null;
      }
    }
  }
  return merged;
}
