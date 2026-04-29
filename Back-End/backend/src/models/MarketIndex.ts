import axios from 'axios';
import { yfChart } from '../global/yahooFinance';
import { sjGetTwii, sjGetFutures } from '../global/shioajiClient';

// ── 型別定義 ────────────────────────────────────────────────────────────────

export interface ForexRate {
  code: string;
  name: string;
  rate: number | null; // 1 外幣 = N 台幣
}

export interface IndexCard {
  id: string;
  name: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
}

export interface ExportIndicator {
  period: string;        // e.g. '2025-02'
  score: number | null;
  light: string | null;  // 'red' | 'yellow-red' | 'green' | 'yellow-blue' | 'blue'
  lightLabel: string | null; // '紅燈' | '黃紅燈' | ...
}

// ── 匯率代號對照表 ───────────────────────────────────────────────────────────

const FOREX_SYMBOLS: Array<{ code: string; name: string; symbol: string }> = [
  { code: 'USD', name: '美元',       symbol: 'USDTWD=X' },
  { code: 'JPY', name: '日圓',       symbol: 'JPYTWD=X' },
  { code: 'EUR', name: '歐元',       symbol: 'EURTWD=X' },
  { code: 'CNY', name: '人民幣',     symbol: 'CNYTWD=X' },
  { code: 'HKD', name: '港幣',       symbol: 'HKDTWD=X' },
  { code: 'GBP', name: '英鎊',       symbol: 'GBPTWD=X' },
  { code: 'AUD', name: '澳幣',       symbol: 'AUDTWD=X' },
  { code: 'SGD', name: '新加坡幣',   symbol: 'SGDTWD=X' },
];

// 美股指數（Yahoo Finance 維持不變）
const US_INDEX_SYMBOLS: Array<{ id: string; name: string; symbol: string }> = [
  { id: 'nasdaq', name: 'NASDAQ',     symbol: '^IXIC' },
  { id: 'sp500',  name: 'S&P 500',    symbol: '^GSPC' },
  { id: 'dji',    name: '道瓊工業',   symbol: '^DJI'  },
  { id: 'sox',    name: '費城半導體', symbol: '^SOX'  },
];

// ── Model ───────────────────────────────────────────────────────────────────

export class MarketIndex {
  /**
   * 取得所有市場指數
   * - 台股大盤 / 台指期：Shioaji snapshot
   * - NASDAQ / S&P500 / 道瓊 / 費城半導體：Yahoo Finance v8
   */
  static async fetchAll(): Promise<IndexCard[]> {
    const [twiiCard, futuresCard, usSettled] = await Promise.all([
      sjGetTwii().catch(() => ({
        id: 'twii', name: '台股大盤', price: null, change: null, changePercent: null,
      } as IndexCard)),
      sjGetFutures().catch(() => ({
        id: 'futures', name: '台指期', price: null, change: null, changePercent: null,
      } as IndexCard)),
      Promise.allSettled(
        US_INDEX_SYMBOLS.map(({ symbol }) =>
          yfChart(symbol, { interval: '1d', range: '1d' })
        )
      ),
    ]);

    const usCards = US_INDEX_SYMBOLS.map(({ id, name }, i) => {
      const r = usSettled[i];
      if (r.status === 'rejected') {
        return { id, name, price: null, change: null, changePercent: null };
      }
      const meta  = r.value.meta;
      const price = meta.regularMarketPrice ?? null;
      const prev  = meta.chartPreviousClose ?? null;
      const change =
        price !== null && prev ? +(price - prev).toFixed(2) : null;
      const changePercent =
        price !== null && prev
          ? +(((price - prev) / prev) * 100).toFixed(2)
          : null;
      return { id, name, price, change, changePercent };
    });

    // 順序：台股大盤、台指期、NASDAQ、S&P500、道瓊、費城半導體
    return [twiiCard, futuresCard, ...usCards];
  }

