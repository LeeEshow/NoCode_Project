import axios from 'axios';
import { yfChart, yfQuoteSummary } from '../global/yahooFinance';
import { getOrSet } from '../global/cache';

// ── 型別定義 ────────────────────────────────────────────────────────────────

export interface StockSearchResult {
  stockId: string;
  name: string;
  market: 'TSE' | 'OTC';
}

export interface StockQuote {
  stockId: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  volume: number;
  marketStatus: string;
  updatedAt: number;
}

export interface StockHistoryPoint {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockProfile {
  stockId: string;
  name: string;
  market: string;
  peRatio: number | null;
  dividendYield: number | null;  // 百分比，e.g. 4.5 = 4.5%
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  marketCap: number | null;
  discountPremiumRate: number | null; // ETF 折溢價率（預留）
}

// ── Model ───────────────────────────────────────────────────────────────────

export class Stock {
  // ── 搜尋 ──────────────────────────────────────────────────────────────────

  /** 搜尋股票（含 TSE + OTC），完整清單快取 3600s，前端關鍵字過濾 */
  static async search(q: string): Promise<StockSearchResult[]> {
    const allStocks = await getOrSet(
      'stocks:all-list',
      () => Stock.fetchAllStockList(),
      3600,
      stocks => stocks.length > 0  // 空結果不快取，下次請求會重新抓取
    );
    const keyword = q.toLowerCase().trim();
    return allStocks
      .filter(
        s =>
          s.stockId.startsWith(keyword) ||
          s.name.toLowerCase().includes(keyword)
      )
      .slice(0, 20);
  }

  /** 抓取 TWSE + TPEX 全股清單 */
  private static async fetchAllStockList(): Promise<StockSearchResult[]> {
    const [tseRes, otcRes] = await Promise.allSettled([
      axios.get('https://openapi.twse.com.tw/v1/opendata/t187ap03_L', {
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      }),
      axios.get(
        'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis',
        {
          timeout: 10000,
          headers: { 'User-Agent': 'Mozilla/5.0' },
        }
      ),
    ]);

    const results: StockSearchResult[] = [];

    if (tseRes.status === 'rejected') {
      console.error('[Stock] TWSE API 失敗:', tseRes.reason?.message ?? tseRes.reason);
    } else if (Array.isArray(tseRes.value.data)) {
      for (const item of tseRes.value.data) {
        const id   = item['公司代號']?.trim();
        const name = item['公司名稱']?.trim();
        if (id && name) results.push({ stockId: id, name, market: 'TSE' });
      }
    }

    if (otcRes.status === 'rejected') {
      console.error('[Stock] TPEX API 失敗:', otcRes.reason?.message ?? otcRes.reason);
    } else if (Array.isArray(otcRes.value.data)) {
      for (const item of otcRes.value.data) {
        const id   = (item['SecuritiesCompanyCode'] ?? item['代號'] ?? '')
          .toString()
          .trim();
        const name = (item['CompanyName'] ?? item['名稱'] ?? '')
          .toString()
          .trim();
        if (id && name) results.push({ stockId: id, name, market: 'OTC' });
      }
    }

    console.log(`[Stock] 股票清單載入完成：TSE+OTC 共 ${results.length} 筆`);
    return results;
  }

  // ── 即時報價 ──────────────────────────────────────────────────────────────

  /** 取得即時報價（Yahoo Finance v8 chart），TTL 由 controller 的 cache 控管 */
  static async getQuote(stockId: string): Promise<StockQuote> {
    const symbol = await Stock.resolveSymbol(stockId);
    const result = await yfChart(symbol, { interval: '1d', range: '1d' });
    const meta   = result.meta;

    const price         = meta.regularMarketPrice as number;
    const prev          = meta.chartPreviousClose as number;
    const change        = +(price - prev).toFixed(2);
    const changePercent = +(((price - prev) / prev) * 100).toFixed(2);

    return {
      stockId,
      name:         meta.longName ?? meta.shortName ?? stockId,
      price,
      change,
      changePercent,
      high:         meta.regularMarketDayHigh,
      low:          meta.regularMarketDayLow,
      volume:       meta.regularMarketVolume,
      marketStatus: meta.marketState ?? 'CLOSED',
      updatedAt:    meta.regularMarketTime,
    };
  }

