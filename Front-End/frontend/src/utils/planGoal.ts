import type { PlanRow, PlanConfigDTO, PlanGoalResult } from '../types';

export function computePlanGoal(
  rows: PlanRow[],
  config: PlanConfigDTO,
): PlanGoalResult | null {
  const currentRow = rows.find(r => r.status === 'current');
  if (!currentRow) return null;

  const currentYear  = new Date().getFullYear();
  const currentValue =
    (currentRow.stockValue  ?? 0) +
    (currentRow.forexValue  ?? 0) +
    (currentRow.cashBalance ?? 0);

  /* B2：線性插值，起始點 = 去年實際最後資產 */
  const now      = new Date();
  const jan1     = new Date(currentYear, 0, 1);
  const dec31    = new Date(currentYear, 11, 31);
  const totalMs   = dec31.getTime() - jan1.getTime();
  const rawElapsedMs = Math.max(0, now.getTime() - jan1.getTime());
  const elapsedFraction = Math.min(1, rawElapsedMs / totalMs);
  const elapsedDays     = Math.round(rawElapsedMs / 86_400_000);

  const prevRow    = rows.find(r => r.calendarYear === currentYear - 1);
  const startValue = prevRow
    ? (prevRow.stockValue ?? 0) + (prevRow.forexValue ?? 0) + (prevRow.cashBalance ?? 0)
    : 0;

  const yearTarget     = currentRow.expectedTotal;
  const expectedToday  = startValue + (yearTarget - startValue) * elapsedFraction;
  const progressRatio  = expectedToday > 0 ? currentValue / expectedToday : 0;
  const gapAmount      = currentValue - expectedToday;
  const progressStatus: PlanGoalResult['progressStatus'] =
    progressRatio > 1.03 ? 'ahead' :
    progressRatio < 0.97 ? 'behind' : 'on-track';

  /* B3：達成第 30 年目標所需年化報酬 */
  const year30Row      = rows[rows.length - 1];
  const targetValue    = year30Row.expectedTotal;
  const yearsRemaining = Math.max(0, config.startYear + 29 - currentYear);

  let requiredReturn = 0;
  if (yearsRemaining > 0 && currentValue > 0) {
    requiredReturn = Math.pow(targetValue / currentValue, 1 / yearsRemaining) - 1;
  }

  const rNominal     = config.rBase * config.kRisk;
  const isAchievable = requiredReturn <= rNominal;

  return {
    progressRatio,
    gapAmount,
    progressStatus,
    requiredReturn,
    yearsRemaining,
    isAchievable,
    startValue,
    expectedToday,
    currentValue,
    elapsedPct:  Math.round(elapsedFraction * 100),
    elapsedDays,
    yearTarget,
    targetValue,
    rNominal,
  };
}
