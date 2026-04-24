import { useEffect, Fragment } from 'react';
import SparkLine from '../../components/Charts/SparkLine';
import KLineChart from '../../components/Charts/KLineChart';
import LoadingPanel from '../../components/LoadingPanel';
import type { HoldingDTO, KLineDTO, StockProfileDTO } from '../../../types';

function fmt(n: number, decimals = 0) {
  return n.toLocaleString('zh-TW', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/* ── 操作按鈕 ── */
function OpBtn({
  title, accent, onClick, children,
}: { title: string; accent?: boolean; onClick: (e: React.MouseEvent) => void; children: React.ReactNode }) {
  return (
    <button
      className={`btn-icon${accent ? ' accent' : ''}`}
      title={title}
      onClick={e => { e.stopPropagation(); onClick(e); }}
    >
      {children}
    </button>
  );
}

/* ── 展開區：股票基礎數據（P2-16）── */
function StockProfileSection({ profile }: { profile: StockProfileDTO }) {
  const fields: { label: string; value: string | undefined }[] = [
    { label: '產業', value: profile.industry },
    { label: 'EPS',  value: profile.eps  != null ? fmt(profile.eps,  2) : undefined },
    { label: 'P/E',  value: profile.pe   != null ? fmt(profile.pe,   2) : undefined },
    { label: 'P/B',  value: profile.pb   != null ? fmt(profile.pb,   2) : undefined },
    { label: '殖利率', value: profile.dividendYield != null ? `${fmt(profile.dividendYield, 2)}%` : undefined },
    { label: '市值(億)',  value: profile.marketCap != null
        ? fmt(profile.marketCap / 1e8, 2)
        : undefined },
  ].filter(f => f.value !== undefined);

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 24px', padding: '10px 16px 14px' }}>
      {fields.map(f => (
        <div key={f.label} style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--dim)' }}>{f.label}</span>
          <span className="mono" style={{ fontSize: 'var(--text-md)', color: 'var(--text-value)' }}>
            {f.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── 展開區：K線圖（P2-15）── */
function KLineSection({ data }: { data: KLineDTO[] }) {
  const bars = data.map(d => ({
    time: d.date, open: d.open, high: d.high, low: d.low, close: d.close, volume: d.volume,
  }));
  return (
    <div style={{ padding: '8px 16px 4px' }}>
      <KLineChart data={bars} height={260} showVolume showMA />
    </div>
  );
}

/* ── 展開行 ── */
function ExpandRow({
  colSpan, code, kline, profile, loadingExpand,
}: {
  colSpan: number;
  code: string;
  kline:   KLineDTO[]       | undefined;
  profile: StockProfileDTO  | undefined;
  loadingExpand: boolean;
}) {
  return (
    <tr style={{ background: 'rgba(255,255,255,0.012)' }}>
      <td
        colSpan={colSpan}
        style={{ padding: 0, borderBottom: '1px solid var(--border)' }}
      >
        {loadingExpand
          ? <div style={{ padding: 16 }}><LoadingPanel loading type="spinner" /></div>
          : (
            <>
              {kline   && <KLineSection data={kline} />}
              {profile && <StockProfileSection profile={profile} />}
              {!kline && !profile && (
                <div style={{ padding: '12px 16px', fontSize: 'var(--text-sm)', color: 'var(--dim)' }}>
                  無法載入 {code} 資料
                </div>
              )}
            </>
          )
        }
      </td>
    </tr>
  );
}

/* ── 主列 ── */
function HoldingRow({
  h, sparkline, isExpanded,
  onToggle, onHistory, onAddTx,
}: {
  h:          HoldingDTO;
  sparkline:  number[];
  isExpanded: boolean;
  onToggle:   (code: string) => void;
  onHistory:  (code: string, name: string) => void;
  onAddTx:    (code: string, name: string) => void;
}) {
  const cls = h.changePct === 0 ? 'txt-flat' : (h.isUp ? 'txt-up' : 'txt-down');
  const arrow = h.changePct === 0 ? '—' : (h.isUp ? '▲' : '▼');
  const sign  = h.changePct > 0 ? '+' : '';

  return (
    <tr
      onClick={() => onToggle(h.stockCode)}
      style={{ background: isExpanded ? 'rgba(255,255,255,0.02)' : undefined }}
    >
      <td>
        <div className="stock-code">{h.stockCode}</div>
        <div className="stock-name">{h.stockName}</div>
      </td>
      <td className="right">
        <span className="num-value">{fmt(h.currentPrice, 2)}</span>
      </td>
      <td className="right">
        <span className={`change-tag ${cls}`}>
          {arrow} {sign}{fmt(h.change, 2)}&nbsp;{sign}{fmt(h.changePct, 2)}%
        </span>
      </td>
      <td className="center">
        {sparkline.length > 1
          ? <div style={{ width: 72, height: 24, display: 'inline-block' }}>
              <SparkLine data={sparkline} height={24} />
            </div>
          : <span style={{ fontSize: 'var(--text-sm)', color: 'var(--dim)' }}>—</span>
        }
      </td>
      <td className="right">
        <span className="num-value">{fmt(h.costAvg, 2)}</span>
      </td>
      <td className="right">
        <span className="num-value">{fmt(h.shares, 2)}</span>
      </td>
      <td className="right">
        <span className={`mono ${h.returnPct === 0 ? 'txt-flat' : (h.returnPct > 0 ? 'txt-up' : 'txt-down')}`}
          style={{ fontWeight: 600 }}>
          {h.returnPct > 0 ? '+' : ''}{fmt(h.returnPct, 2)}%
        </span>
      </td>
      <td className="center">
        <div style={{ display: 'inline-flex', gap: 5 }}>
          <OpBtn title="交易紀錄" onClick={() => onHistory(h.stockCode, h.stockName)}>
            <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path d="M9 12h6M9 16h6M9 8h6M5 3h14a2 2 0 012 2v16a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z"/>
            </svg>
          </OpBtn>
          <OpBtn title="新增交易" accent onClick={() => onAddTx(h.stockCode, h.stockName)}>
            <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 5v14M5 12h14"/>
            </svg>
          </OpBtn>
        </div>
      </td>
    </tr>
  );
}

/* ── 主元件（P2-13 ~ P2-16）── */
export interface HoldingsTableProps {
  items:        HoldingDTO[];
  sparklines:   Record<string, number[]>;
  klines:       Record<string, KLineDTO[]>;
  profiles:     Record<string, StockProfileDTO>;
  expandedCode: string | null;
  onToggle:     (code: string) => void;
  onExpandLoad: (code: string) => void;
  onHistory:    (code: string, name: string) => void;
  onAddTx:      (code: string, name: string) => void;
}

export default function HoldingsTable({
  items, sparklines, klines, profiles,
  expandedCode, onToggle, onExpandLoad, onHistory, onAddTx,
}: HoldingsTableProps) {
  /* 展開時確保資料已載入 */
  useEffect(() => {
    if (expandedCode) onExpandLoad(expandedCode);
  }, [expandedCode, onExpandLoad]);

  const COL_COUNT = 8;

  return (
    <table className="ft-table">
      <thead>
        <tr>
          <th>代號 / 名稱</th>
          <th className="right">即時報價</th>
          <th className="right">漲跌幅</th>
          <th className="center">90日走勢</th>
          <th className="right">成本均價</th>
          <th className="right">持有（張）</th>
          <th className="right">損益 %</th>
          <th className="center">操作</th>
        </tr>
      </thead>
      <tbody>
        {items.map(h => {
          const isExpanded = expandedCode === h.stockCode;
          const loadingExpand = isExpanded && !klines[h.stockCode] && !profiles[h.stockCode];
          return (
            <Fragment key={h.stockCode}>
              <HoldingRow
                h={h}
                sparkline={sparklines[h.stockCode] ?? []}
                isExpanded={isExpanded}
                onToggle={onToggle}
                onHistory={onHistory}
                onAddTx={onAddTx}
              />
              {isExpanded && (
                <ExpandRow
                  colSpan={COL_COUNT}
                  code={h.stockCode}
                  kline={klines[h.stockCode]}
                  profile={profiles[h.stockCode]}
                  loadingExpand={loadingExpand}
                />
              )}
            </Fragment>
          );
        })}
        {items.length === 0 && (
          <tr>
            <td colSpan={COL_COUNT} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--dim)' }}>
              尚無持股資料
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