  // ── 歷史 K 線 ─────────────────────────────────────────────────────────────

  /** 取得歷史 OHLCV 資料（Yahoo Finance v8 chart） */
  static async getHistory(
    stockId: string,
    days = 90
  ): Promise<StockHistoryPoint[]> {
    const symbol = await Stock.resolveSymbol(stockId);
    const range  = daysToRange(days);
    const result = await yfChart(symbol, { interval: '1d', range });

    const timestamps: number[]   = result.timestamp ?? [];
    const quotes = result.indicators?.quote?.[0];
    if (!quotes) return [];

    return timestamps
      .map((ts: number, i: number) => ({
        timestamp: ts,
        open:   quotes.open?.[i]   ?? 0,
        high:   quotes.high?.[i]   ?? 0,
        low:    quotes.low?.[i]    ?? 0,
        close:  quotes.close?.[i]  ?? 0,
        volume: quotes.volume?.[i] ?? 0,
      }))
      .filter(p => p.close > 0);
  }

  // ── 股票基礎數據 ──────────────────────────────────────────────────────────

  /**
   * 取得股票基礎數據
   * - 主要來源：Yahoo Finance v8 chart（52週高低、成交量）
   * - 補充來源：Yahoo Finance v10 quoteSummary（本益比、殖利率、市值）
   */
  static async getProfile(stockId: string): Promise<StockProfile> {
    const symbol      = await Stock.resolveSymbol(stockId);
    const chartResult = await yfChart(symbol, { interval: '1d', range: '1d' });
    const meta        = chartResult.meta;

    let peRatio: number | null       = null;
    let dividendYield: number | null = null;
    let marketCap: number | null     = null;

    try {
      const summary = await yfQuoteSummary(
        symbol,
        'summaryDetail,defaultKeyStatistics,price'
      );
      if (summary) {
        const sd  = summary.summaryDetail;
        const pr  = summary.price;
        peRatio       = sd?.trailingPE?.raw ?? null;
        dividendYield =
          sd?.dividendYield?.raw != null
            ? +(sd.dividendYield.raw * 100).toFixed(2)
            : null;
        marketCap = pr?.marketCap?.raw ?? sd?.marketCap?.raw ?? null;
      }
    } catch {
      // v10 失敗不影響主要欄位
    }

    return {
      stockId,
      name:               meta.longName ?? meta.shortName ?? stockId,
      market:             meta.exchangeName ?? '',
      peRatio,
      dividendYield,
      fiftyTwoWeekHigh:   meta.fiftyTwoWeekHigh,
      fiftyTwoWeekLow:    meta.fiftyTwoWeekLow,
      marketCap,
      discountPremiumRate: null,
    };
  }

  // ── 私有工具 ──────────────────────────────────────────────────────────────

  /**
   * 解析 Yahoo Finance 代號
   * 優先從快取的全股清單判斷市場；找不到時預設 TSE (.TW)
   */
  static async resolveSymbol(stockId: string): Promise<string> {
    try {
      const allStocks = await getOrSet(
        'stocks:all-list',
        () => Stock.fetchAllStockList(),
        3600
      );
      const found = allStocks.find(s => s.stockId === stockId);
      if (found) {
        return found.market === 'OTC'
          ? `${stockId}.TWO`
          : `${stockId}.TW`;
      }
    } catch {
      // fallback
    }
    return `${stockId}.TW`;
  }
}

// ── 工具函式 ─────────────────────────────────────────────────────────────────

function daysToRange(days: number): string {
  if (days <= 5)   return '5d';
  if (days <= 30)  return '1mo';
  if (days <= 90)  return '3mo';
  if (days <= 180) return '6mo';
  return '1y';
}
