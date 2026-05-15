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
  tags:                TagDTO[];
  assetTags:           AssetTagDTO[];
  correlationMatrix:   CorrelationEntry[];
  marketState:         MarketState;
  loading:             boolean;
  saving:              boolean;
  marketStateChanging: boolean;
  error:               string | null;
}

const INIT: State = {
  tags: [], assetTags: [], correlationMatrix: [],
  marketState: 'neutral',
  loading: true, saving: false, marketStateChanging: false, error: null,
};

export function useTagViewModel() {
  const [state, setState] = useState<State>(INIT);

  /* 初始載入 */
  useEffect(() => {
    Promise.all([fetchTags(), fetchAssetTags(), fetchMarketState()])
      .then(([tags, assetTags, { current: marketState }]) => {
        setState({ tags, assetTags, correlationMatrix: [], marketState, loading: false, saving: false, marketStateChanging: false, error: null });
      })
      .catch(err => {
        setState(s => ({ ...s, loading: false, error: (err as Error).message }));
      });
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
    try {
      const { entries } = await fetchCorrelationMatrix();
      setState(s => ({ ...s, correlationMatrix: entries }));
    } catch {
      /* 靜默：矩陣載入失敗不影響其他功能 */
    }
  }, []);

  const changeMarketState = useCallback(async (newState: MarketState) => {
    setState(s => ({ ...s, marketStateChanging: true }));
    try {
      await apiSetMarketState(newState);
      const tags = await fetchTags(); /* dynamicRisk 由後端依新狀態重算 */
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
    try {
      const updated = await apiUpdateAssetTag(id, payload);
      setState(s => ({ ...s, assetTags: s.assetTags.map(at => at.id === id ? updated : at) }));
    } catch (err) {
      setState(s => ({ ...s, error: (err as Error).message }));
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
