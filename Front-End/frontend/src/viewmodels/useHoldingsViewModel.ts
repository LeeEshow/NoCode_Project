import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLatest } from '../utils/useLatest';
import { fetchHoldings, fetchSparklineData, fetchKLine, fetchStockProfile, fetchChipData, reorderHoldings, fetchHoldingPrices } from '../models/holdingModel';
import { addHoldingTag as apiAddHoldingTag, updateHoldingTag as apiUpdateHoldingTag, deleteHoldingTag as apiDeleteHoldingTag } from '../models/tagModel';
import type { HoldingDTO, KLineDTO, StockProfileDTO, ChipDTO, AddHoldingTagPayload, UpdateHoldingTagPayload } from '../types';
import { toast } from '../views/components/Toast';

export interface HoldingsSummary {
  totalUnrealized:  number;
  totalReturnPct:   number;
  totalDailyChange: number;
  totalCost:        number;
}

interface State {
  items:        HoldingDTO[];
  sparklines:   Record<string, number[]>;
  klines:       Record<string, KLineDTO[]>;
  profiles:     Record<string, StockProfileDTO>;
  chips:        Record<string, ChipDTO[]>;
  expandedCode: string | null;
  loading:      boolean;
  error:        string | null;
}

function computeSummary(items: HoldingDTO[]): HoldingsSummary {
  const totalUnrealized  = items.reduce((s, h) => s + h.unrealizedProfit, 0);
  const totalCost        = items.reduce((s, h) => s + h.totalCost, 0);
  const totalReturnPct   = totalCost > 0 ? (totalUnrealized / totalCost) * 100 : 0;
  const totalDailyChange = items.reduce((s, h) => s + h.change * h.shares, 0);
  return { totalUnrealized, totalReturnPct, totalDailyChange, totalCost };
}

const INIT: State = {
  items: [], sparklines: {}, klines: {}, profiles: {}, chips: {},
  expandedCode: null,
  loading: true, error: null,
};