  /** 取得主要幣別對台幣即時匯率（Yahoo Finance） */
  static async fetchForexRates(): Promise<ForexRate[]> {
    const settled = await Promise.allSettled(
      FOREX_SYMBOLS.map(({ symbol }) =>
        yfChart(symbol, { interval: '1d', range: '1d' })
      )
    );

    return FOREX_SYMBOLS.map(({ code, name }, i) => {
      const r = settled[i];
      if (r.status === 'rejected') return { code, name, rate: null };
      const rate = r.value.meta.regularMarketPrice ?? null;
      return { code, name, rate: rate !== null ? +Number(rate).toFixed(4) : null };
    });
  }

  /**
   * 取得台灣出口景氣燈號（NDC 國發會）
   * 維持原有 CSRF + POST 方式，TTL 1hr
   */
  static async fetchExportIndicator(): Promise<ExportIndicator> {
    try {
      const pageRes = await axios.get(
        'https://index.ndc.gov.tw/n/zh_tw/data/eco/indicators_table1',
        {
          timeout: 15000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        }
      );

      const html = pageRes.data as string;
      const csrfMatch = (html as string).match(/csrf-token"\s+content="([^"]+)"/);
      if (!csrfMatch) {
        console.error('[MarketIndex] NDC 無法取得 CSRF token');
        return { period: '-', score: null, light: null, lightLabel: null };
      }
      const csrfToken = csrfMatch[1];

      const setCookieHeaders: string[] = (pageRes.headers['set-cookie'] as string[] | undefined) ?? [];
      const cookieStr = setCookieHeaders.map((c: string) => c.split(';')[0]).join('; ');

      const apiRes = await axios.post(
        'https://index.ndc.gov.tw/n/json/data/eco/indicators',
        {},
        {
          timeout: 15000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': csrfToken,
            'Referer': 'https://index.ndc.gov.tw/n/zh_tw/data/eco/indicators_table1',
            'Cookie': cookieStr,
          },
        }
      );

      type LineItem = { code: string; data: Array<{ x: string; y: number | null }> };
      const payload = apiRes.data as Record<string, unknown>;
      const lineObj = payload['line'] as Record<string, LineItem> | undefined;

      if (!lineObj) {
        console.error('[MarketIndex] NDC API 回傳無 line 資料，keys:', Object.keys(payload));
        return { period: '-', score: null, light: null, lightLabel: null };
      }

      const lineItems = Object.values(lineObj);
      const sr5 = lineItems.find(item => item.code === 'SR0005');
      if (!sr5) {
        console.error('[MarketIndex] NDC API 找不到 SR0005，可用 codes:', lineItems.map(x => x.code));
        return { period: '-', score: null, light: null, lightLabel: null };
      }

      const validData = sr5.data.filter(d => d.y !== null);
      if (validData.length === 0) {
        console.error('[MarketIndex] NDC SR0005 無有效資料');
        return { period: '-', score: null, light: null, lightLabel: null };
      }

      const latest = validData[validData.length - 1]!;
      const rawX = String(latest.x);
      const period = rawX.length === 6
        ? `${rawX.slice(0, 4)}-${rawX.slice(4, 6)}`
        : rawX;

      const score = latest.y !== null ? Number(latest.y) : null;
      const light = score !== null ? scoreToLight(score) : null;
      const lightLabel = light ? lightToLabel(light) : null;

      return { period, score, light, lightLabel };
    } catch (err) {
      const axErr = err as { response?: { status: number; data: unknown } };
      console.error(
        '[MarketIndex] NDC 景氣燈號 API 失敗:',
        err instanceof Error ? err.message : err,
        axErr.response ? `(HTTP ${axErr.response.status})` : ''
      );
      return { period: '-', score: null, light: null, lightLabel: null };
    }
  }
}

// ── 工具函式 ─────────────────────────────────────────────────────────────────

function scoreToLight(score: number): string {
  if (score >= 38) return 'red';
  if (score >= 32) return 'yellow-red';
  if (score >= 23) return 'green';
  if (score >= 17) return 'yellow-blue';
  return 'blue';
}

function lightToLabel(light: string): string {
  const map: Record<string, string> = {
    'red':          '紅燈',
    'yellow-red':   '黃紅燈',
    'green':        '綠燈',
    'yellow-blue':  '黃藍燈',
    'blue':         '藍燈',
  };
  return map[light] ?? '-';
}
