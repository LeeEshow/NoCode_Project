import type { TradingStrategyDTO, StrategyStatus } from '../types';

export function resolveStrategyStatus(dto: TradingStrategyDTO): StrategyStatus {
  if (dto.dismissed) return 'dismissed';
  if (dto.expiresAt && new Date(dto.expiresAt) < new Date()) return 'expired';
  return dto.status;
}
