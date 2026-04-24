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

/* ── 子元件 ── */

function StandardCard({ idx }: { idx: MarketIndexDTO }) {
  const cls = changeClass(idx.isUp, idx.change);
  return (
    <div className="mir-card">
      <div className="mir-card-label">{idx.name}</div>
      <div className="mir-card-value">
        <DecNum value={idx.price.toLocaleString()} />
      </div>
      <div className={`mir-card-change ${cls}`}><FmtChange idx={idx} /></div>
    </div>
  );
}

/* 台指期：雙列卡片（178px，同時顯示盤中與夜盤）*/
function FuturesCard({
  day,
  night,
}: {
  day:   MarketIndexDTO | undefined;
  night: MarketIndexDTO | undefined;
}) {
  if (!day && !night) return null;

  const renderRow = (idx: MarketIndexDTO, label: string) => {
    const cls   = changeClass(idx.isUp, idx.change);
    const arrow = changeArrow(idx.isUp, idx.change);
    const sign  = idx.changePct > 0 ? '+' : '';
    return (
      <div className="mir-futures-row" key={label}>
        <span className="mir-futures-session">{label}</span>
        <div style={{ textAlign: 'right' }}>
          <span className="mir-futures-val">{idx.price.toLocaleString()}</span>
          <span className={`mir-futures-chg ${cls}`}>{arrow} {sign}{idx.changePct.toFixed(2)}%</span>
        </div>
      </div>
    );
  };

  return (
    <div className="mir-card mir-card--futures">
      <div className="mir-card-label" style={{ marginBottom: 3 }}>台指期</div>
      {day   && renderRow(day,   '盤中')}
      {night && renderRow(night, '夜盤')}
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
  if (loading) {
    return (
      <div className="mir-row">
        <SkeletonCards count={8} />
      </div>
    );
  }

  const taiex       = indices.find(isTaiex);
  const futuresDay  = indices.find(isFuturesDay);
  const futuresNight = indices.find(isFuturesNight);

  /* FIX-01：國際指數依 S&P 500 → 費城半導體 → 其餘 排序 */
  const intl = indices
    .filter(i => !isTaiex(i) && !isFuturesDay(i) && !isFuturesNight(i) && !DOMESTIC_SYMBOLS.has(i.symbol))
    .sort((a, b) => intlPriority(a) - intlPriority(b));

  return (
    <div className="mir-row">
      {taiex && <StandardCard idx={taiex} />}
      <FuturesCard day={futuresDay} night={futuresNight} />
      {/* FIX-03：永遠渲染景氣燈號（無資料時顯示 —）*/}
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
