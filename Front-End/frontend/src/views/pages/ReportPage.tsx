import { useState, useMemo, useRef, useEffect } from 'react';
import PanelHeader from '../components/PanelHeader';
import LoadingPanel from '../components/LoadingPanel';
import Icon from '../components/Icon';
import { useReportViewModel } from '../../viewmodels/useReportViewModel';
import ReportChart, { type SeriesEntry } from './report/ReportChart';
import type { DailySnapshotDTO } from '../../types';
import { chartColors } from '../../styles';
import { computeMaxDrawdown } from '../../utils/downsideRisk';
import './report/report.css';

const PAGE_SIZE         = 30;
const YEAR_START        = '2026-01-01';
const YEAR_END          = '2026-12-31';
const STORAGE_KEY       = 'report_segments';
const TABLE_COLLAPSED_KEY = 'report_table_collapsed';

function fmt(n: number, d = 0) {
  return n.toLocaleString('zh-TW', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtPct(n: number) {
  return `${n >= 0 ? '+' : ''}${(n * 100).toFixed(2)}%`;
}
function fmtDate(d: string) { return d.replace(/-/g, '/'); }

function toPortfolioChartData(
  snapshots: DailySnapshotDTO[],
  start: string,
  end: string,
): SeriesEntry['data'] {
  const filtered = snapshots
    .filter(s => s.date >= start && s.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (filtered.length === 0) return [];

  return filtered.map(s => {
    const totalInvested = s.execCapital + s.reinvest;
    const netReturn     = s.stockValue + s.forexValue + s.cashBalance - totalInvested;
    const rate          = totalInvested > 0 ? netReturn / totalInvested : 0;
    return { date: s.date, returnRate: rate, netReturn };
  });
}

interface SegmentRow {
  date:             string;
  totalInvested:    number;
  stockValue:       number;
  forexValue:       number;
  cashBalance:      number;
  unrealizedProfit: number;
  netReturn:        number;
  returnRate:       number;
  note?:            string;
}

function toSegmentRows(snapshots: DailySnapshotDTO[], start: string, end: string): SegmentRow[] {
  return snapshots
    .filter(s => s.date >= start && s.date <= end)
    .map(s => {
      const totalInvested = s.execCapital + s.reinvest;
      const netReturn     = s.stockValue + s.forexValue + s.cashBalance - totalInvested;
      return {
        date: s.date,
        totalInvested,
        stockValue:       s.stockValue,
        forexValue:       s.forexValue,
        cashBalance:      s.cashBalance,
        unrealizedProfit: s.unrealizedProfit,
        netReturn,
        returnRate: totalInvested > 0 ? netReturn / totalInvested : 0,
        note:       s.note,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

interface Segment {
  id:    number;
  start: string;
  end:   string;
  page:  number;
}

function loadFromStorage(): Segment[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data) || data.length === 0) return null;
    return (data as unknown[]).map((d, i) => {
      if (typeof d !== 'object' || d === null) throw new Error();
      const obj   = d as Record<string, unknown>;
      const start = obj['start'];
      const end   = obj['end'];
      if (typeof start !== 'string' || typeof end !== 'string') throw new Error();
      return { id: i + 1, start, end, page: 1 };
    });
  } catch {
    return null;
  }
}

function SnapshotTable({ rows, page, totalPages, onPage, onNoteChange }: {
  rows:         SegmentRow[];
  page:         number;
  totalPages:   number;
  onPage:       (p: number) => void;
  onNoteChange: (date: string, note: string) => Promise<void>;
}) {
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editValue,   setEditValue]   = useState('');
  const [savingDates, setSavingDates] = useState<Set<string>>(new Set());

  function startEdit(date: string, currentNote: string) {
    setEditingDate(date);
    setEditValue(currentNote);
  }

  async function commitEdit(date: string) {
    if (editingDate !== date) return;
    setEditingDate(null);
    setSavingDates(prev => new Set([...prev, date]));
    try {
      await onNoteChange(date, editValue.trim());
    } catch {
      /* toast shown by ViewModel */
    } finally {
      setSavingDates(prev => {
        const next = new Set(prev);
        next.delete(date);
        return next;
      });
    }
  }

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
      <div className="ft-table-scroll">
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
                  <td>
                    {savingDates.has(row.date) ? (
                      <span style={{ color: 'var(--dim)', fontSize: 'var(--text-xs)' }}>儲存中…</span>
                    ) : editingDate === row.date ? (
                      <input
                        className="report-note-input"
                        type="text"
                        value={editValue}
                        autoFocus
                        onChange={e => setEditValue(e.target.value)}
                        onBlur={() => commitEdit(row.date)}
                        onKeyDown={e => {
                          if (e.key === 'Enter')  { e.preventDefault(); void commitEdit(row.date); }
                          if (e.key === 'Escape') { e.preventDefault(); setEditingDate(null); }
                        }}
                      />
                    ) : (
                      <span
                        className={row.note ? 'report-note-cell' : 'report-note-cell report-note-cell--hint'}
                        onClick={() => startEdit(row.date, row.note ?? '')}
                        title="點擊編輯備註"
                      >
                        {row.note || '+'}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="report-pagination">
          <button className="btn-icon" disabled={page === 1} onClick={() => onPage(page - 1)} aria-label="上一頁">
            <Icon name="chevron_left" size={24} />
          </button>
          <span className="report-pagination__info">{page} / {totalPages}</span>
          <button className="btn-icon" disabled={page === totalPages} onClick={() => onPage(page + 1)} aria-label="下一頁">
            <Icon name="chevron_right" size={24} />
          </button>
        </div>
      )}
    </>
  );
}

export default function ReportPage() {
  const vm         = useReportViewModel();
  const nextIdRef  = useRef(2);
  const [stockInput, setStockInput] = useState('');
  const [addType,    setAddType]    = useState<'snapshot' | 'stock'>('snapshot');
  const [addStart,   setAddStart]   = useState(vm.comparisonStart);
  const [addEnd,     setAddEnd]     = useState(vm.comparisonEnd);

  const [tableCollapsed, setTableCollapsed] = useState(
    () => localStorage.getItem(TABLE_COLLAPSED_KEY) !== 'false',
  );

  function toggleTable() {
    setTableCollapsed(c => {
      const next = !c;
      localStorage.setItem(TABLE_COLLAPSED_KEY, String(next));
      return next;
    });
  }

  const [segments, setSegments] = useState<Segment[]>(() => {
    const stored = loadFromStorage();
    if (!stored) return [{ id: 1, start: YEAR_START, end: YEAR_END, page: 1 }];
    nextIdRef.current = stored.length + 1;
    return stored;
  });
  const [activeSegId, setActiveSegId] = useState(1);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(segments.map(s => ({ start: s.start, end: s.end }))),
    );
  }, [segments]);

  const isModified =
    segments.length !== 1 ||
    segments[0].start !== YEAR_START ||
    segments[0].end   !== YEAR_END;

  function addSegment() {
    const id = nextIdRef.current++;
    setSegments(prev => [...prev, { id, start: addStart, end: addEnd, page: 1 }]);
    setActiveSegId(id);
  }

  function removeSegment(id: number) {
    const remaining = segments.filter(s => s.id !== id);
    setSegments(remaining);
    if (activeSegId === id && remaining.length > 0) setActiveSegId(remaining[0].id);
  }

  function resetToDefault() {
    nextIdRef.current = 2;
    setSegments([{ id: 1, start: YEAR_START, end: YEAR_END, page: 1 }]);
    setActiveSegId(1);
    setAddStart(YEAR_START);
    setAddEnd(YEAR_END);
  }

  function handleAdd() {
    if (addType === 'snapshot') {
      addSegment();
    } else {
      const id = stockInput.trim();
      if (!id) return;
      void vm.addStockComparison(id, addStart, addEnd);
      setStockInput('');
    }
  }

  const portfolioChartData = useMemo(
    () => segments.map((s, i): SeriesEntry => ({
      label: `段 ${i + 1}`,
      type:  'portfolio',
      data:  toPortfolioChartData(vm.snapshots, s.start, s.end),
    })),
    [vm.snapshots, segments],
  );

  const stockChartData = useMemo(
    (): SeriesEntry[] => vm.stockComparisons.map(item => {
      const baseClose = item.data[0]?.close ?? 0;
      return {
        label: `${item.stockId} ${item.name}`,
        type:  'stock',
        data:  item.data.map(d => ({
          date:       d.date,
          returnRate: baseClose > 0 ? (d.close - baseClose) / baseClose : 0,
        })),
      };
    }),
    [vm.stockComparisons],
  );

  const segmentRows = useMemo(
    () => segments.map(s => toSegmentRows(vm.snapshots, s.start, s.end)),
    [vm.snapshots, segments],
  );

  const activeSeg = segments.find(s => s.id === activeSegId);
  const activeMdd = useMemo(() => {
    if (!activeSeg || vm.snapshots.length < 2) return null;
    const filtered = vm.snapshots.filter(s => s.date >= activeSeg.start && s.date <= activeSeg.end);
    if (filtered.length < 2) return null;
    return computeMaxDrawdown(filtered);
  }, [vm.snapshots, activeSeg]);

  return (
    <div style={{ minWidth: 0 }}>
      <PanelHeader />

      <div style={{ padding: '16px 28px 28px' }}>
        {vm.loading
          ? <LoadingPanel loading rows={6} />
          : (
            <>
              {/* 比較設定 */}
              <div className="ft-panel" style={{ marginBottom: 16 }}>
                <div className="ft-section-header" style={{ padding: '6px 16px' }}>
                  <span className="ft-section-title">比較設定</span>

                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <input
                      type="date"
                      className="report-date-input"
                      value={addStart}
                      onChange={e => setAddStart(e.target.value)}
                    />
                    <span style={{ color: 'var(--dim)', fontSize: 'var(--text-sm)' }}>—</span>
                    <input
                      type="date"
                      className="report-date-input"
                      value={addEnd}
                      onChange={e => setAddEnd(e.target.value)}
                    />

                    <label className="report-add-type">
                      <input
                        type="radio"
                        name="report-add-type"
                        value="snapshot"
                        checked={addType === 'snapshot'}
                        onChange={() => setAddType('snapshot')}
                      />
                      快照
                    </label>

                    <label className="report-add-type">
                      <input
                        type="radio"
                        name="report-add-type"
                        value="stock"
                        checked={addType === 'stock'}
                        onChange={() => setAddType('stock')}
                      />
                      <input
                        className="report-stock-input"
                        type="text"
                        placeholder="股票代號"
                        value={stockInput}
                        onChange={e => setStockInput(e.target.value.toUpperCase())}
                        onFocus={() => setAddType('stock')}
                        onKeyDown={e => { if (e.key === 'Enter' && addType === 'stock') handleAdd(); }}
                        maxLength={8}
                        disabled={vm.comparisonLoading}
                        aria-label="輸入個股代碼"
                      />
                    </label>

                    <button
                      className="btn-ghost btn-ghost--accent"
                      onClick={handleAdd}
                      disabled={vm.comparisonLoading || (addType === 'stock' && !stockInput.trim())}
                      style={{ padding: '3px 10px' }}
                    >
                      {vm.comparisonLoading ? '…' : <><Icon name="add" size={20} /> 新增</>}
                    </button>

                    <button
                      className="btn-ghost"
                      onClick={resetToDefault}
                      disabled={!isModified && vm.stockComparisons.length === 0}
                      style={{ padding: '3px 10px' }}
                      title="還原為預設區間"
                    >
                      <Icon name="restart_alt" size={20} />
                      還原預設
                    </button>
                  </div>
                </div>

                {/* 標籤列 */}
                {(segments.length > 1 || segments[0].start !== YEAR_START || segments[0].end !== YEAR_END || vm.stockComparisons.length > 0) && (
                  <div className="report-stock-tags" style={{ padding: '8px 16px 10px' }}>
                    {segments.map((seg, i) => {
                      const c = chartColors[(i * 2 + 1) % chartColors.length];
                      return (
                        <span key={seg.id} className="report-stock-tag" style={{ borderColor: c, color: c, background: `${c}18` }}>
                          段{i + 1} {fmtDate(seg.start)}–{fmtDate(seg.end)}
                          {segments.length > 1 && (
                            <button
                              className="report-stock-tag__remove"
                              style={{ color: c }}
                              onClick={() => removeSegment(seg.id)}
                              aria-label={`移除段 ${i + 1}`}
                            >
                              <Icon name="close" size={12} />
                            </button>
                          )}
                        </span>
                      );
                    })}
                    {vm.stockComparisons.map((item, i) => {
                      const c = chartColors[(segments.length * 2 + i) % chartColors.length];
                      return (
                        <span key={item.stockId} className="report-stock-tag" style={{ borderColor: c, color: c, background: `${c}18` }}>
                          {item.stockId} {item.name}
                          <button
                            className="report-stock-tag__remove"
                            style={{ color: c }}
                            onClick={() => vm.removeStockComparison(item.stockId)}
                            aria-label={`移除 ${item.stockId}`}
                          >
                            <Icon name="close" size={12} />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 圖表 */}
              <div className="ft-panel" style={{ marginBottom: 16 }}>
                <div className="ft-section-header" style={{ padding: '10px 16px 6px' }}>
                  <span className="ft-section-title">績效比較</span>
                </div>
                <ReportChart
                  portfolioSeries={portfolioChartData}
                  stockSeries={stockChartData}
                  targetRate={vm.rBase}
                  height={320}
                />
              </div>

              {/* 快照明細 Tab */}
              <div className="ft-panel">
                <div
                  className="ft-section-header"
                  style={{ padding: '8px 16px', cursor: 'pointer', userSelect: 'none' }}
                  onClick={toggleTable}
                >
                  <span className="ft-section-title">快照明細</span>
                  <button
                    className="btn-icon"
                    aria-label={tableCollapsed ? '展開快照明細' : '收折快照明細'}
                    onClick={e => { e.stopPropagation(); toggleTable(); }}
                  >
                    <Icon name={tableCollapsed ? 'expand_more' : 'expand_less'} size={20} />
                  </button>
                </div>

                {!tableCollapsed && (
                  <>
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

                    {/* MDD 統計卡（選取區間）*/}
                    {activeMdd && (
                      <div style={{
                        display: 'flex', flexWrap: 'wrap', gap: '8px 20px',
                        padding: '10px 16px', borderBottom: '1px solid var(--border)',
                      }}>
                        {[
                          { label: '目前距高點', value: `${(activeMdd.currentDrawdown * 100).toFixed(1)}%`, warn: activeMdd.currentDrawdown < -0.05 },
                          { label: '最大回撤', value: `${(activeMdd.maxDrawdown * 100).toFixed(1)}%`, warn: activeMdd.maxDrawdown < -0.10 },
                          { label: '高點日期', value: activeMdd.peakDate || '—', warn: false },
                          { label: '低點日期', value: activeMdd.troughDate || '—', warn: false },
                          { label: '回復天數', value: activeMdd.isRecovered && activeMdd.recoveryDays != null ? `${activeMdd.recoveryDays} 天` : '—', warn: false },
                        ].map(({ label, value, warn }) => (
                          <span key={label} style={{ fontSize: 'var(--text-xs)' }}>
                            <span style={{ color: 'var(--dim)', marginRight: 4 }}>{label}</span>
                            <span style={{ color: warn ? 'var(--up)' : 'var(--muted)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
                          </span>
                        ))}
                      </div>
                    )}

                    {segments.map((seg, i) => {
                      if (activeSegId !== seg.id) return null;
                      const rows       = segmentRows[i] ?? [];
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
                          onNoteChange={vm.updateSnapshotNote}
                        />
                      );
                    })}
                  </>
                )}
              </div>
            </>
          )
        }
      </div>
    </div>
  );
}
