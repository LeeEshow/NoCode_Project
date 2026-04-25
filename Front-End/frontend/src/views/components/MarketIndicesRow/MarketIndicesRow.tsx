import { useRef, useState } from 'react';
import type { MarketIndexDTO, ExportIndicatorDTO } from '../../../types';
import './MarketIndicesRow.css';

/* ── 小數點後小字 helper ── */
function DecNum({ value }: { value: string }) {
  const dot = value.indexOf('.');
  if (dot === -1) return <>{value}</>;
  return <>{value.slice(0, dot)}<span className="dec-small">{value.slice(dot)}</span></>;
}

/* ── 景氣燈號色對應 ── */
const CYCLE_COLORS: Record<string, string> = {
  'red':          '#C96A6A',
  'yellow-red':   '#B8A06A',
  'green':        '#7CA88D',
  'yellow-blue':  '#6A9AB8',
  'blue':         '#6A8FB5',
};

/* ── 已知台灣本地指數 symbol（排除後視為國際指數）── */
const DOMESTIC_SYMBOLS = new Set(['^TWII', 'TAIEX', 'TXF', 'TXF_NIGHT', 'TX00.TW']);

/* FIX-01：國際指數排序優先度（S&P 500 → 費城半導體 → 其餘）*/
function intlPriority(idx: MarketIndexDTO): number {
  const sym  = idx.symbol.toLowerCase();
  const name = idx.name.toLowerCase();
  if (sym === '^gspc' || name.includes('s&p') || name.includes('s&amp;p') || name.includes('500')) return 1;
  if (sym.includes('sox') || sym.includes('soxx') || name.includes('半導體') || name.includes('sox')) return 2;
  return 3;
}

function isFuturesDay(idx: MarketIndexDTO) {
  return (
    idx.symbol === 'TXF' ||
    (idx.name.includes('台指期') && !idx.name.includes('夜盤'))
  );
}

function isFuturesNight(idx: MarketIndexDTO) {
  return idx.symbol === 'TXF_NIGHT' || idx.name.includes('夜盤');
}

function isTaiex(idx: MarketIndexDTO) {
  return (
    idx.symbol === '^TWII' ||
    idx.symbol === 'TAIEX' ||
    idx.name.includes('加權') ||
    idx.name.includes('台股大盤')
  );
}

function changeClass(isUp: boolean, change: number) {
  if (change === 0) return 'txt-flat';
  return isUp ? 'txt-up' : 'txt-down';
}

function changeArrow(isUp: boolean, change: number) {
  if (change === 0) return '—';
  return isUp ? '▲' : '▼';
}

function FmtChange({ idx }: { idx: MarketIndexDTO }) {
  const arrow = changeArrow(idx.isUp, idx.change);
  const sign  = idx.change > 0 ? '+' : '';
  const pct   = idx.changePct > 0 ? '+' : '';
  const changeStr = `${sign}${idx.change.toLocaleString()}`;
  const pctStr    = `${pct}${idx.changePct.toFixed(2)}%`;
  return (
    <>{arrow} <DecNum value={changeStr} />&nbsp;&nbsp;<DecNum value={pctStr} /></>
  );
}

/* 依台灣時間判斷盤中 / 夜盤（09:00–15:00 盤中，其餘夜盤）*/
function getTaiwanSession(): 'day' | 'night' {
  const taiwan = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  const totalMin = taiwan.getHours() * 60 + taiwan.getMinutes();
  return (totalMin >= 540 && totalMin < 900) ? 'day' : 'night';
}

/* ── 子元件 ── */

function StandardCard({ idx }: { idx: MarketIndexDTO }) {
  const cls = changeClass(idx.isUp, idx.change);
  const priceStr = idx.price.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <div className="mir-card">
      <div className="mir-card-label">{idx.name}</div>
      <div className="mir-card-value">
        <DecNum value={priceStr} />
      </div>
      <div className={`mir-card-change ${cls}`}><FmtChange idx={idx} /></div>
    </div>
  );
}

