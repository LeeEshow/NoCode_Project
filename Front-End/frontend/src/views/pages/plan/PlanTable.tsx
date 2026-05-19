import { useState, useEffect } from 'react';
import type { PlanRow } from '../../../types';

function fmt(n: number | null, d = 0): string {
  if (n == null) return '—';
  return n.toLocaleString('zh-TW', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtPct(n: number | null): string {
  if (n == null) return '—';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${(n * 100).toFixed(2)}%`;
}

/* 報酬率 + 達標 badge */
function ReturnCell({ value, pct }: {
  value: number | null;
  pct:   number | null;
}) {
  if (value == null || pct == null) return <span className="future-cell">—</span>;
  const isUp  = value >= 0;
  const color = isUp ? 'var(--up)' : 'var(--down)';

  return (
    <div className="plan-return-cell">
      <span className="plan-return-abs" style={{ color }}>
        {isUp ? '+' : ''}{fmt(value)}
      </span>
      <span className="plan-return-pct" style={{ color }}>
        {fmtPct(pct)}
      </span>
    </div>
  );
}

/* 執行合計 = 股票 + 外幣 + 流動，與預期總額（實質）對比 */
function ExecTotalCell({ stockValue, forexValue, cashBalance, expectedTotalReal }: {
  stockValue:       number | null;
  forexValue:       number | null;
  cashBalance:      number | null;
  expectedTotalReal: number;
}) {
  if (stockValue == null || forexValue == null || cashBalance == null) {
    return <span style={{ color: 'var(--dim)', opacity: 0.6 }}>—</span>;
  }
  const total   = stockValue + forexValue + cashBalance;
  const diff    = total - expectedTotalReal;
  const isAhead = diff >= 0;
  const badgeSign = diff > 0 ? '+' : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
      <span className="pv">{fmt(total)}</span>
      <span
        className="plan-return-badge"
        style={{ color: isAhead ? 'var(--accent)' : 'var(--up)' }}
        title="相對計畫預期總額（實質）的差額"
      >
        {isAhead ? '▲' : '▼'} {badgeSign}{fmt(diff)}
      </span>
    </div>
  );
}

interface InvestInputProps {
  value:    number;
  disabled: boolean;
  onCommit: (v: number) => void;
}

const fmtNum = (n: number) => n.toLocaleString('zh-TW', { maximumFractionDigits: 0 });

function InvestInput({ value, disabled, onCommit }: InvestInputProps) {
  const [draft, setDraft] = useState(fmtNum(value));
  useEffect(() => { setDraft(fmtNum(value)); }, [value]);

  const commit = () => {
    const v = parseFloat(draft.replace(/,/g, ''));
    if (!isNaN(v) && v >= 0 && v !== value) { onCommit(v); setDraft(fmtNum(v)); }
    else setDraft(fmtNum(value));
  };

  return (
    <input
      className="plan-invest-input"
      type="text"
      inputMode="numeric"
      value={draft}
      disabled={disabled}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => e.key === 'Enter' && commit()}
      onClick={e => e.stopPropagation()}
    />
  );
}

interface ReinvestInputProps {
  value:    number;
  onCommit: (v: number) => void;
}

function ReinvestInput({ value, onCommit }: ReinvestInputProps) {
  const [draft, setDraft] = useState(fmtNum(value));
  useEffect(() => { setDraft(fmtNum(value)); }, [value]);

  const commit = () => {
    const v = parseFloat(draft.replace(/,/g, ''));
    if (!isNaN(v) && v >= 0) { onCommit(v); setDraft(fmtNum(v)); }
    else setDraft(fmtNum(value));
  };

  return (
    <input
      className="plan-reinvest-input"
      type="text"
      inputMode="numeric"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => e.key === 'Enter' && commit()}
      onClick={e => e.stopPropagation()}
    />
  );
}

export interface PlanTableProps {
  rows:             PlanRow[];
  saving:           boolean;
  startYear:        number;
  onInvestOverride: (yearIndex: number, amount: number) => void;
  onReinvestChange: (amount: number) => void;
}

export default function PlanTable({
  rows, saving, startYear, onInvestOverride, onReinvestChange,
}: PlanTableProps) {
  const [showPlanDetail, setShowPlanDetail] = useState(false);

  return (
    <div className="plan-table-wrap">
      <table className="plan-table">
        <thead>
          <tr>
            <th rowSpan={2} style={{ textAlign: 'center', verticalAlign: 'middle', width: 68 }}>年份</th>
            <th colSpan={showPlanDetail ? 4 : 2} className="plan-th-group">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                計畫
                <button
                  className="plan-toggle-icon-btn"
                  title={showPlanDetail ? '隱藏計畫資本與投入' : '顯示計畫資本與投入'}
                  onClick={() => setShowPlanDetail(v => !v)}
                >
                  <span className="material-symbols-rounded" style={{ fontSize: 24, lineHeight: 1 }}>
                    {showPlanDetail ? 'toggle_on' : 'toggle_off'}
                  </span>
                </button>
              </div>
            </th>
            <th colSpan={6} className="plan-th-group exec">執行</th>
          </tr>
          <tr>
            {showPlanDetail && <th style={{ width: 110 }}>計畫資本</th>}
            {showPlanDetail && <th style={{ width: 110 }}>計畫投入</th>}
            <th style={{ width: 110 }}>預期獲利</th>
            <th style={{ width: 130 }}>預期總額</th>
            <th className="exec-col exec-first" style={{ width: 110 }}>今年再投</th>
            <th className="exec-col" style={{ width: 110 }}>股票現值</th>
            <th className="exec-col" style={{ width: 110 }}>外幣資產</th>
            <th className="exec-col" style={{ width: 110 }}>流動資金</th>
            <th className="exec-col" style={{ width: 130 }}>執行合計</th>
            <th className="exec-col" style={{ width: 130 }}>損益</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const isFuture  = row.status === 'future';
            const isCurrent = row.status === 'current';
            const trClass   = [
              row.isMilestone ? 'milestone' : '',
              isCurrent ? 'current-year' : '',
            ].filter(Boolean).join(' ') || undefined;

            const ec = (cls: string) => `exec-col ${cls}`.trim();
            const calYear = row.calendarYear ?? (startYear + row.yearIndex - 1);

            return (
              <tr key={row.yearIndex} className={trClass}>
                {/* 年份 */}
                <td style={{
                  color: row.isMilestone
                    ? undefined
                    : isFuture ? 'var(--dim)' : 'var(--muted)',
                  fontWeight: isCurrent ? 600 : undefined,
                }}>
                  {calYear}
                </td>

                {/* 計畫資本 */}
                {showPlanDetail && (
                  <td>
                    {row.yearIndex === 1
                      ? <span className="pv-dim">—</span>
                      : <span className="pv">{fmt(row.planCapital)}</span>
                    }
                  </td>
                )}

                {/* 計畫投入 */}
                {showPlanDetail && (
                  <td>
                    <InvestInput
                      value={row.planInvest}
                      disabled={row.status === 'past' || saving}
                      onCommit={v => onInvestOverride(row.yearIndex, v)}
                    />
                  </td>
                )}

                {/* 預期獲利 */}
                <td><span className="pv">{fmt(row.expectedProfit)}</span></td>

                {/* 預期總額 */}
                <td>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                    <span className="pv">{fmt(row.expectedTotalReal)}</span>
                    <span className="pv-dim">{fmt(row.expectedTotal)} 名目</span>
                  </div>
                </td>

                {/* 今年再投 */}
                <td className={ec('exec-first')}>
                  {isFuture
                    ? <span className="future-cell">—</span>
                    : isCurrent
                    ? <ReinvestInput value={row.reinvest ?? 0} onCommit={onReinvestChange} />
                    : <span className="pv">{fmt(row.reinvest)}</span>
                  }
                </td>

                {/* 股票現值 */}
                <td className={ec('')}>
                  {isFuture
                    ? <span className="future-cell">—</span>
                    : <span className="pv">{fmt(row.stockValue)}</span>
                  }
                </td>

                {/* 外幣資產 */}
                <td className={ec('')}>
                  {isFuture
                    ? <span className="future-cell">—</span>
                    : <span className="pv">{fmt(row.forexValue)}</span>
                  }
                </td>

                {/* 流動資金 */}
                <td className={ec('')}>
                  {isFuture
                    ? <span className="future-cell">—</span>
                    : <span className="pv">{fmt(row.cashBalance)}</span>
                  }
                </td>

                {/* 執行合計 */}
                <td className={ec('')}>
                  {isFuture
                    ? <span className="future-cell">—</span>
                    : <ExecTotalCell
                        stockValue={row.stockValue}
                        forexValue={row.forexValue}
                        cashBalance={row.cashBalance}
                        expectedTotalReal={row.expectedTotalReal}
                      />
                  }
                </td>

                {/* 報酬率 */}
                <td className={ec('')}>
                  {isFuture
                    ? <span className="future-cell">—</span>
                    : <ReturnCell
                        value={row.returnValue}
                        pct={row.returnPct}
                      />
                  }
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
