import type { MarketIndexDTO, ExportIndicatorDTO } from '../../../types';
import './MarketIndicesRow.css';

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
  return idx.symbol === '^TWII' || idx.symbol === 'TAIEX' || idx.name.includes('加權');
}

function changeClass(isUp: boolean, change: number) {
  if (change === 0) return 'txt-flat';
  return isUp ? 'txt-up' : 'txt-down';
}

function changeArrow(isUp: boolean, change: number) {
  if (change === 0) return '—';
  return isUp ? '▲' : '▼';
}

function fmtChange(idx: MarketIndexDTO) {
  const arrow = changeArrow(idx.isUp, idx.change);
  const sign  = idx.change > 0 ? '+' : '';
  const pct   = idx.changePct > 0 ? '+' : '';
  return `${arrow} ${sign}${idx.change.toLocaleString()} \u00a0${pct}${idx.changePct.toFixed(2)}%`;
}

/* ── 子元件 ── */

function StandardCard({ idx }: { idx: MarketIndexDTO }) {
  const cls = changeClass(idx.isUp, idx.change);
  return (
    <div className="mir-card">
      <div className="mir-card-label">{idx.name}</div>
      <div className="mir-card-value">{idx.price.toLocaleString()}</div>
      <div className={`mir-card-change ${cls}`}>{fmtChange(idx)}</div>
    </div>
  );
}

function FuturesCard({
  day,
  night,
}: {
  day:   MarketIndexDTO | undefined;
  night: MarketIndexDTO | undefined;
}) {
  if (!day && !night) return null;
  return (
    <div className="mir-card mir-card--futures">
      <div className="mir-card-label" style={{ marginBottom: 3 }}>台指期</div>
      {day && (
        <div className="mir-futures-row">
          <span className="mir-futures-session">盤中</span>
          <div style={{ textAlign: 'right' }}>
            <span className="mir-futures-val">{day.price.toLocaleString()}</span>
            <span className={`mir-futures-chg ${changeClass(day.isUp, day.change)}`}>
              {changeArrow(day.isUp, day.change)} {day.changePct > 0 ? '+' : ''}{day.changePct.toFixed(2)}%
            </span>
          </div>
        </div>
      )}
      {night && (
        <div className="mir-futures-row">
          <span className="mir-futures-session">夜盤</span>
          <div style={{ textAlign: 'right' }}>
            <span className="mir-futures-val">{night.price.toLocaleString()}</span>
            <span className={`mir-futures-chg ${changeClass(night.isUp, night.change)}`}>
              {changeArrow(night.isUp, night.change)} {night.changePct > 0 ? '+' : ''}{night.changePct.toFixed(2)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function BusinessCycleCard({ indicator }: { indicator: ExportIndicatorDTO }) {
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

  const taiex      = indices.find(isTaiex);
  const futuresDay = indices.find(isFuturesDay);
  const futuresNight = indices.find(isFuturesNight);
  const intl = indices.filter(
    i => !isTaiex(i) && !isFuturesDay(i) && !isFuturesNight(i) && !DOMESTIC_SYMBOLS.has(i.symbol)
  );

  return (
    <div className="mir-row">
      {taiex && <StandardCard idx={taiex} />}
      <FuturesCard day={futuresDay} night={futuresNight} />
      {exportIndicator && <BusinessCycleCard indicator={exportIndicator} />}

      {(taiex || futuresDay || futuresNight || exportIndicator) && intl.length > 0 && (
        <div className="mir-divider" />
      )}

      {intl.map(idx => (
        <StandardCard key={idx.symbol} idx={idx} />
      ))}
    </div>
  );
}
