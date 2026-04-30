import { useState, useEffect, useCallback } from 'react';
import { fetchMarketData } from '../models/marketModel';
import type { MarketDataDTO } from '../types';

interface MarketState {
  data:        MarketDataDTO | null;
  loading:     boolean;
  error:       string | null;
  lastUpdated: Date | null;
}

export function useMarketViewModel() {
  const [state, setState] = useState<MarketState>({
    data: null, loading: true, error: null, lastUpdated: null,
  });

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const data = await fetchMarketData();
      setState({ data, loading: false, error: null, lastUpdated: new Date() });
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: (err as Error).message }));
    }
  }, []);

  const silentReload = useCallback(async () => {
    try {
      const data = await fetchMarketData();
      setState(s => ({ ...s, data, lastUpdated: new Date() }));
    } catch { /* 靜默，輪詢失敗不影響 UI */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { ...state, reload: load, silentReload };
}
