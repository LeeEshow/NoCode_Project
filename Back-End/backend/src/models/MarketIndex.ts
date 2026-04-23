import axios from 'axios';
import { yfChart } from '../global/yahooFinance';

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

// ── 指數代號對照表 ───────────────────────────────────────────────────────────

const INDEX_SYMBOLS: Array<{ id: string; name: string; symbol: string }> = [
  { id: 'twii',    name: '台股大盤',    symbol: '^TWII'  },
  { id: 'futures', name: '台指期',      symbol: 'TWF=F'  },
  { id: 'nasdaq',  name: 'NASDAQ',      symbol: '^IXIC'  },
  { id: 'sp500',   name: 'S&P 500',     symbol: '^GSPC'  },
  { id: 'dji',     name: '道瓊工業',    symbol: '^DJI'   },
  { id: 'sox',     name: '費城半導體',  symbol: '^SOX'   },
];

// ── Model ───────────────────────────────────────────────────────────────────

export class MarketIndex {
  /** 取得所有市場指數，並行請求；單一失敗不影響其他 */
  static async fetchAll(): Promise<IndexCard[]> {
    const settled = await Promise.allSettled(
      INDEX_SYMBOLS.map(({ symbol }) =>
        yfChart(symbol, { interval: '1d', range: '1d' })
      )
    );

    return INDEX_SYMBOLS.map(({ id, name }, i) => {
      const r = settled[i];
      if (r.status === 'rejected') {
        return { id, name, price: null, change: null, changePercent: null };
      }
      const meta  = r.value.meta;
      const price = meta.regularMarketPrice ?? null;
      const prev  = meta.chartPreviousClose ?? null;
      const change =
        price !== null && prev ? +( price - prev).toFixed(2) : null;
      const changePercent =
        price !== null && prev
          ? +(((price - prev) / prev) * 100).toFixed(2)
          : null;
      return { id, name, price, change, changePercent };
    });
  }

  /** 取得主要幣別對台幣即時匯率，並行請求；單一失敗不影響其他 */
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
   * 資料通常落後 2 個月，最多往前查 5 個月
   */
  static async fetchExportIndicator(): Promise<ExportIndicator> {
    const now     = new Date();
    const rocYear = now.getFullYear() - 1911;

    for (let offset = 2; offset <= 6; offset++) {
      let year  = rocYear;
      let month = now.getMonth() + 1 - offset; // getMonth() 0-indexed
      while (month <= 0) {
        month += 12;
        year  -= 1;
      }

      try {
        const res = await axios.get(
          'https://www.ndc.gov.tw/Forecast_BUS/BusReport/GetLightDataByYM',
          {
            params: {
              Year:  year,
              Month: String(month).padStart(2, '0'),
            },
            timeout: 15000,
            headers: { 'User-Agent': 'Mozilla/5.0' },
          }
        );

        const data = res.data;
        if (!data || data.score === undefined) continue;

        const score      = Number(data.score);
        const light      = data.light ?? scoreToLight(score);
        const period     = `${year + 1911}-${String(month).padStart(2, '0')}`;

        return { period, score, light, lightLabel: lightToLabel(light) };
      } catch {
        continue;
      }
    }

    // 全部嘗試失敗時回傳空殼
    return { period: '-', score: null, light: null, lightLabel: null };
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
