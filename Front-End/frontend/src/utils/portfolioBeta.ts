import type { DailySnapshotDTO, IndexKBar, PortfolioBetaResult, BetaStatus } from '../types';

function totalValue(s: DailySnapshotDTO): number {
  return s.stockValue + s.forexValue + s.cashBalance;
}

function betaStatus(n: number): BetaStatus {
  if (n < 60)  return 'insufficient';
  if (n < 90)  return 'reference';
  if (n < 252) return 'display';
  return 'reliable';
}

export function computePortfolioBeta(
  snapshots: DailySnapshotDTO[],
  kbars: IndexKBar[],
): PortfolioBetaResult | null {
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));

  const closeByDate = new Map<string, number>();
  for (const bar of kbars) {
    const d = new Date(bar.timestamp * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    closeByDate.set(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, bar.close);
  }

  const portfolioReturns: number[] = [];
  const marketReturns: number[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const prevVal = totalValue(prev);
    const currVal = totalValue(curr);
    if (prevVal <= 0) continue;

    const mktClose     = closeByDate.get(curr.date);
    const mktPrevClose = closeByDate.get(prev.date);
    if (!mktClose || !mktPrevClose || mktPrevClose <= 0) continue;

    portfolioReturns.push(currVal / prevVal - 1);
    marketReturns.push(mktClose / mktPrevClose - 1);
  }

  const n = portfolioReturns.length;
  if (n < 5) return null;

  const xMean = marketReturns.reduce((s, v) => s + v, 0) / n;
  const yMean = portfolioReturns.reduce((s, v) => s + v, 0) / n;

  let cov = 0, varX = 0, ssTotal = 0;
  for (let i = 0; i < n; i++) {
    const dx = marketReturns[i] - xMean;
    const dy = portfolioReturns[i] - yMean;
    cov     += dx * dy;
    varX    += dx * dx;
    ssTotal += dy * dy;
  }
  if (varX === 0) return null;

  const beta  = cov / varX;
  const alpha = yMean - beta * xMean;

  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const res = portfolioReturns[i] - (alpha + beta * marketReturns[i]);
    ssRes += res * res;
  }
  const rSquared = ssTotal > 0 ? 1 - ssRes / ssTotal : 0;

  return {
    realizedBeta: Math.round(beta * 1000) / 1000,
    alpha:        Math.round(alpha * 252 * 10000) / 10000,
    rSquared:     Math.round(Math.max(0, rSquared) * 1000) / 1000,
    sampleDays:   n,
    status:       betaStatus(n),
  };
}
