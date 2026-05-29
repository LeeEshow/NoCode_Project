import api from '../api/axios';
import type { ApiResponse } from '../types';

/* ── 診斷專用型別（不入全域 types/index.ts）── */

export interface SystemStatusDTO {
  /** 後端 /system/status 實際結構（apiSwitch = get_switch_status() 回傳值） */
  apiSwitch: {
    source:         string;
    marketOpen:     boolean;
    shioajiEnabled: boolean;
    circuit: {
      state:        string;
      failureCount: number;
    };
    providers: {
      shioaji: {
        enabled:          boolean;
        initialized:      boolean;
        connected:        boolean;
        reinitializing?:  boolean;
        subscribedStocks: number;
        cachedStocks:     number;
      };
    };
  };
}

export interface DiagResult<T> {
  ok:        boolean;
  elapsedMs: number;
  data:      T | null;
  error:     string | null;
  degraded:  boolean;  /* 後端回 200 但 quoteStatus 非 ok（降級回應） */
}

export interface QuoteDiagData {
  price:         number;
  change:        number;
  changePercent: number;
  marketStatus:  string;
  updatedAt:     string;
  quoteSource:   string;
  quoteStatus:   string;
}

export interface HoldingPricesDiagData {
  count:   number;
  preview: Array<{ stockCode: string; currentPrice: number; quoteStatus?: string }>;
}

export interface MarketIndicesDiagData {
  count:      number;
  hasTwii:    boolean;
  hasFutures: boolean;
}

/* ── 計時包裝 ── */
async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; elapsedMs: number }> {
  const t0 = Date.now();
  const result = await fn();
  return { result, elapsedMs: Date.now() - t0 };
}

/* ── API 呼叫 ── */

export async function fetchSystemStatus(): Promise<DiagResult<SystemStatusDTO>> {
  const t0 = Date.now();
  try {
    const { result, elapsedMs } = await timed(() =>
      api.get<ApiResponse<SystemStatusDTO>>('/system/status').then(r => r.data.data)
    );
    return { ok: true, elapsedMs, data: result, error: null, degraded: false };
  } catch (err) {
    return { ok: false, elapsedMs: Date.now() - t0, data: null, error: (err as Error).message, degraded: false };
  }
}

interface RawQuoteResponse {
  price?:         number;
  change?:        number;
  changePercent?: number;
  marketStatus?:  string;
  updatedAt?:     string;
  quoteSource?:   string;
  quoteStatus?:   string;
}

export async function testStockQuote(stockId: string): Promise<DiagResult<QuoteDiagData>> {
  const t0 = Date.now();
  try {
    const { result: raw, elapsedMs } = await timed(() =>
      api.get<ApiResponse<RawQuoteResponse>>(`/stocks/${stockId}/quote`).then(r => r.data.data)
    );
    const quoteStatus = raw.quoteStatus ?? 'ok';
    const data: QuoteDiagData = {
      price:         raw.price         ?? 0,
      change:        raw.change        ?? 0,
      changePercent: raw.changePercent ?? 0,
      marketStatus:  raw.marketStatus  ?? '',
      updatedAt:     raw.updatedAt     ?? '',
      quoteSource:   raw.quoteSource   ?? '',
      quoteStatus,
    };
    return { ok: true, elapsedMs, data, error: null, degraded: quoteStatus !== 'ok' };
  } catch (err) {
    return { ok: false, elapsedMs: Date.now() - t0, data: null, error: (err as Error).message, degraded: false };
  }
}

interface RawHoldingPrice {
  stockCode?:    string;
  currentPrice?: number;
  quoteStatus?:  string;
}

export async function testHoldingPrices(): Promise<DiagResult<HoldingPricesDiagData>> {
  const t0 = Date.now();
  try {
    const { result: raw, elapsedMs } = await timed(() =>
      api.get<ApiResponse<RawHoldingPrice[]>>('/holdings/prices').then(r => r.data.data)
    );
    const data: HoldingPricesDiagData = {
      count:   raw.length,
      preview: raw.slice(0, 3).map(p => ({
        stockCode:    p.stockCode    ?? '',
        currentPrice: p.currentPrice ?? 0,
        quoteStatus:  p.quoteStatus,
      })),
    };
    return { ok: true, elapsedMs, data, error: null, degraded: false };
  } catch (err) {
    return { ok: false, elapsedMs: Date.now() - t0, data: null, error: (err as Error).message, degraded: false };
  }
}

interface RawIndexCard {
  id:    string;
  name:  string;
  price: number | null;
}

export async function triggerShioajiReinitialize(): Promise<void> {
  await api.post('/system/shioaji/reinitialize');
}

export async function testMarketIndices(): Promise<DiagResult<MarketIndicesDiagData>> {
  const t0 = Date.now();
  try {
    const { result: raw, elapsedMs } = await timed(() =>
      api.get<ApiResponse<RawIndexCard[]>>('/market/indices').then(r => r.data.data)
    );
    const data: MarketIndicesDiagData = {
      count:      raw.length,
      hasTwii:    raw.some(i => i.id === 'TWII' || i.name.includes('加權')),
      hasFutures: raw.some(i => i.id === 'TX'   || i.name.includes('期貨')),
    };
    return { ok: true, elapsedMs, data, error: null, degraded: false };
  } catch (err) {
    return { ok: false, elapsedMs: Date.now() - t0, data: null, error: (err as Error).message, degraded: false };
  }
}
