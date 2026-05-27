import { useState, useCallback } from 'react';
import {
  fetchSystemStatus,
  testStockQuote,
  testHoldingPrices,
  testMarketIndices,
} from '../models/systemModel';
import type {
  DiagResult,
  SystemStatusDTO,
  QuoteDiagData,
  HoldingPricesDiagData,
  MarketIndicesDiagData,
} from '../models/systemModel';

interface DiagState {
  statusResult:        DiagResult<SystemStatusDTO>       | null;
  stockQuoteResult:    DiagResult<QuoteDiagData>         | null;
  holdingPricesResult: DiagResult<HoldingPricesDiagData> | null;
  marketIndicesResult: DiagResult<MarketIndicesDiagData> | null;
  loadingStatus:       boolean;
  testingStock:        boolean;
  testingHoldings:     boolean;
  testingMarket:       boolean;
  lastTestedStock:     string;
}

const INIT: DiagState = {
  statusResult:        null,
  stockQuoteResult:    null,
  holdingPricesResult: null,
  marketIndicesResult: null,
  loadingStatus:       false,
  testingStock:        false,
  testingHoldings:     false,
  testingMarket:       false,
  lastTestedStock:     '',
};

export function useSystemDiagnosticsViewModel() {
  const [state, setState] = useState<DiagState>(INIT);

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

  const anyTesting =
    state.loadingStatus  ||
    state.testingStock   ||
    state.testingHoldings||
    state.testingMarket;

  return {
    ...state,
    anyTesting,
    loadStatus,
    runStockQuoteTest,
    runHoldingPricesTest,
    runMarketIndicesTest,
    runAllTests,
  };
}
