import { useState, useCallback, useRef, useEffect } from 'react';
import {
  fetchSystemStatus,
  testStockQuote,
  testHoldingPrices,
  testMarketIndices,
  triggerShioajiReinitialize,
} from '../models/systemModel';
import type {
  DiagResult,
  SystemStatusDTO,
  QuoteDiagData,
  HoldingPricesDiagData,
  MarketIndicesDiagData,
} from '../models/systemModel';

export type ReinitializeStatus = 'idle' | 'triggering' | 'polling' | 'success' | 'timeout' | 'error';

interface DiagState {
  statusResult:          DiagResult<SystemStatusDTO>       | null;
  stockQuoteResult:      DiagResult<QuoteDiagData>         | null;
  holdingPricesResult:   DiagResult<HoldingPricesDiagData> | null;
  marketIndicesResult:   DiagResult<MarketIndicesDiagData> | null;
  loadingStatus:         boolean;
  testingStock:          boolean;
  testingHoldings:       boolean;
  testingMarket:         boolean;
  lastTestedStock:       string;
  reinitializeStatus:    ReinitializeStatus;
  reinitializePollCount: number;
  reinitializeError:     string | null;
}

const INIT: DiagState = {
  statusResult:          null,
  stockQuoteResult:      null,
  holdingPricesResult:   null,
  marketIndicesResult:   null,
  loadingStatus:         false,
  testingStock:          false,
  testingHoldings:       false,
  testingMarket:         false,
  lastTestedStock:       '',
  reinitializeStatus:    'idle',
  reinitializePollCount: 0,
  reinitializeError:     null,
};

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_COUNT   = 10; // 10 × 2s = 20 秒逾時

export function useSystemDiagnosticsViewModel() {
  const [state, setState] = useState<DiagState>(INIT);
  const pollIntervalRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current !== null) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const loadStatus = useCallback(async () => {
    setState(s => ({ ...s, loadingStatus: true }));
    const result = await fetchSystemStatus();
    setState(s => ({ ...s, loadingStatus: false, statusResult: result }));
  }, []);

  const runStockQuoteTest = useCallback(async (stockId: string) => {
    setState(s => ({ ...s, testingStock: true, lastTestedStock: stockId }));
    const result = await testStockQuote(stockId);
    setState(s => ({ ...s, testingStock: false, stockQuoteResult: result }));
  }, []);

  const runHoldingPricesTest = useCallback(async () => {
    setState(s => ({ ...s, testingHoldings: true }));
    const result = await testHoldingPrices();
    setState(s => ({ ...s, testingHoldings: false, holdingPricesResult: result }));
  }, []);

  const runMarketIndicesTest = useCallback(async () => {
    setState(s => ({ ...s, testingMarket: true }));
    const result = await testMarketIndices();
    setState(s => ({ ...s, testingMarket: false, marketIndicesResult: result }));
  }, []);

  const runAllTests = useCallback(async (stockId: string) => {
    setState(s => ({
      ...s,
      loadingStatus:   true,
      testingStock:    true,
      testingHoldings: true,
      testingMarket:   true,
      lastTestedStock: stockId,
    }));
    const [sr, sqr, hpr, mir] = await Promise.all([
      fetchSystemStatus(),
      testStockQuote(stockId),
      testHoldingPrices(),
      testMarketIndices(),
    ]);
    setState(s => ({
      ...s,
      loadingStatus:       false,
      testingStock:        false,
      testingHoldings:     false,
      testingMarket:       false,
      statusResult:        sr,
      stockQuoteResult:    sqr,
      holdingPricesResult: hpr,
      marketIndicesResult: mir,
    }));
  }, []);

  const triggerReinitialize = useCallback(async () => {
    if (pollIntervalRef.current !== null) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    setState(s => ({
      ...s,
      reinitializeStatus:    'triggering',
      reinitializePollCount: 0,
      reinitializeError:     null,
    }));

    try {
      await triggerShioajiReinitialize();

      setState(s => ({ ...s, reinitializeStatus: 'polling', reinitializePollCount: 0 }));

      let count = 0;
      pollIntervalRef.current = setInterval(() => {
        count++;
        setState(s => ({ ...s, reinitializePollCount: count }));

        fetchSystemStatus().then(result => {
          setState(s => ({ ...s, statusResult: result }));

          const initialized = result.ok &&
            result.data?.apiSwitch?.providers?.shioaji?.initialized === true;

          if (initialized) {
            clearInterval(pollIntervalRef.current!);
            pollIntervalRef.current = null;
            setState(s => ({ ...s, reinitializeStatus: 'success' }));
          } else if (count >= MAX_POLL_COUNT) {
            clearInterval(pollIntervalRef.current!);
            pollIntervalRef.current = null;
            setState(s => ({ ...s, reinitializeStatus: 'timeout' }));
          }
        });
      }, POLL_INTERVAL_MS);

    } catch (err) {
      setState(s => ({
        ...s,
        reinitializeStatus: 'error',
        reinitializeError:  (err as Error).message,
      }));
    }
  }, []);

  const anyTesting =
    state.loadingStatus   ||
    state.testingStock    ||
    state.testingHoldings ||
    state.testingMarket;

  const reinitializing =
    state.reinitializeStatus === 'triggering' ||
    state.reinitializeStatus === 'polling';

  return {
    ...state,
    anyTesting,
    reinitializing,
    loadStatus,
    runStockQuoteTest,
    runHoldingPricesTest,
    runMarketIndicesTest,
    runAllTests,
    triggerReinitialize,
  };
}
