import { useState, useMemo, useRef, useEffect } from 'react';
import PanelHeader from '../components/PanelHeader';
import LoadingPanel from '../components/LoadingPanel';
import Icon from '../components/Icon';
import { useReportViewModel } from '../../viewmodels/useReportViewModel';
import ReportChart, { type SeriesEntry } from './report/ReportChart';
import type { DailySnapshotDTO } from '../../types';
import './report/report.css';

const PAGE_SIZE  = 30;
const MS_PER_DAY = 86_400_000;
const YEAR_START = '2026-01-01';
const YEAR_END   = '2026-12-31';
const STORAGE_KEY = 'report_segments';

function fmt(n: number, d = 0) {
  return n.toLocaleString('zh-TW', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtPct(n: number) {
  return `${n >= 0 ? '+' : ''}${(n * 100).toFixed(2)}%`;
}
function fmtDate(d: string) { return d.replace(/-/g, '/'); }

function toChartData(snapshots: DailySnapshotDTO[], startDate: string, endDate: string): SeriesEntry['data'] {
  const start = new Date(startDate).getTime();
  const end   = new Date(endDate).getTime();
  const filtered = snapshots.filter(s => {
    const t = new Date(s.date).getTime();
    return t >= start && t <= end;
  });
  if (filtered.length === 0) return [];
  const base = new Date(
    filtered.reduce((min, s) => s.date < min ? s.date : min, filtered[0].date),
  ).getTime();
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

interface Segment {
  id: number;
  start: string;
  end: string;
  page: number;
}

function loadFromStorage(): Segment[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data) || data.length === 0) return null;
    return (data as unknown[]).map((d, i) => {
      if (typeof d !== 'object' || d === null) throw new Error();
      const obj = d as Record<string, unknown>;
      const start = obj['start'];
      const end   = obj['end'];
      if (typeof start !== 'string' || typeof end !== 'string') throw new Error();
      return { id: i + 1, start, end, page: 1 };
    });
  } catch {
    return null;
  }
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
              const c = row.netReturn >= 0 ? 'var(--up)' : 'var(--down)';
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
  const nextIdRef = useRef(2);

  const [segments, setSegments] = useState<Segment[]>(() => {
    const stored = loadFromStorage();
    if (!stored) return [{ id: 1, start: YEAR_START, end: YEAR_END, page: 1 }];
    nextIdRef.current = stored.length + 1;
    return stored;
  });
  const [activeSegId, setActiveSegId] = useState(1);

  /* 同步到 localStorage（僅存日期，不存分頁狀態） */
  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(segments.map(s => ({ start: s.start, end: s.end }))),
    );
  }, [segments]);

  const isModified =
    segments.length !== 1 ||
    segments[0].start !== YEAR_START ||
    segments[0].end !== YEAR_END;

  function addSegment() {
    const id = nextIdRef.current++;
    setSegments(prev => [...prev, { id, start: YEAR_START, end: YEAR_END, page: 1 }]);
    setActiveSegId(id);
  }

  function removeSegment(id: number) {
    const remaining = segments.filter(s => s.id !== id);
    setSegments(remaining);
    if (activeSegId === id && remaining.length > 0) {
      setActiveSegId(remaining[0].id);
    }
  }

  function updateDates(id: number, field: 'start' | 'end', value: string) {
    setSegments(prev => prev.map(s =>
      s.id === id ? { ...s, [field]: value, page: 1 } : s,
    ));
  }

  function resetToDefault() {
    nextIdRef.current = 2;
    setSegments([{ id: 1, start: YEAR_START, end: YEAR_END, page: 1 }]);
    setActiveSegId(1);
  }

  const segmentChartData = useMemo(
    () => segments.map((s, i) => ({
      label: `段 ${i + 1}`,
      data: toChartData(vm.snapshots, s.start, s.end),
    })),
    [vm.snapshots, segments],
  );

  const segmentRows = useMemo(
    () => segments.map(s => toSegmentRows(vm.snapshots, s.start, s.end)),
    [vm.snapshots, segments],
  );

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
                <div className="ft-section-header" style={{ padding: '10px 16px 6px' }}>
                  <span className="ft-section-title">績效比較</span>
                  {isModified && (
                    <button
                      className="btn-ghost"
                      style={{ fontSize: 'var(--text-xs)', padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
                      onClick={resetToDefault}
                      title="還原為預設區間"
                    >
                      <Icon name="restart_alt" size={14} />
                      還原預設
                    </button>
                  )}
                </div>

                <div style={{ padding: '10px 16px 8px' }}>
                  <div className="report-controls">
                    <div className="report-date-rows">
                      {segments.map((seg, i) => (
                        <div key={seg.id} className="report-range-row">
                          <span className="report-range-label">段 {i + 1}</span>
                          <input
                            type="date"
                            className="report-date-input"
                            value={seg.start}
                            onChange={e => updateDates(seg.id, 'start', e.target.value)}
                          />
                          <span style={{ color: 'var(--dim)', fontSize: 'var(--text-sm)' }}>—</span>
                          <input
                            type="date"
                            className="report-date-input"
                            value={seg.end}
                            onChange={e => updateDates(seg.id, 'end', e.target.value)}
                          />
                          {segments.length > 1 && (
                            <button
                              className="btn-icon"
                              onClick={() => removeSegment(seg.id)}
                              title="移除此段"
                            >
                              <Icon name="close" size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    <button
                      className="btn-ghost"
                      style={{ fontSize: 'var(--text-xs)', padding: '3px 10px', alignSelf: 'flex-start' }}
                      onClick={addSegment}
                    >
                      + 加入段落比較
                    </button>
                  </div>
                </div>

                <ReportChart seriesList={segmentChartData} targetRate={vm.rBase} height={300} />
              </div>

              {/* 快照明細 Tab */}
              <div className="ft-panel">
                <div className="report-tab-bar">
                  {segments.map((seg, i) => (
                    <button
                      key={seg.id}
                      className={`report-tab${activeSegId === seg.id ? ' report-tab--active' : ''}`}
                      onClick={() => setActiveSegId(seg.id)}
                    >
                      段 {i + 1}
                      <span className="report-tab__count">{segmentRows[i]?.length ?? 0}</span>
                    </button>
                  ))}
                </div>

                {segments.map((seg, i) => {
                  if (activeSegId !== seg.id) return null;
                  const rows = segmentRows[i] ?? [];
                  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
                  return (
                    <SnapshotTable
                      key={seg.id}
                      rows={rows}
                      page={seg.page}
                      totalPages={totalPages}
                      onPage={p => setSegments(prev =>
                        prev.map(s => s.id === seg.id ? { ...s, page: p } : s),
                      )}
                    />
                  );
                })}
              </div>
            </>
          )
        }
      </div>
    </div>
  );
}
