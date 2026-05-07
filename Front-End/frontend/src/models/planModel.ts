import type { PlanConfigDTO, PlanRow, DailySnapshotDTO } from '../types';

const PLAN_YEARS = 30;
const MILESTONES = new Set([10, 15, 20, 30]);

/* ── 通膨率對照 ── */
function getInflationRate(scenario: PlanConfigDTO['inflation']): number {
  if (scenario === 'low')  return 0.015;
  if (scenario === 'high') return 0.035;
  return 0.02; // base
}

/* ── 依年份取最後一筆快照 ── */
function lastSnapshotOfYear(
  snapsByYear: Map<number, DailySnapshotDTO[]>,
  year: number,
): DailySnapshotDTO | null {
  const snaps = snapsByYear.get(year);
  if (!snaps || snaps.length === 0) return null;
  return snaps[snaps.length - 1]; // 已按日期升序排列
}

/* ── 快照按年分組（升序） ── */
export function groupSnapshotsByYear(
  snapshots: DailySnapshotDTO[],
): Map<number, DailySnapshotDTO[]> {
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const map = new Map<number, DailySnapshotDTO[]>();
  for (const s of sorted) {
    const year = Number(s.date.slice(0, 4));
    if (!map.has(year)) map.set(year, []);
    map.get(year)!.push(s);
  }
  return map;
}

/* ── 主計算函式：產生 30 行 PlanRow ── */
export function buildPlanRows(
  config: PlanConfigDTO,
  snapsByYear: Map<number, DailySnapshotDTO[]>,
): PlanRow[] {
  const { annualInvest, rBase, kRisk, inflation, startYear, overrides, currentYearReinvest } = config;
  const rNominal    = rBase * kRisk;
  const piTotal     = getInflationRate(inflation);
  const currentYear = new Date().getFullYear();

  let prevExpectedTotal = 0;
  let inflationFactor   = 1;
  const rows: PlanRow[] = [];

  for (let n = 1; n <= PLAN_YEARS; n++) {
    const calendarYear = startYear + n - 1;
    const planInvest   = overrides[String(n)] ?? annualInvest;

    /* ── 計畫側計算 ── */
    const planCapital    = prevExpectedTotal;
    const base           = planCapital + planInvest;
    const expectedProfit = base * rNominal;
    const expectedTotal  = base * (1 + rNominal);
    inflationFactor     *= (1 + piTotal);
    const expectedTotalReal = expectedTotal / inflationFactor;
    prevExpectedTotal    = expectedTotal;

    /* ── 執行側：判斷狀態 ── */
    const status: PlanRow['status'] =
      calendarYear < currentYear ? 'past' :
      calendarYear === currentYear ? 'current' : 'future';

    let execCapital: number | null = null;
    let reinvest:    number | null = null;
    let stockValue:  number | null = null;
    let forexValue:  number | null = null;
    let cashBalance: number | null = null;
    let returnValue: number | null = null;
    let returnPct:   number | null = null;

    if (status !== 'future') {
      const snapThis = lastSnapshotOfYear(snapsByYear, calendarYear);

      if (snapThis) {
        stockValue  = snapThis.stockValue;
        forexValue  = snapThis.forexValue;
        cashBalance = snapThis.cashBalance;
        execCapital = snapThis.execCapital;
        if (status === 'past') reinvest = snapThis.reinvest;
      } else {
        execCapital = 0;
      }

      if (status === 'current') {
        reinvest = currentYearReinvest;
      }

      /* 報酬率 */
      if (
        stockValue != null && forexValue != null && cashBalance != null &&
        execCapital != null && reinvest != null
      ) {
        const totalAsset = stockValue + forexValue + cashBalance;
        const invested   = execCapital + reinvest;
        returnValue = totalAsset - invested;
        returnPct   = invested !== 0 ? totalAsset / invested - 1 : null;
      }
    }

    rows.push({
      yearIndex: n,
      calendarYear,
      isMilestone: MILESTONES.has(n),
      planCapital,
      planInvest,
      expectedProfit,
      expectedTotal,
      expectedTotalReal,
      status,
      execCapital,
      reinvest,
      stockValue,
      forexValue,
      cashBalance,
      returnValue,
      returnPct,
    });
  }

  return rows;
}
