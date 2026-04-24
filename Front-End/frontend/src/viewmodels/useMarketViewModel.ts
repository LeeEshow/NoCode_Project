import { useState, useEffect, useCallback } from 'react';
import { fetchMarketData } from '../models/marketModel';
import type { MarketDataDTO } from '../types';

interface MarketState {
  data: MarketDataDTO | null;
  loading: boolean;
  error: string | null;
}

export function useMarketViewModel() {
  const [state, setState] = useState<MarketState>({
    data: null,
    loading: true,
    error: null,
  });

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const data = await fetchMarketData();
      setState({ data, loading: false, error: null });
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: (err as Error).message }));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { ...state, reload: load };
}
