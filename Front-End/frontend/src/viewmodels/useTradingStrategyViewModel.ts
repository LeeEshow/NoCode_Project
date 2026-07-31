import { useState, useCallback } from 'react';
import { getAll, remove as removeApi } from '../models/tradingStrategyModel';
import type { TradingStrategyDTO } from '../types';

export function useTradingStrategyViewModel() {
  const [strategies, setStrategies] = useState<Record<string, TradingStrategyDTO>>({});
  const [loading, setLoading]       = useState(false);

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

  const updateLocal = useCallback((updated: TradingStrategyDTO) => {
    setStrategies(prev => ({ ...prev, [updated.stockCode]: updated }));
  }, []);

  return { strategies, loading, load, remove, updateLocal };
}
