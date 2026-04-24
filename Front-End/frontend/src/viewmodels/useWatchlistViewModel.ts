import { useState, useEffect, useCallback } from 'react';
import {
  fetchWatchlist,
  createWatchlistItem,
  updateWatchlistItem,
  deleteWatchlistItem,
} from '../models/watchlistModel';
import type { WatchlistItemDTO, CreateWatchlistPayload } from '../types';

interface State {
  items:   WatchlistItemDTO[];
  loading: boolean;
  saving:  boolean;
  error:   string | null;
}

export function useWatchlistViewModel() {
  const [state, setState] = useState<State>({
    items: [], loading: true, saving: false, error: null,
  });

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const items = await fetchWatchlist();
      setState(s => ({ ...s, items, loading: false }));
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
      const item = await createWatchlistItem(payload);
      setState(s => ({ ...s, items: [...s.items, item], saving: false }));
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
      const updated = await updateWatchlistItem(id, payload);
      setState(s => ({
        ...s,
        items: s.items.map(i => i.id === id ? updated : i),
        saving: false,
      }));
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
