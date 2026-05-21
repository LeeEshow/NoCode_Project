import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLatest } from '../utils/useLatest';
import {
  fetchWatchlist,
  createWatchlistItem,
  updateWatchlistItem,
  deleteWatchlistItem,
  reorderWatchlist,
} from '../models/watchlistModel';
import { fetchSparklineData, fetchKLine, fetchStockProfile, fetchChipData } from '../models/holdingModel';
import type { WatchlistItemDTO, CreateWatchlistPayload, KLineDTO, StockProfileDTO, ChipDTO } from '../types';

interface State {
  items:        WatchlistItemDTO[];
  sparklines:   Record<string, number[]>;
  klines:       Record<string, KLineDTO[]>;
  profiles:     Record<string, StockProfileDTO>;
  chips:        Record<string, ChipDTO[]>;
  expandedCode: string | null;
  loading:      boolean;
  saving:       boolean;
  error:        string | null;
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
    items: [], sparklines: {}, klines: {}, profiles: {}, chips: {},
    expandedCode: null, loading: true, saving: false, error: null,
  });
  const [order, setOrder] = useState<string[]>([]);
  const stateRef = useLatest(state);

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

  const toggleExpand = useCallback((code: string) => {
    setState(s => ({ ...s, expandedCode: s.expandedCode === code ? null : code }));
  }, []);

  const ensureExpandData = useCallback(async (code: string) => {
    const { klines, profiles, chips } = stateRef.current;
    const [kline, profile, chip] = await Promise.all([
      klines[code]   ? null : fetchKLine(code).catch(() => null),
      profiles[code] ? null : fetchStockProfile(code).catch(() => null),
      chips[code]    ? null : fetchChipData(code).catch(() => null),
    ]);
    setState(s => ({
      ...s,
      ...(kline   ? { klines:   { ...s.klines,   [code]: kline }   } : {}),
      ...(profile ? { profiles: { ...s.profiles, [code]: profile } } : {}),
      ...(chip    ? { chips:    { ...s.chips,    [code]: chip }    } : {}),
    }));
  }, []);

  const addItem = useCallback(async (
    payload: CreateWatchlistPayload,
    onSuccess?: () => void,
  ) => {
    setState(s => ({ ...s, saving: true, error: null }));
    try {
      const newItem  = await createWatchlistItem(payload);
      const sparkline = await fetchSparklineData(newItem.stockCode).catch(() => [] as number[]);
      setState(s => ({
        ...s,
        items:     [...s.items, newItem],
        sparklines: { ...s.sparklines, [newItem.stockCode]: sparkline },
        saving: false,
      }));
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
        items:  s.items.map(i => i.id === id ? updated : i),
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

  const sortedItems = useMemo(() => {
    if (order.length === 0) return state.items;
    const map = new Map(state.items.map(i => [i.id, i]));
    const ordered = order.map(id => map.get(id)).filter(Boolean) as WatchlistItemDTO[];
    const rest = state.items.filter(i => !order.includes(i.id));
    return [...ordered, ...rest];
  }, [state.items, order]);

  const reorder = useCallback((newItems: WatchlistItemDTO[]) => {
    const newOrder = newItems.map(i => i.id);
    setOrder(newOrder);
    reorderWatchlist(newOrder).catch(() => { /* 靜默，排序已在本地生效 */ });
  }, []);

  /* 盤中輪詢用，靜默重新取得含即時報價的清單，不觸發 loading */
  const silentReload = useCallback(async () => {
    try {
      const items = await fetchWatchlist();
      setState(s => ({ ...s, items }));
    } catch { /* 輪詢失敗靜默 */ }
  }, []);

  return { ...state, items: sortedItems, load, toggleExpand, ensureExpandData, addItem, updateItem, removeItem, reorder, silentReload };
}
