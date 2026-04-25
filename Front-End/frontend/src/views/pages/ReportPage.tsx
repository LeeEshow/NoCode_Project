import PanelHeader from '../components/PanelHeader';
import LoadingPanel from '../components/LoadingPanel';
import { useReportViewModel } from '../../viewmodels/useReportViewModel';
import './report/report.css';

function fmt(n: number, d = 0) {
  return n.toLocaleString('zh-TW', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtPct(n: number) {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${(n * 100).toFixed(2)}%`;
}

function fmtDate(dateStr: string) {
  return dateStr.replace(/-/g, '/');
}

export default function ReportPage() {
  const vm = useReportViewModel();

  const s = vm.summary;
  const isUp = (s?.returnValue ?? 0) >= 0;
  const returnColor = isUp ? 'var(--up)' : 'var(--down)';

  return (
    <div style={{ minWidth: 0 }}>
      <PanelHeader />

      <div style={{ padding: '16px 28px 28px' }}>

        {vm.loading
          ? <LoadingPanel loading rows={4} />
          : (
            <>
              {/* 摘要卡片列 */}
              <div className="report-summary-row">
                <div className="report-stat-card">
                  <span className="report-stat-card__label">累計投入</span>
                  <span className="report-stat-card__value">{s ? fmt(s.totalInvested) : '—'}</span>
                </div>
                <div className="report-stat-card">
                  <span className="report-stat-card__label">股票現值</span>
                  <span className="report-stat-card__value">{s ? fmt(s.stockValue) : '—'}</span>
                </div>
                <div className="report-stat-card">
                  <span className="report-stat-card__label">活存</span>
                  <span className="report-stat-card__value">{s ? fmt(s.cashBalance) : '—'}</span>
                </div>
                <div className="report-stat-card">
                  <span className="report-stat-card__label">總資產</span>
                  <span className="report-stat-card__value">{s ? fmt(s.totalAsset) : '—'}</span>
                </div>
                <div className="report-stat-card report-stat-card--accent">
                  <span className="report-stat-card__label">整體報酬率</span>
                  <span className="report-stat-card__value" style={{ color: returnColor }}>
                    {s ? fmtPct(s.returnRate) : '—'}
                  </span>
                  <span className="report-stat-card__sub" style={{ color: returnColor }}>
                    {s ? `${s.returnValue >= 0 ? '+' : ''}${fmt(s.returnValue)}` : ''}
                  </span>
                </div>
              </div>

              {/* 快照歷史表 */}
              <div className="ft-panel">
                {vm.rows.length === 0
                  ? (
                    <div style={{ padding: '32px', textAlign: 'center', color: 'var(--dim)', fontSize: 'var(--text-sm)' }}>
                      尚無快照紀錄
                    </div>
                  )
                  : (
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
                            <th>已實現損益</th>
                            <th>淨損益</th>
                            <th>報酬率</th>
                            <th>備註</th>
                          </tr>
                        </thead>
                        <tbody>
                          {vm.rows.map(row => {
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
                                <td className="num-value" style={{ color: row.realizedProfit >= 0 ? 'var(--up)' : 'var(--down)' }}>
                                  {row.realizedProfit >= 0 ? '+' : ''}{fmt(row.realizedProfit)}
                                </td>
                                <td className="num-value" style={{ color: c }}>
                                  {row.netReturn >= 0 ? '+' : ''}{fmt(row.netReturn)}
                                </td>
                                <td className="num-value" style={{ color: c }}>
                                  {fmtPct(row.returnRate)}
                                </td>
                                <td style={{ color: 'var(--dim)', fontSize: 'var(--text-sm)' }}>
                                  {row.note ?? ''}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )
                }
              </div>
            </>
          )
        }
      </div>
    </div>
  );
}
