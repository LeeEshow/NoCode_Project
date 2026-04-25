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

// 台指期透過 Yahoo Finance TW SSR HTML 爬取，不在此列
const INDEX_SYMBOLS: Array<{ id: string; name: string; symbol: string }> = [
  { id: 'twii',   name: '台股大盤',   symbol: '^TWII' },
  { id: 'nasdaq', name: 'NASDAQ',     symbol: '^IXIC' },
  { id: 'sp500',  name: 'S&P 500',    symbol: '^GSPC' },
  { id: 'dji',    name: '道瓊工業',   symbol: '^DJI'  },
  { id: 'sox',    name: '費城半導體', symbol: '^SOX'  },
];

// ── Model ───────────────────────────────────────────────────────────────────

export class MarketIndex {
  /** 取得所有市場指數；台指期獨立爬取，其餘並行走 Yahoo Finance v8 */
  static async fetchAll(): Promise<IndexCard[]> {
    const [settled, futuresCard] = await Promise.all([
      Promise.allSettled(
        INDEX_SYMBOLS.map(({ symbol }) =>
          yfChart(symbol, { interval: '1d', range: '1d' })
        )
      ),
      MarketIndex.fetchTaiwanFutures(),
    ]);

    const cards = INDEX_SYMBOLS.map(({ id, name }, i) => {
      const r = settled[i];
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

    // 台指期插入第二位（twii 之後），維持原始順序
    cards.splice(1, 0, futuresCard);
    return cards;
  }

  /**
   * 爬取 Yahoo Finance 台灣版取得台指期即時報價（SSR HTML）
   * 來源：https://tw.stock.yahoo.com/future/WTX%26
   * Node.js 帶 Chrome headers 可繞過 Cloudflare，直接拿到 SSR 渲染的價格
   */
  private static async fetchTaiwanFutures(): Promise<IndexCard> {
    const fallback: IndexCard = { id: 'futures', name: '台指期', price: null, change: null, changePercent: null };
    try {
      const res = await axios.get('https://tw.stock.yahoo.com/future/WTX%26', {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-TW,zh;q=0.9',
          'Accept-Encoding': 'identity',
        },
      });

      const html = res.data as string;
      const sectionIdx = html.indexOf('main-1-FutureHeader-Proxy');
      if (sectionIdx === -1) {
        console.error('[MarketIndex] 台指期：找不到 FutureHeader-Proxy 區塊');
        return fallback;
      }
      const section = html.slice(sectionIdx, sectionIdx + 2000);

      // 漲跌方向（class 含 c-trend-down 為跌）
      const isDown = section.includes('c-trend-down');

      // 價格：Fz(32px) span 內的數字，例如 39,766.00
      const priceMatch = section.match(/Fz\(32px\)[^>]+?>([\d,]+\.?\d*)</);
      if (!priceMatch) {
        console.error('[MarketIndex] 台指期：無法解析價格');
        return fallback;
      }
      const price = parseFloat(priceMatch[1].replace(/,/g, ''));

      // 漲跌幅：(x.xx%) 格式，正負號由方向決定
      const pctMatch = section.match(/\(([\d.]+)%\)/);
      const pctAbs = pctMatch ? parseFloat(pctMatch[1]) : null;
      const changePercent = pctAbs !== null ? (isDown ? -pctAbs : pctAbs) : null;

      // 漲跌值：三角箭頭 span 後的純數字文字
      const changeMatch = section.match(/style="border-color:[^"]+"><\/span>([\d,]+\.?\d*)</);
      const changeAbs = changeMatch ? parseFloat(changeMatch[1].replace(/,/g, '')) : null;
      const change = changeAbs !== null ? (isDown ? -changeAbs : changeAbs) : null;

      return { id: 'futures', name: '台指期', price, change, changePercent };
    } catch (err) {
      console.error('[MarketIndex] 台指期爬蟲失敗:', err instanceof Error ? err.message : err);
      return fallback;
    }
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
   * 資料來源：https://index.ndc.gov.tw/n/zh_tw/data/eco/indicators_table1
   * 取 Table 最下面那欄（最新一期）資訊，TTL 1hr
   */
  static async fetchExportIndicator(): Promise<ExportIndicator> {
    try {
      // Step 1: GET 頁面取得 CSRF token 與 session cookies
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

      // Step 2: POST 取景氣指標資料（NDC 實際 API 端點）
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

      // SR0005 = 景氣對策信號（分數）
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
      const rawX = String(latest.x); // e.g. "202602"
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