/* 台指期：單一卡片（114px），依台灣時間顯示盤中或夜盤 */
function FuturesCard({
  day,
  night,
}: {
  day:   MarketIndexDTO | undefined;
  night: MarketIndexDTO | undefined;
}) {
  if (!day && !night) return null;

  const session = getTaiwanSession();
  const active  = session === 'day' ? day : (night ?? day);
  const label   = session === 'day' ? '盤中' : '夜盤';
  if (!active) return null;

  const cls = changeClass(active.isUp, active.change);
  return (
    <div className="mir-card">
      <div className="mir-card-label">
        台指期 <span className="mir-futures-session-tag">{label}</span>
      </div>
      <div className="mir-card-value">
        <DecNum value={active.price.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} />
      </div>
      <div className={`mir-card-change ${cls}`}><FmtChange idx={active} /></div>
    </div>
  );
}

/* FIX-03：景氣燈號無資料時顯示「—」，不隱藏卡片 */
function BusinessCycleCard({ indicator }: { indicator: ExportIndicatorDTO | null }) {
  if (!indicator) {
    return (
      <div className="mir-card mir-card--cycle">
        <div className="mir-card-label">景氣燈號</div>
        <div className="mir-cycle-empty">—</div>
      </div>
    );
  }

  const color = CYCLE_COLORS[indicator.light] ?? '#6B7681';
  return (
    <div className="mir-card mir-card--cycle">
      <div className="mir-card-label">景氣燈號</div>
      <div className="mir-cycle-row">
        <div className="mir-cycle-dot" style={{ background: color }} />
        <span className="mir-cycle-label" style={{ color }}>{indicator.label}</span>
      </div>
      <div className="mir-cycle-meta">
        {indicator.month} · {indicator.score}分
      </div>
    </div>
  );
}

function SkeletonCards({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="mir-skeleton-card" />
      ))}
    </>
  );
}

/* ── 主元件 ── */

export interface MarketIndicesRowProps {
  indices:         MarketIndexDTO[];
  exportIndicator: ExportIndicatorDTO | null;
  loading:         boolean;
}

export default function MarketIndicesRow({
  indices,
  exportIndicator,
  loading,
}: MarketIndicesRowProps) {
  const rowRef   = useRef<HTMLDivElement>(null);
  const dragRef  = useRef({ active: false, startX: 0, scrollLeft: 0 });
  const [dragging, setDragging] = useState(false);

  function onMouseDown(e: React.MouseEvent) {
    const el = rowRef.current;
    if (!el) return;
    dragRef.current = { active: true, startX: e.clientX, scrollLeft: el.scrollLeft };
    setDragging(true);
  }

  function onMouseMove(e: React.MouseEvent) {
    const d = dragRef.current;
    if (!d.active || !rowRef.current) return;
    e.preventDefault();
    rowRef.current.scrollLeft = d.scrollLeft - (e.clientX - d.startX);
  }

  function onDragEnd() {
    dragRef.current.active = false;
    setDragging(false);
  }

  if (loading) {
    return (
      <div className="mir-row">
        <SkeletonCards count={8} />
      </div>
    );
  }

  const taiex        = indices.find(isTaiex);
  const futuresDay   = indices.find(isFuturesDay);
  const futuresNight = indices.find(isFuturesNight);

  const intl = indices
    .filter(i => !isTaiex(i) && !isFuturesDay(i) && !isFuturesNight(i) && !DOMESTIC_SYMBOLS.has(i.symbol))
    .sort((a, b) => intlPriority(a) - intlPriority(b));

  return (
    <div
      ref={rowRef}
      className="mir-row"
      style={{ cursor: dragging ? 'grabbing' : 'grab', userSelect: 'none' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onDragEnd}
      onMouseLeave={onDragEnd}
    >
      {taiex && <StandardCard idx={taiex} />}
      <FuturesCard day={futuresDay} night={futuresNight} />
      <BusinessCycleCard indicator={exportIndicator} />

      {(taiex || futuresDay || futuresNight) && intl.length > 0 && (
        <div className="mir-divider" />
      )}

      {intl.map(idx => (
        <StandardCard key={idx.symbol} idx={idx} />
      ))}
    </div>
  );
}
