import { useState, useMemo } from 'react';
import PanelHeader from '../components/PanelHeader';
import LoadingPanel from '../components/LoadingPanel';
import Icon from '../components/Icon';
import { useReportViewModel } from '../../viewmodels/useReportViewModel';
import ReportChart, { type ChartDayData } from './report/ReportChart';
import type { DailySnapshotDTO } from '../../types';
import './report/report.css';

const PAGE_SIZE = 30;
const MS_PER_DAY = 86_400_000;

const YEAR_START = '2026-01-01';
const YEAR_END   = '2026-12-31';

function fmt(n: number, d = 0) {
  return n.toLocaleString('zh-TW', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtPct(n: number) {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${(n * 100).toFixed(2)}%`;
}

function fmtDate(d: string) { return d.replace(/-/g, '/'); }

function toChartData(snapshots: DailySnapshotDTO[], startDate: string, endDate: string): ChartDayData[] {
  const start = new Date(startDate).getTime();
  const end   = new Date(endDate).getTime();
  const filtered = snapshots.filter(s => {
    const t = new Date(s.date).getTime();
    return t >= start && t <= end;
  });
  if (filtered.length === 0) return [];
  /* dayIndex 基準：第一筆實際快照日期（而非 startDate），避免左側空洞 */
  const base = new Date(filtered.reduce((min, s) => s.date < min ? s.date : min, filtered[0].date)).getTime();
  return filtered
    .map(s => {
      const totalInvested = s.execCapital + s.reinvest;
      const net = s.stockValue + s.forexValue + s.cashBalance - totalInvested;
      return {
        dayIndex: Math.round((new Date(s.date).getTime() - base) / MS_PER_DAY) + 1,
        returnRate: totalInvested > 0 ? net / totalInvested : 0,
        totalInvested,
        date: s.date,
      };
    })
    .sort((a, b) => a.dayIndex - b.dayIndex);
}

interface SegmentRow {
  date: string;
  totalInvested: number;
  stockValue: number;
  forexValue: number;
  cashBalance: number;
  unrealizedProfit: number;
  netReturn: number;
  returnRate: number;
  note?: string;
}

function toSegmentRows(snapshots: DailySnapshotDTO[], start: string, end: string): SegmentRow[] {
  return snapshots
    .filter(s => s.date >= start && s.date <= end)
    .map(s => {
      const totalInvested = s.execCapital + s.reinvest;
      const netReturn = s.stockValue + s.forexValue + s.cashBalance - totalInvested;
      return {
        date: s.date,
        totalInvested,
        stockValue: s.stockValue,
        forexValue: s.forexValue,
        cashBalance: s.cashBalance,
        unrealizedProfit: s.unrealizedProfit,
        netReturn,
        returnRate: totalInvested > 0 ? netReturn / totalInvested : 0,
        note: s.note,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

function SnapshotTable({ rows, page, totalPages, onPage }: {
  rows:       SegmentRow[];
  page:       number;
  totalPages: number;
  onPage:     (p: number) => void;
}) {
  if (rows.length === 0) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: 'var(--dim)', fontSize: 'var(--text-sm)' }}>
        此區間無快照紀錄
      </div>
    );
  }

  const start = (page - 1) * PAGE_SIZE;
  const paged = rows.slice(start, start + PAGE_SIZE);

  return (
    <>
      <div style={{ overflowX: 'auto' }}>
        <table className="ft-table">
          <thead>
            <tr>
              <th>日期</th>
              <th>累計投入</th>
              <th>股票現值</th>
              <th>外幣資產</th>
              <th>流動資金</th>
              <th>未實現損益</th>
              <th>淨損益</th>
              <th>報酬率</th>
              <th>備註</th>
            </tr>
          </thead>
          <tbody>
            {paged.map(row => {
              const up = row.netReturn >= 0;
              const c  = up ? 'var(--up)' : 'var(--down)';
              return (
                <tr key={row.date}>
                  <td className="num-value" style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                    {fmtDate(row.date)}
                  </td>
                  <td className="num-value">{fmt(row.totalInvested)}</td>
                  <td className="num-value">{fmt(row.stockValue)}</td>
                  <td className="num-value">{fmt(row.forexValue)}</td>
                  <td className="num-value">{fmt(row.cashBalance)}</td>
                  <td className="num-value" style={{ color: row.unrealizedProfit >= 0 ? 'var(--up)' : 'var(--down)' }}>
                    {row.unrealizedProfit >= 0 ? '+' : ''}{fmt(row.unrealizedProfit)}
                  </td>
                  <td className="num-value" style={{ color: c }}>
                    {row.netReturn >= 0 ? '+' : ''}{fmt(row.netReturn)}
                  </td>
                  <td className="num-value" style={{ color: c }}>{fmtPct(row.returnRate)}</td>
                  <td style={{ color: 'var(--dim)', fontSize: 'var(--text-sm)' }}>{row.note ?? ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="report-pagination">
          <button className="btn-icon" disabled={page === 1} onClick={() => onPage(page - 1)}>
            <Icon name="chevron_left" size={18} />
          </button>
          <span className="report-pagination__info">{page} / {totalPages}</span>
          <button className="btn-icon" disabled={page === totalPages} onClick={() => onPage(page + 1)}>
            <Icon name="chevron_right" size={18} />
          </button>
        </div>
      )}
    </>
  );
}

export default function ReportPage() {
  const vm = useReportViewModel();

  const [r1s, setR1s] = useState(YEAR_START);
  const [r1e, setR1e] = useState(YEAR_END);
  const [showSeg2, setShowSeg2] = useState(false);
  const [r2s, setR2s] = useState(YEAR_START);
  const [r2e, setR2e] = useState(YEAR_END);

  const [activeTab, setActiveTab] = useState<1 | 2>(1);
  const [page1, setPage1] = useState(1);
  const [page2, setPage2] = useState(1);

  const series1 = useMemo(() => toChartData(vm.snapshots, r1s, r1e), [vm.snapshots, r1s, r1e]);
  const series2 = useMemo(
    () => showSeg2 ? toChartData(vm.snapshots, r2s, r2e) : null,
    [vm.snapshots, showSeg2, r2s, r2e],
  );

  const rows1 = useMemo(() => toSegmentRows(vm.snapshots, r1s, r1e), [vm.snapshots, r1s, r1e]);
  const rows2 = useMemo(
    () => showSeg2 ? toSegmentRows(vm.snapshots, r2s, r2e) : [],
    [vm.snapshots, showSeg2, r2s, r2e],
  );

  const totalPages1 = Math.ceil(rows1.length / PAGE_SIZE);
  const totalPages2 = Math.ceil(rows2.length / PAGE_SIZE);

  return (
    <div style={{ minWidth: 0 }}>
      <PanelHeader />

      <div style={{ padding: '16px 28px 28px' }}>
        {vm.loading
          ? <LoadingPanel loading rows={6} />
          : (
            <>
              {/* 日期控制 + 圖表 */}
              <div className="ft-panel" style={{ marginBottom: 16 }}>
                <div style={{ padding: '12px 16px 8px' }}>
                  <div className="report-controls">
                    <div className="report-range-row">
                      <span className="report-range-label">段一</span>
                      <input type="date" className="report-date-input" value={r1s}
                        onChange={e => { setR1s(e.target.value); setPage1(1); }} />
                      <span style={{ color: 'var(--dim)', fontSize: 'var(--text-sm)' }}>—</span>
                      <input type="date" className="report-date-input" value={r1e}
                        onChange={e => { setR1e(e.target.value); setPage1(1); }} />
                    </div>

                    {showSeg2 && (
                      <div className="report-range-row">
                        <span className="report-range-label">段二</span>
                        <input type="date" className="report-date-input" value={r2s}
                          onChange={e => { setR2s(e.target.value); setPage2(1); }} />
                        <span style={{ color: 'var(--dim)', fontSize: 'var(--text-sm)' }}>—</span>
                        <input type="date" className="report-date-input" value={r2e}
                          onChange={e => { setR2e(e.target.value); setPage2(1); }} />
                      </div>
                    )}

                    <button
                      className="btn-ghost"
                      style={{ fontSize: 'var(--text-xs)', padding: '3px 10px' }}
                      onClick={() => {
                        setShowSeg2(v => !v);
                        setActiveTab(1);
                      }}
                    >
                      {showSeg2 ? '移除段二' : '+ 加入段二比較'}
                    </button>
                  </div>
                </div>

                <ReportChart series1={series1} series2={series2} targetRate={vm.rBase} height={300} />
              </div>

              {/* 快照明細 — 段一 / 段二 Tab */}
              <div className="ft-panel">
                <div className="report-tab-bar">
                  <button
                    className={`report-tab${activeTab === 1 ? ' report-tab--active' : ''}`}
                    onClick={() => setActiveTab(1)}
                  >
                    段一
                    <span className="report-tab__count">{rows1.length}</span>
                  </button>
                  {showSeg2 && (
                    <button
                      className={`report-tab${activeTab === 2 ? ' report-tab--active' : ''}`}
                      onClick={() => setActiveTab(2)}
                    >
                      段二
                      <span className="report-tab__count">{rows2.length}</span>
                    </button>
                  )}
                </div>

                {activeTab === 1 && (
                  <SnapshotTable rows={rows1} page={page1} totalPages={totalPages1} onPage={setPage1} />
                )}
                {activeTab === 2 && showSeg2 && (
                  <SnapshotTable rows={rows2} page={page2} totalPages={totalPages2} onPage={setPage2} />
                )}
              </div>
            </>
          )
        }
      </div>
    </div>
  );
}
