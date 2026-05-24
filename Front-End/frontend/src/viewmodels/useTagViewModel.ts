import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  fetchTags,
  createTag,
  updateTag as apiUpdateTag,
  deleteTag,
  fetchAssetTags,
  createAssetTag,
  updateAssetTag as apiUpdateAssetTag,
  deleteAssetTag,
  fetchMarketState,
  setMarketState as apiSetMarketState,
  fetchCorrelationMatrix,
  saveCorrelationMatrix as apiSaveCorrelationMatrix,
  recalculateDynamicRisk as apiRecalculateDynamicRisk,
} from '../models/tagModel';
import type {
  TagDTO,
  AssetTagDTO,
  CreateTagPayload,
  CreateAssetTagPayload,
  UpdateAssetTagPayload,
  MarketState,
  CorrelationEntry,
} from '../types';
import { toast } from '../views/components/Toast';

interface State {
  tags:                 TagDTO[];
  assetTags:            AssetTagDTO[];
  correlationMatrix:    CorrelationEntry[];
  marketState:          MarketState;
  loading:              boolean;
  correlationLoading:   boolean;
  correlationLoadFailed: boolean;
  saving:               boolean;
  marketStateChanging:  boolean;
  error:                string | null;
}

const INIT: State = {
  tags: [], assetTags: [], correlationMatrix: [],
  marketState: 'neutral',
  loading: true, correlationLoading: true, correlationLoadFailed: false,
  saving: false, marketStateChanging: false, error: null,
};

/*
 * 模組層級快取：記住最後一次從 API 取得的市場狀態。
 * useTagViewModel 每次（重新）掛載都會用此值作為初始值，
 * 避免頁面切換後元件重建時短暫顯示「中性」的閃爍。
 */
let _cachedMarketState: MarketState = 'neutral';

