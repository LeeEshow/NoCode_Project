import { useState, useCallback } from 'react';
import { getAll, dismiss as dismissApi, remove as removeApi, updateRuleStatus as updateRuleStatusApi, addTrancheExecution as addTrancheExecutionApi } from '../models/tradingStrategyModel';
import { resolveStrategyStatus } from '../utils/tradingStrategy';
import { useLatest } from '../utils/useLatest';
import type { TradingStrategyDTO, StrategyStatus } from '../types';

export function useTradingStrategyViewModel() {
  const [strategies, setStrategies] = useState<Record<string, TradingStrategyDTO>>({});
  const strategiesRef = useLatest(strategies);
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
    const original = strategiesRef.current[stockCode];
    setStrategies(prev => {
      const existing = prev[stockCode];
      if (!existing) return prev;
      return { ...prev, [stockCode]: { ...existing, dismissed: true, status: 'dismissed' as const } };
    });
    try {
      await dismissApi(stockCode);
    } catch {
      if (original) {
        setStrategies(prev => ({ ...prev, [stockCode]: original }));
      }
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
    return resolveStrategyStatus(s, currentPrice);
  }, [strategies]);

  /** 樂觀更新 manual rule 確認狀態，失敗 rollback */
  const confirmManualRule = useCallback(async (
    stockCode: string,
    batch: number,
    ruleType: string,
    confirmed: boolean,
  ) => {
    const ruleKey = ruleType; // manual 規則 key 就是 "manual"（無 period/value）
    setStrategies(prev => {
      const s = prev[stockCode];
      if (!s) return prev;
      const tranches = s.tranches.map(t => {
        if (t.batch !== batch) return t;
        return { ...t, ruleStatuses: { ...(t.ruleStatuses ?? {}), [ruleKey]: confirmed } };
      });
      return { ...prev, [stockCode]: { ...s, tranches } };
    });
    try {
      await updateRuleStatusApi(stockCode, batch, ruleType, confirmed);
    } catch {
      setStrategies(prev => {
        const s = prev[stockCode];
        if (!s) return prev;
        const tranches = s.tranches.map(t => {
          if (t.batch !== batch) return t;
          const statuses = { ...(t.ruleStatuses ?? {}) };
          statuses[ruleKey] = null;
          return { ...t, ruleStatuses: statuses };
        });
        return { ...prev, [stockCode]: { ...s, tranches } };
      });
    }
  }, []);

  const addExecution = useCallback(async (
    stockCode:      string,
    batch:          number,
    executedPrice:  number,
    executedShares: number,
    transactionId?: string,
    executedAt?:    string,
  ) => {
    const original = strategiesRef.current[stockCode];
    const now = executedAt ?? new Date().toISOString();

    // 樂觀更新：立即 append 至本地 executions
    setStrategies(prev => {
      const s = prev[stockCode];
      if (!s) return prev;
      const tranches = s.tranches.map(t => {
        if (t.batch !== batch) return t;
        const newExecutions = [
          ...t.executions,
          { transactionId: transactionId ?? '', executedAt: now, executedPrice, executedShares },
        ];
        const allDone = s.tranches.every(tr =>
          tr.batch === batch
            ? true
            : tr.executions.length > 0 || tr.status === 'skipped',
        );
        return { ...t, status: 'executed' as const, executions: newExecutions,
          ...(allDone ? {} : {}) };
      });
      const allDone = tranches.every(t => t.executions.length > 0 || t.status === 'skipped');
      return {
        ...prev,
        [stockCode]: { ...s, tranches, status: allDone ? 'completed' as const : s.status },
      };
    });

    try {
      const updated = await addTrancheExecutionApi(stockCode, batch, executedPrice, executedShares, transactionId, executedAt);
      setStrategies(prev => ({ ...prev, [stockCode]: updated }));
    } catch {
      if (original) {
        setStrategies(prev => ({ ...prev, [stockCode]: original }));
      }
    }
  }, []);

  return { strategies, loading, load, dismiss, remove, getStatus, confirmManualRule, addExecution };
}
