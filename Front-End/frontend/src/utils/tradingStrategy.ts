import type { TradingStrategyDTO, StrategyAction } from '../types';

export function resolveStrategyStatus(dto: TradingStrategyDTO): StrategyAction {
  return dto.action;
}
