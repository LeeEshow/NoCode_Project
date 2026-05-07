import axios from 'axios';
import { yfChart, yfQuoteSummary } from '../global/yahooFinance';
import { getOrSet } from '../global/cache';
import { StockList } from './StockList';

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
  revenue: number | null;      // 最近一季營收（億元）
  grossMargin: number | null;  // 毛利率（%）
  roe: number | null;          // 股東權益報酬率（%）
  roa: number | null;          // 資產報酬率（%）
}

export interface ChipDTO {
  date: string;    // YYYY-MM-DD
  foreign: number; // 外資買賣超（張，正=買超）
  trust: number;   // 投信買賣超（張）
  dealer: number;  // 自營商買賣超（張）
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

  /** 取得全股名稱清單（快取 3600s），供其他 Model/Controller 查名稱用 */
  static async getStockNameList(): Promise<StockSearchResult[]> {
    return getOrSet('stocks:all-list', () => Stock.fetchAllStockList(), 3600, s => s.length > 0);
  }

  /** 從 Firestore DB 讀取全股清單；DB 未初始化時回傳空陣列（需先執行 POST /stocks/list/refresh） */
  private static async fetchAllStockList(): Promise<StockSearchResult[]> {
    const meta = await StockList.getMeta();
    if (meta.count === 0) return [];
    const items = await StockList.getAll();
    console.log(`[Stock] 從 DB 載入股票清單：${items.length} 筆`);
    return items.map(item => ({
      stockId: item.code,
      name:    item.name,
      market:  item.market,
    }));
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

    let peRatio: number | null      = null;
    let dividendYield: number | null = null;
    let marketCap: number | null     = null;
    let revenue: number | null       = null;
    let grossMargin: number | null   = null;
    let roe: number | null           = null;
    let roa: number | null           = null;

    try {
      const summary = await yfQuoteSummary(
        symbol,
        'summaryDetail,defaultKeyStatistics,price,financialData,incomeStatementHistoryQuarterly'
      );
      if (summary) {
        const sd  = summary.summaryDetail;
        const pr  = summary.price;
        const fd  = summary.financialData;
        const qis = summary.incomeStatementHistoryQuarterly
          ?.incomeStatementHistory as Array<Record<string, { raw?: number }>> | undefined;

        peRatio       = sd?.trailingPE?.raw ?? null;
        dividendYield =
          sd?.dividendYield?.raw != null
            ? +(sd.dividendYield.raw * 100).toFixed(2)
            : null;
        marketCap = pr?.marketCap?.raw ?? sd?.marketCap?.raw ?? null;

        grossMargin =
          fd?.grossMargins?.raw != null
            ? +(fd.grossMargins.raw * 100).toFixed(2)
            : null;
        roe =
          fd?.returnOnEquity?.raw != null
            ? +(fd.returnOnEquity.raw * 100).toFixed(2)
            : null;
        roa =
          fd?.returnOnAssets?.raw != null
            ? +(fd.returnOnAssets.raw * 100).toFixed(2)
            : null;

        const latestQ = qis?.[0];
        if (latestQ?.totalRevenue?.raw != null) {
          revenue = +(latestQ.totalRevenue.raw / 1e8).toFixed(2); // 億元
        }
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
      revenue,
      grossMargin,
      roe,
      roa,
    };
  }

  // ── 三大法人籌碼 ──────────────────────────────────────────────────────────

  /**
   * 取得近 20 個交易日三大法人買賣超（TWSE T86）
   * 單位：張（1 張 = 1000 股）
   */
  static async getChip(stockId: string): Promise<ChipDTO[]> {
    const today = new Date();
    let rows = await Stock.fetchT86Rows(stockId, today);

    if (rows.length < 20) {
      const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const prev = await Stock.fetchT86Rows(stockId, prevMonth);
      rows = [...prev, ...rows];
    }

    return rows.slice(-20);
  }

  private static async fetchT86Rows(stockId: string, date: Date): Promise<ChipDTO[]> {
    const dateStr =
      `${date.getFullYear()}` +
      `${String(date.getMonth() + 1).padStart(2, '0')}` +
      '01';

    try {
      const res = await axios.get('https://www.twse.com.tw/rwd/zh/fund/T86', {
        params: { date: dateStr, stockNo: stockId, response: 'json' },
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });

      if (res.data?.stat !== 'OK' || !Array.isArray(res.data.data)) return [];

      const parse = (s: string) =>
        parseInt((s ?? '0').replace(/,/g, ''), 10) || 0;

      return (res.data.data as string[][]).map(row => {
        const parts = (row[0] ?? '').split('/');
        const isoDate = `${Number(parts[0]) + 1911}-${parts[1]}-${parts[2]}`;
        return {
          date:    isoDate,
          foreign: Math.round((parse(row[1]) + parse(row[2])) / 1000),
          trust:   Math.round(parse(row[3]) / 1000),
          dealer:  Math.round((parse(row[4]) + parse(row[5])) / 1000),
        };
      });
    } catch {
      return [];
    }
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
