import { useState, useCallback, useEffect, useRef } from 'react';
import type { RebalanceRulesDTO } from '../types';
import { fetchRebalanceRules, saveRebalanceRules } from '../models/rebalanceRulesModel';

const DEFAULT_RULES: RebalanceRulesDTO = {
  baseThreshold:      0.05,
  liquidityCapRatio:  0.20,
  advLookbackDays:    20,
  concentrationLimit: 0.70,
};

export function useRebalanceRulesViewModel() {
  const [rules, setRules] = useState<RebalanceRulesDTO>(DEFAULT_RULES);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadRules = useCallback(async () => {
    try {
      const data = await fetchRebalanceRules();
      setRules(data);
    } catch { /* fallback to default */ }
  }, []);

  const updateRules = useCallback((patch: Partial<RebalanceRulesDTO>) => {
    setRules(prev => {
      const next = { ...prev, ...patch };
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        saveRebalanceRules(next).catch(() => { /* silent */ });
      }, 500);
      return next;
    });
  }, []);

  useEffect(() => {
    loadRules();
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [loadRules]);

  return { rules, loadRules, updateRules };
}