export function useTagViewModel() {
  /* 初始狀態：優先使用模組快取，確保導覽回來時不閃爍 */
  const [state, setState] = useState<State>(() => ({
    ...INIT,
    marketState: _cachedMarketState,
  }));

  /* 初始載入 */
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchTags(), fetchAssetTags(), fetchMarketState()])
      .then(([tags, assetTags, { current: marketState }]) => {
        if (cancelled) return;
        /* 更新模組快取，讓下次重掛載時直接顯示正確狀態 */
        _cachedMarketState = marketState;
        /*
         * 使用 functional update，只覆蓋需要的欄位。
         * 不重置 correlationMatrix / correlationLoading：
         * 這兩個欄位由 loadCorrelationMatrix 獨立管理，
         * 若此處用全量替換且兩個 Promise 競速，會把已載好的矩陣清空。
         */
        setState(s => ({
          ...s,
          tags,
          assetTags,
          marketState,
          loading: false,
          saving: false,
          marketStateChanging: false,
          error: null,
        }));
      })
      .catch(err => {
        if (cancelled) return;
        setState(s => ({ ...s, loading: false, error: (err as Error).message }));
      });
    return () => { cancelled = true; };
  }, []);

  /* 個別 reload */
  const loadTags = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const tags = await fetchTags();
      setState(s => ({ ...s, tags, loading: false }));
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: (err as Error).message }));
    }
  }, []);

  const loadAssetTags = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const assetTags = await fetchAssetTags();
      setState(s => ({ ...s, assetTags, loading: false }));
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: (err as Error).message }));
    }
  }, []);

  /* 市場狀態 */
  const loadCorrelationMatrix = useCallback(async () => {
    setState(s => ({ ...s, correlationLoading: true, correlationLoadFailed: false }));
    const MAX_RETRIES = 2;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const { entries } = await fetchCorrelationMatrix();
        setState(s => ({ ...s, correlationMatrix: entries, correlationLoading: false, correlationLoadFailed: false }));
        return;
      } catch (err) {
        const retryable = (err as Error & { retryable?: boolean }).retryable === true;
        if (attempt < MAX_RETRIES && retryable) {
          await new Promise(res => setTimeout(res, (attempt + 1) * 2_000));
          continue;
        }
        setState(s => ({ ...s, correlationLoading: false, correlationLoadFailed: true }));
      }
    }
  }, []);

  const changeMarketState = useCallback(async (newState: MarketState) => {
    setState(s => ({ ...s, marketStateChanging: true }));
    try {
      await apiSetMarketState(newState);
      const tags = await fetchTags(); /* dynamicRisk 由後端依新狀態重算 */
      _cachedMarketState = newState; /* 更新模組快取 */
      setState(s => ({ ...s, marketState: newState, tags, marketStateChanging: false }));
    } catch (err) {
      setState(s => ({ ...s, marketStateChanging: false, error: (err as Error).message }));
      toast.error('市場狀態切換失敗');
    }
  }, []);

  /* 批次重算所有 Tag 動態風險（後端計算，完成後重新 fetch tags）*/
  const recalculateAllDynamicRisk = useCallback(async (marketState: MarketState) => {
    setState(s => ({ ...s, saving: true, error: null }));
    try {
      const { updatedCount, skippedCount } = await apiRecalculateDynamicRisk(marketState);
      const tags = await fetchTags();
      setState(s => ({ ...s, tags, saving: false }));
      if (skippedCount > 0) {
        toast.success(`動態風險已更新（${updatedCount} 個），${skippedCount} 個 Tag 無持股對應，已跳過`);
      } else {
        toast.success(`已更新 ${updatedCount} 個 Tag 的動態風險`);
      }
    } catch (err) {
      setState(s => ({ ...s, saving: false, error: (err as Error).message }));
      toast.error('動態風險批次計算失敗');
    }
  }, []);

  /* 相關性矩陣 */
  const saveCorrelationMatrix = useCallback(async (entries: CorrelationEntry[]) => {
    try {
      await apiSaveCorrelationMatrix(entries);
      setState(s => ({ ...s, correlationMatrix: entries }));
    } catch (err) {
      toast.error('相關性矩陣儲存失敗');
      throw err;
    }
  }, []);

  /* ── Tag CRUD ── */

  const addTag = useCallback(async (payload: CreateTagPayload, onSuccess?: () => void) => {
    setState(s => ({ ...s, saving: true, error: null }));
    try {
      const tag = await createTag(payload);
      setState(s => ({ ...s, tags: [...s.tags, tag], saving: false }));
      onSuccess?.();
    } catch (err) {
      setState(s => ({ ...s, saving: false, error: (err as Error).message }));
    }
  }, []);

  const updateTag = useCallback(async (
    id: string,
    payload: Partial<CreateTagPayload>,
    onSuccess?: () => void,
  ) => {
    setState(s => ({ ...s, saving: true, error: null }));
    try {
      const updated = await apiUpdateTag(id, payload);
      setState(s => ({ ...s, tags: s.tags.map(t => t.id === id ? updated : t), saving: false }));
      onSuccess?.();
    } catch (err) {
      setState(s => ({ ...s, saving: false, error: (err as Error).message }));
    }
  }, []);

  const removeTag = useCallback(async (id: string, onSuccess?: () => void) => {
    setState(s => ({ ...s, saving: true, error: null }));
    try {
      await deleteTag(id);
      setState(s => ({ ...s, tags: s.tags.filter(t => t.id !== id), saving: false }));
      onSuccess?.();
    } catch (err) {
      const msg = (err as Error).message;
      setState(s => ({ ...s, saving: false, error: msg }));
      toast.error(msg);
    }
  }, []);

  /* ── Asset-Tag CRUD ── */

  const addAssetTag = useCallback(async (payload: CreateAssetTagPayload, onSuccess?: () => void) => {
    setState(s => ({ ...s, saving: true, error: null }));
    try {
      const assetTag = await createAssetTag(payload);
      setState(s => ({ ...s, assetTags: [...s.assetTags, assetTag], saving: false }));
      onSuccess?.();
    } catch (err) {
      setState(s => ({ ...s, saving: false, error: (err as Error).message }));
    }
  }, []);

  const updateAssetTag = useCallback(async (id: string, payload: UpdateAssetTagPayload) => {
    setState(s => ({ ...s, saving: true, error: null }));
    try {
      const updated = await apiUpdateAssetTag(id, payload);
      setState(s => ({ ...s, assetTags: s.assetTags.map(at => at.id === id ? updated : at), saving: false }));
    } catch (err) {
      const msg = (err as Error).message;
      setState(s => ({ ...s, saving: false, error: msg }));
      toast.error(`更新配置比例失敗：${msg}`);
    }
  }, []);

  const removeAssetTag = useCallback(async (id: string, onSuccess?: () => void) => {
    setState(s => ({ ...s, saving: true, error: null }));
    try {
      await deleteAssetTag(id);
      setState(s => ({ ...s, assetTags: s.assetTags.filter(at => at.id !== id), saving: false }));
      onSuccess?.();
    } catch (err) {
      setState(s => ({ ...s, saving: false, error: (err as Error).message }));
    }
  }, []);

  /* Derived：依股票代號分組（A-01：useMemo，不存 state） */
  const assetTagsByStock = useMemo(() => {
    const map: Record<string, AssetTagDTO[]> = {};
    for (const at of state.assetTags) {
      (map[at.stockCode] ??= []).push(at);
    }
    return map;
  }, [state.assetTags]);

  return {
    ...state,
    loadTags,
    loadAssetTags,
    loadCorrelationMatrix,
    changeMarketState,
    saveCorrelationMatrix,
    recalculateAllDynamicRisk,
    addTag,
    updateTag,
    removeTag,
    addAssetTag,
    updateAssetTag,
    removeAssetTag,
    assetTagsByStock,
  };
}
