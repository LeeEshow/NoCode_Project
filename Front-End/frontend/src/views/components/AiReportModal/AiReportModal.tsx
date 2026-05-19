import Modal from '../Modal/Modal';
import Icon from '../Icon';
import type { AiReportDTO, AiReportMarketState } from '../../../types';
import './AiReportModal.css';

function formatGeneratedAt(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function marketStateBadgeClass(state: AiReportMarketState): string {
  if (state === 'Risk-On')  return 'ai-report__badge ai-report__badge--up';
  if (state === 'Risk-Off') return 'ai-report__badge ai-report__badge--down';
  return 'ai-report__badge ai-report__badge--accent';
}

function actionClass(action: string): string {
  if (action === '加碼') return 'ai-report__action ai-report__action--buy';
  if (action === '減碼') return 'ai-report__action ai-report__action--sell';
  if (action === '持有') return 'ai-report__action ai-report__action--hold';
  return 'ai-report__action ai-report__action--watch';
}

interface AiReportModalProps {
  open:           boolean;
  onClose:        () => void;
  report:         AiReportDTO | null;
  loading:        boolean;
  error:          string | null;
  availableDates: string[];
  onLoadByDate:   (date: string) => void;
}

export default function AiReportModal({
  open, onClose, report, loading, error, availableDates, onLoadByDate,
}: AiReportModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="AI 每日早報" size="lg">
      {loading ? (
        <div className="ai-report__loading">
          <Icon name="progress_activity" size={24} style={{ animation: 'spin 1s linear infinite' }} />
          <span>載入報告中…</span>
        </div>
      ) : error ? (
        <div className="ai-report__error">
          <Icon name="error_outline" size={20} />
          <span>{error}</span>
        </div>
      ) : report ? (
        <div className="ai-report">
          <div className="ai-report__meta">
            <span className="ai-report__date num-value">{report.reportDate}</span>
            <span className={marketStateBadgeClass(report.marketState)}>{report.marketState}</span>
            <span className="ai-report__generated">生成於 {formatGeneratedAt(report.generatedAt)}</span>
            {availableDates.length > 1 && (
              <select
                className="ai-report__date-select"
                value={report.reportDate}
                onChange={e => onLoadByDate(e.target.value)}
                aria-label="切換歷史報告"
              >
                {availableDates.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            )}
          </div>

          <section className="ai-report__section">
            <h3 className="ai-report__section-title">市場總結</h3>
            <p className="ai-report__summary">{report.summary}</p>
          </section>

          <section className="ai-report__section">
            <h3 className="ai-report__section-title">曝險分析</h3>
            <div className="ai-report__exposure">
              <div className="ai-report__exposure-item">
                <span className="ai-report__exposure-label">目前比例</span>
                <span className="ai-report__exposure-value num-value">{report.exposureAnalysis.currentRatio}%</span>
              </div>
              <Icon name="arrow_forward" size={16} style={{ color: 'var(--dim)', flexShrink: 0 }} />
              <div className="ai-report__exposure-item">
                <span className="ai-report__exposure-label">建議比例</span>
                <span className="ai-report__exposure-value num-value">{report.exposureAnalysis.suggestedRatio}%</span>
              </div>
              <div className="ai-report__exposure-action">{report.exposureAnalysis.action}</div>
            </div>
          </section>

          {report.stockStrategies.length > 0 && (
            <section className="ai-report__section">
              <h3 className="ai-report__section-title">個股策略</h3>
              <div className="ft-table-scroll">
                <table className="ft-table ai-report__strategies-table">
                  <thead>
                    <tr>
                      <th>代碼</th>
                      <th>名稱</th>
                      <th>建議</th>
                      <th className="num-value">進場價</th>
                      <th className="num-value">出場價</th>
                      <th>時機</th>
                      <th>理由</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.stockStrategies.map(s => (
                      <tr key={s.stockId}>
                        <td><span className="stock-code">{s.stockId}</span></td>
                        <td><span className="stock-name">{s.stockName}</span></td>
                        <td><span className={actionClass(s.action)}>{s.action}</span></td>
                        <td className="num-value">{s.entryPrice != null ? s.entryPrice.toLocaleString() : '—'}</td>
                        <td className="num-value">{s.exitPrice != null ? s.exitPrice.toLocaleString() : '—'}</td>
                        <td style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>{s.timing}</td>
                        <td style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)', maxWidth: 200 }}>{s.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {report.riskWarnings.length > 0 && (
            <section className="ai-report__section">
              <h3 className="ai-report__section-title">風險警示</h3>
              <ul className="ai-report__warnings" aria-live="polite">
                {report.riskWarnings.map((w, i) => (
                  <li key={i} className="ai-report__warning-item">
                    <Icon name="warning" size={14} style={{ color: 'var(--up)', flexShrink: 0 }} />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : (
        <div className="ai-report__empty">
          <Icon name="auto_awesome" size={32} style={{ color: 'var(--dim)' }} />
          <p>今日報告尚未生成</p>
        </div>
      )}
    </Modal>
  );
}
