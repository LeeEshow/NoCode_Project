import axios from 'axios';

const yfClient = axios.create({
  baseURL: 'https://query1.finance.yahoo.com',
  timeout: 10000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    Accept: 'application/json',
  },
});

/**
 * v8 Chart API — 適用於即時報價、歷史 K 線
 */
export const yfChart = async (
  symbol: string,
  params: Record<string, string | number> = {}
) => {
  const res = await yfClient.get(
    `/v8/finance/chart/${encodeURIComponent(symbol)}`,
    { params }
  );
  const result = res.data?.chart?.result?.[0];
  if (!result) throw new Error(`Yahoo Finance: 無法取得 ${symbol} 資料`);
  return result;
};

/**
 * v10 Quote Summary API — 適用於本益比、殖利率、市值等基礎數據
 */
export const yfQuoteSummary = async (symbol: string, modules: string) => {
  const res = await yfClient.get(
    `/v10/finance/quoteSummary/${encodeURIComponent(symbol)}`,
    { params: { modules } }
  );
  return res.data?.quoteSummary?.result?.[0] ?? null;
};
