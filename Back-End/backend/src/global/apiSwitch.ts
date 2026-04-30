import { isMarketOpen } from './marketHours';
import { circuitBreaker } from './circuitBreaker';

/**
 * 統一資料源切換元件
 * - 盤中：以 Shioaji（primary）為主，circuit breaker 保護
 * - 盤外 或 circuit OPEN：自動切換 Yahoo Finance（fallback）
 */
export const apiSwitch = {
  async call<T>(primary: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
    if (!isMarketOpen()) {
      return fallback();
    }

    try {
      return await circuitBreaker.call(primary);
    } catch {
      return fallback();
    }
  },

  status() {
    const cb         = circuitBreaker.getStatus();
    const marketOpen = isMarketOpen();
    return {
      source:     marketOpen && cb.state !== 'OPEN' ? 'shioaji' : 'yahoo',
      circuit:    cb,
      marketOpen,
    };
  },
};
