import { useState, useEffect, useCallback } from 'react';
import {
  fetchWatchlist,
  createWatchlistItem,
  updateWatchlistItem,
  deleteWatchlistItem,
} from '../models/watchlistModel';
import { fetchSparklineData } from '../models/holdingModel';
import type { WatchlistItemDTO, CreateWatchlistPayload } from '../types';

interface State {
  items:      WatchlistItemDTO[];
  sparklines: Record<string, number[]>;
  loading:    boolean;
  saving:     boolean;
  error:      string | null;
}

async function loadSparklines(items: WatchlistItemDTO[]): Promise<Record<string, number[]>> {
  const entries = await Promise.all(
    items.map(async item => {
      const data = await fetchSparklineData(item.stockCode).catch(() => [] as number[]);
      return [item.stockCode, data] as [string, number[]];
    })
  );
  return Object.fromEntries(entries);
}

export function useWatchlistViewModel() {
  const [state, setState] = useState<State>({
    items: [], sparklines: {}, loading: true, saving: false, error: null,
  });

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const items = await fetchWatchlist();
      const sparklines = await loadSparklines(items);
      setState(s => ({ ...s, items, sparklines, loading: false }));
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: (err as Error).message }));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addItem = useCallback(async (
    payload: CreateWatchlistPayload,
    onSuccess?: () => void,
  ) => {
    setState(s => ({ ...s, saving: true, error: null }));
    try {
      await createWatchlistItem(payload);
      const items = await fetchWatchlist();
      const sparklines = await loadSparklines(items);
      setState(s => ({ ...s, items, sparklines, saving: false }));
      onSuccess?.();
    } catch (err) {
      setState(s => ({ ...s, saving: false, error: (err as Error).message }));
    }
  }, []);

  const updateItem = useCallback(async (
    id: string,
    payload: Partial<CreateWatchlistPayload>,
    onSuccess?: () => void,
  ) => {
    setState(s => ({ ...s, saving: true, error: null }));
    try {
      await updateWatchlistItem(id, payload);
      const items = await fetchWatchlist();
      const sparklines = await loadSparklines(items);
      setState(s => ({ ...s, items, sparklines, saving: false }));
      onSuccess?.();
    } catch (err) {
      setState(s => ({ ...s, saving: false, error: (err as Error).message }));
    }
  }, []);

  const removeItem = useCallback(async (id: string, onSuccess?: () => void) => {
    setState(s => ({ ...s, saving: true, error: null }));
    try {
      await deleteWatchlistItem(id);
      setState(s => ({ ...s, items: s.items.filter(i => i.id !== id), saving: false }));
      onSuccess?.();
    } catch (err) {
      setState(s => ({ ...s, saving: false, error: (err as Error).message }));
    }
  }, []);

  return { ...state, load, addItem, updateItem, removeItem };
}
