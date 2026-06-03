import { useState, useCallback } from 'react';
import { getAll, dismiss as dismissApi, remove as removeApi } from '../models/tradingStrategyModel';
import { computeStrategyStatus } from '../utils/tradingStrategy';
import type { TradingStrategyDTO, StrategyStatus } from '../types';

export function useTradingStrategyViewModel() {
  const [strategies, setStrategies] = useState<Record<string, TradingStrategyDTO>>({});
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getAll();
      setStrategies(Object.fromEntries(list.map(s => [s.stockCode, s])));
    } catch {
      /* 策略為輔助功能，載入失敗不阻斷頁面 */
    } finally {
      setLoading(false);
    }
  }, []);

  const dismiss = useCallback(async (stockCode: string) => {
    /* 樂觀更新：先本地設 dismissed = true，再呼叫 API */
    setStrategies(prev => {
      const existing = prev[stockCode];
      if (!existing) return prev;
      return { ...prev, [stockCode]: { ...existing, dismissed: true } };
    });
    try {
      await dismissApi(stockCode);
    } catch {
      /* 回滾 */
      setStrategies(prev => {
        const existing = prev[stockCode];
        if (!existing) return prev;
        return { ...prev, [stockCode]: { ...existing, dismissed: false } };
      });
    }
  }, []);

  const remove = useCallback(async (stockCode: string) => {
    setStrategies(prev => {
      const next = { ...prev };
      delete next[stockCode];
      return next;
    });
    try {
      await removeApi(stockCode);
    } catch {
      /* 靜默失敗 */
    }
  }, []);

  const getStatus = useCallback((stockCode: string, currentPrice: number): StrategyStatus | null => {
    const s = strategies[stockCode];
    if (!s) return null;
    return computeStrategyStatus(s, currentPrice);
  }, [strategies]);

  return { strategies, loading, load, dismiss, remove, getStatus };
}
