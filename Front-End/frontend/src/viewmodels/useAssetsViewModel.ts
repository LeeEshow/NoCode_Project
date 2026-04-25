import { useState, useEffect, useCallback } from 'react';
import {
  fetchForeignAssets,
  createForeignAsset,
  updateForeignAsset,
  deleteForeignAsset,
} from '../models/foreignAssetModel';
import type { ForeignAssetDTO, CreateForeignAssetPayload } from '../types';

interface State {
  items:   ForeignAssetDTO[];
  loading: boolean;
  saving:  boolean;
  error:   string | null;
}

export function useAssetsViewModel() {
  const [state, setState] = useState<State>({
    items: [], loading: true, saving: false, error: null,
  });

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const items = await fetchForeignAssets();
      setState(s => ({ ...s, items, loading: false }));
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: (err as Error).message }));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addItem = useCallback(async (
    payload: CreateForeignAssetPayload,
    onSuccess?: () => void,
  ) => {
    setState(s => ({ ...s, saving: true, error: null }));
    try {
      const created = await createForeignAsset(payload);
      setState(s => ({ ...s, items: [...s.items, created], saving: false }));
      onSuccess?.();
    } catch (err) {
      setState(s => ({ ...s, saving: false, error: (err as Error).message }));
    }
  }, []);

  const editItem = useCallback(async (
    id: string,
    payload: Partial<CreateForeignAssetPayload>,
    onSuccess?: () => void,
  ) => {
    setState(s => ({ ...s, saving: true, error: null }));
    try {
      const updated = await updateForeignAsset(id, payload);
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
      await deleteForeignAsset(id);
      setState(s => ({
        ...s,
        items: s.items.filter(i => i.id !== id),
        saving: false,
      }));
      onSuccess?.();
    } catch (err) {
      setState(s => ({ ...s, saving: false, error: (err as Error).message }));
    }
  }, []);

  /* 台幣總計：amount × 有效匯率（台幣幣別匯率視為 1） */
  const totalTwd = state.items.reduce((sum, item) => {
    if (item.currency === 'TWD') return sum + item.amount;
    const rate = item.useManualRate ? item.manualRate : (item.liveRate ?? 0);
    return sum + item.amount * rate;
  }, 0);

  return {
    ...state,
    load,
    addItem,
    editItem,
    removeItem,
    totalTwd,
  };
}