export function useHoldingsViewModel() {
  const [state, setState] = useState<State>(INIT);
  const [order, setOrder] = useState<string[]>([]);
  const stateRef = useLatest(state);

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const rawItems = await fetchHoldings();
      const items = rawItems.map(h => ({ ...h, tags: h.tags ?? [] }));
      // 持股資料到手立即顯示，不等 sparkline
      setState(s => ({ ...s, items, loading: false }));
      // sparkline 在背景載入，完成後更新
      const sparklineEntries = await Promise.all(
        items.map(async h => {
          const data = await fetchSparklineData(h.stockCode).catch(() => [] as number[]);
          return [h.stockCode, data] as [string, number[]];
        })
      );
      setState(s => ({ ...s, sparklines: Object.fromEntries(sparklineEntries) }));
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

  /* summary 為 Derived Data，以 useMemo 計算，不存入 state */
  const summary = useMemo(() => computeSummary(state.items), [state.items]);

  /* 依 order 排序 items */
  const sortedItems = useMemo(() => {
    if (order.length === 0) return state.items;
    const map = new Map(state.items.map(h => [h.stockCode, h]));
    const ordered = order.map(code => map.get(code)).filter(Boolean) as HoldingDTO[];
    const rest = state.items.filter(h => !order.includes(h.stockCode));
    return [...ordered, ...rest];
  }, [state.items, order]);

  /* ── HoldingTag CRUD ── */

  const addHoldingTag = useCallback(async (
    stockCode: string,
    payload: AddHoldingTagPayload,
    onSuccess?: () => void,
  ) => {
    try {
      const tag = await apiAddHoldingTag(stockCode, payload);
      setState(s => ({
        ...s,
        items: s.items.map(h =>
          h.stockCode === stockCode ? { ...h, tags: [...h.tags, tag] } : h
        ),
      }));
      onSuccess?.();
    } catch (err) {
      toast.error(`新增標籤失敗：${(err as Error).message}`);
    }
  }, []);

  const updateHoldingTag = useCallback(async (
    stockCode: string,
    id: string,
    payload: UpdateHoldingTagPayload,
  ) => {
    try {
      const updated = await apiUpdateHoldingTag(stockCode, id, payload);
      setState(s => ({
        ...s,
        items: s.items.map(h =>
          h.stockCode === stockCode
            ? { ...h, tags: h.tags.map(t => t.id === id ? updated : t) }
            : h
        ),
      }));
    } catch (err) {
      toast.error(`更新配置比例失敗：${(err as Error).message}`);
    }
  }, []);

  const removeHoldingTag = useCallback(async (
    stockCode: string,
    id: string,
    onSuccess?: () => void,
  ) => {
    try {
      await apiDeleteHoldingTag(stockCode, id);
      setState(s => ({
        ...s,
        items: s.items.map(h =>
          h.stockCode === stockCode
            ? { ...h, tags: h.tags.filter(t => t.id !== id) }
            : h
        ),
      }));
      onSuccess?.();
    } catch (err) {
      toast.error(`移除標籤失敗：${(err as Error).message}`);
    }
  }, []);

  /* 批次預載所有持股 K 線（計算再平衡前呼叫，確保 ADV 資料齊全；回傳合併後的完整 klines）*/
  const fetchAllKlines = useCallback(async (): Promise<Record<string, KLineDTO[]>> => {
    const { items, klines } = stateRef.current;
    const missing = items.filter(h => !klines[h.stockCode]);
    if (missing.length === 0) return klines;
    const results = await Promise.allSettled(
      missing.map(h => fetchKLine(h.stockCode).then(data => ({ code: h.stockCode, data })))
    );
    const merged: Record<string, KLineDTO[]> = { ...klines };
    for (const r of results) {
      if (r.status === 'fulfilled') merged[r.value.code] = r.value.data;
    }
    setState(s => ({ ...s, klines: merged }));
    return merged;
  }, []);

  /* 拖拉重新排序 */
  const reorder = useCallback((newItems: HoldingDTO[]) => {
    const newOrder = newItems.map(h => h.stockCode);
    setOrder(newOrder);
    reorderHoldings(newOrder).catch(() => { /* 靜默，排序已在本地生效 */ });
  }, []);

  /* 靜默更新價格（盤中輪詢用，不觸發 loading，不重載 sparklines） */
  const refreshPrices = useCallback(async () => {
    try {
      const prices = await fetchHoldingPrices();
      const priceMap = new Map(prices.map(p => [p.stockCode, p]));
      setState(s => {
        const items = s.items.map(h => {
          const p = priceMap.get(h.stockCode);
          if (!p) return h;
          if (
            p.currentPrice === h.currentPrice &&
            p.change       === h.change       &&
            p.changePct    === h.changePct
          ) return h;
          const currentValue     = p.currentPrice * h.shares;
          const unrealizedProfit = currentValue - h.totalCost;
          const returnPct        = h.costAvg > 0 ? ((p.currentPrice - h.costAvg) / h.costAvg) * 100 : 0;
          return {
            ...h,
            currentPrice:     p.currentPrice,
            change:           p.change,
            changePct:        p.changePct,
            unrealizedProfit,
            currentValue,
            returnPct,
            isUp: p.changePct > 0,
          };
        });
        /* 所有 item reference 均未變動時，回傳同一 state 避免整頁 re-render */
        if (items.every((h, i) => h === s.items[i])) return s;
        return { ...s, items };
      });
    } catch { /* 靜默，輪詢失敗不影響 UI */ }
  }, []);

  /* 新增/刪除交易後刷新庫存 */
  const refreshAfterTx = useCallback(async () => { await load(); }, [load]);

  return {
    ...state,
    items: sortedItems,
    summary,
    load,
    refreshPrices,
    toggleExpand,
    ensureExpandData,
    fetchAllKlines,
    refreshAfterTx,
    reorder,
    chips: state.chips,
    addHoldingTag,
    updateHoldingTag,
    removeHoldingTag,
  };
}
