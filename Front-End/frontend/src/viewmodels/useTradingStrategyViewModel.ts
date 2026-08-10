import { useState, useCallback } from 'react';
import { getAll, dismiss as dismissApi, remove as removeApi } from '../models/tradingStrategyModel';
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

  const dismiss = useCallback(async (stockCode: string) => {
    setStrategies(prev => {
      if (!prev[stockCode]) return prev;
      return { ...prev, [stockCode]: { ...prev[stockCode], dismissed: true } };
    });
    try {
      const updated = await dismissApi(stockCode);
      setStrategies(prev => ({ ...prev, [stockCode]: updated }));
    } catch {
      setStrategies(prev => {
        if (!prev[stockCode]) return prev;
        return { ...prev, [stockCode]: { ...prev[stockCode], dismissed: false } };
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

  return { strategies, loading, load, dismiss, remove };
}
