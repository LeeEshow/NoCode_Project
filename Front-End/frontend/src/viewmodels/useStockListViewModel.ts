import { useState, useCallback, useEffect } from 'react';
import { fetchStockListMeta, triggerStockListRefresh } from '../models/stockListModel';

interface State {
  count:      number;
  updatedAt:  string | null;
  loading:    boolean;
  refreshing: boolean;
  error:      string | null;
}

const INIT: State = {
  count: 0, updatedAt: null, loading: true, refreshing: false, error: null,
};

export function useStockListViewModel() {
  const [state, setState] = useState<State>(INIT);

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const meta = await fetchStockListMeta();
      setState(s => ({ ...s, count: meta.count, updatedAt: meta.updatedAt, loading: false }));
    } catch {
      setState(s => ({ ...s, loading: false, error: '無法載入股票清單資訊' }));
    }
  }, []);

  const refresh = useCallback(async () => {
    setState(s => ({ ...s, refreshing: true, error: null }));
    try {
      const meta = await triggerStockListRefresh();
      setState(s => ({ ...s, count: meta.count, updatedAt: meta.updatedAt, refreshing: false }));
      return meta;
    } catch {
      setState(s => ({ ...s, refreshing: false, error: '更新股票清單失敗' }));
      throw new Error('更新股票清單失敗');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { ...state, refresh };
}
