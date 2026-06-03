import type { TradingStrategyDTO, StrategyStatus, TradeType } from '../types';

export function computeStrategyStatus(
  s: TradingStrategyDTO,
  currentPrice: number,
): StrategyStatus {
  if (s.dismissed) return 'dismissed';
  if (s.expiresAt && new Date() > new Date(s.expiresAt)) return 'expired';
  const t = s.tradeType;
  const buyTypes  = ['entry', 'add'] as TradeType[];
  const sellTypes = ['reduce', 'exit', 'stop_loss', 'take_profit'] as TradeType[];
  if (buyTypes.includes(t)  && currentPrice <= s.triggerPrice) return 'triggered';
  if (sellTypes.includes(t) && currentPrice >= s.triggerPrice) return 'triggered';
  return 'active';
}
