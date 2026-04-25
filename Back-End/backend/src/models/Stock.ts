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

  /** 抓取 TWSE + TPEX 全股清單（含 ETF 簡稱） */
  private static async fetchAllStockList(): Promise<StockSearchResult[]> {
    const [bwibRes, tseRes, otcRes] = await Promise.allSettled([
      // BWIBBU_ALL：上市所有證券（含 ETF）+ 簡稱，是最完整的簡稱來源
      axios.get('https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL', {
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      }),
      // t187ap03_L：上市公司正式全名（備用）
      axios.get('https://openapi.twse.com.tw/v1/opendata/t187ap03_L', {
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      }),
      // TPEX：上櫃股票
      axios.get(
        'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis',
        { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } }
      ),
    ]);

    const nameMap = new Map<string, { name: string; market: 'TSE' | 'OTC' }>();

    // 1. 先用全名清單建底
    if (tseRes.status === 'fulfilled' && Array.isArray(tseRes.value.data)) {
      for (const item of tseRes.value.data) {
        const id   = (item['公司代號'] ?? item['stockId'] ?? item['code'] ?? '').toString().trim();
        const name = (item['公司名稱'] ?? item['name'] ?? '').toString().trim();
        if (id && name) nameMap.set(id, { name, market: 'TSE' });
      }
    }

    // 2. BWIBBU_ALL 簡稱覆蓋（含 ETF），優先度更高
    if (bwibRes.status === 'fulfilled' && Array.isArray(bwibRes.value.data)) {
      for (const item of bwibRes.value.data) {
        const id   = (item['Code'] ?? item['代號'] ?? '').toString().trim();
        const name = (item['Name'] ?? item['名稱'] ?? '').toString().trim();
        if (id && name) nameMap.set(id, { name, market: 'TSE' });
      }
    } else if (bwibRes.status === 'rejected') {
      console.error('[Stock] BWIBBU_ALL API 失敗:', (bwibRes.reason as Error)?.message);
    }

    // 3. OTC（上櫃）
    if (otcRes.status === 'fulfilled' && Array.isArray(otcRes.value.data)) {
      for (const item of otcRes.value.data) {
        const id   = (item['SecuritiesCompanyCode'] ?? item['代號'] ?? '').toString().trim();
        const name = (item['CompanyName'] ?? item['名稱'] ?? '').toString().trim();
        if (id && name && !nameMap.has(id)) nameMap.set(id, { name, market: 'OTC' });
      }
    }

    const results: StockSearchResult[] = Array.from(nameMap.entries()).map(
      ([stockId, { name, market }]) => ({ stockId, name, market })
    );
    console.log(`[Stock] 股票清單載入完成：共 ${results.length} 筆`);
    return results;
  }

  // ── 即時報價 ──────────────────────────────────────────────────────────────

  /** 取得即時報價（Yahoo Finance v8 chart），TTL 由 controller 的 cache 控管 */
  static async getQuote(stockId: string): Promise<StockQuote> {
    const [symbol, allStocks] = await Promise.all([
      Stock.resolveSymbol(stockId),
      getOrSet('stocks:all-list', () => Stock.fetchAllStockList(), 3600, s => s.length > 0),
    ]);
    const result = await yfChart(symbol, { interval: '1d', range: '1d' });
    const meta   = result.meta;

    const price         = meta.regularMarketPrice as number;
    const prev          = meta.chartPreviousClose as number;
    const change        = +(price - prev).toFixed(2);
    const changePercent = +(((price - prev) / prev) * 100).toFixed(2);

    const chineseName = allStocks.find(s => s.stockId === stockId)?.name;

    return {
      stockId,
      name:         chineseName ?? meta.shortName ?? meta.longName ?? stockId,
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
   * 注意：同樣使用 shouldCache 防止空結果汙染快取
   */
  static async resolveSymbol(stockId: string): Promise<string> {
    try {
      const allStocks = await getOrSet(
        'stocks:all-list',
        () => Stock.fetchAllStockList(),
        3600,
        stocks => stocks.length > 0  // 防止空結果快取影響 search()
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
