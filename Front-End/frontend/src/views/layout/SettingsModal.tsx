import { useState, useEffect, useCallback } from 'react';
import Modal from '../components/Modal/Modal';
import Icon from '../components/Icon';
import { useStockListViewModel } from '../../viewmodels/useStockListViewModel';
import { useSystemDiagnosticsViewModel } from '../../viewmodels/useSystemDiagnosticsViewModel';
import { fetchSnapshot, triggerSnapshotRecord } from '../../models/snapshotModel';
import { toast } from '../components/Toast';
import type { DailySnapshotDTO } from '../../types';
import type { DiagResult, SystemStatusDTO, QuoteDiagData, HoldingPricesDiagData, MarketIndicesDiagData } from '../../models/systemModel';
import type { ReinitializeStatus } from '../../viewmodels/useSystemDiagnosticsViewModel';
import './SettingsModal.css';

/* ── 工具 ── */
function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '尚未更新';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function todayStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* ── 股票清單 Card ── */
function StockListSection() {
  const { count, updatedAt, loading, refreshing, refresh } = useStockListViewModel();

  async function handleRefresh() {
    try {
      const meta = await refresh();
      toast.success(`股票清單已更新，共 ${meta.count} 筆`);
    } catch {
      toast.error('更新失敗，請稍後再試');
    }
  }

  return (
    <div className="settings-card">
      <div className="settings-card__header">
        <span className="settings-card__title">股票清單</span>
        <button
          className="btn-ghost"
          onClick={handleRefresh}
          disabled={loading || refreshing}
          aria-label={refreshing ? '更新中' : undefined}
        >
          {refreshing
            ? <span className="icon-spin" aria-hidden="true"><Icon name="progress_activity" size={14} /></span>
            : '立即更新'}
        </button>
      </div>
      <div className="settings-kv-row">
        <div className="settings-kv-pair">
          <span className="settings-kv__key">總筆數</span>
          <span className="settings-kv__val">{loading ? '—' : `${count.toLocaleString()} 筆`}</span>
        </div>
        <div className="settings-kv-pair">
          <span className="settings-kv__key">上次更新</span>
          <span className="settings-kv__val">{loading ? '載入中…' : formatDateTime(updatedAt)}</span>
        </div>
      </div>
    </div>
  );
}

/* ── 每日快照 Card ── */
function SnapshotSection() {
  const [snapshot, setSnapshot]   = useState<DailySnapshotDTO | null>(null);
  const [loading, setLoading]     = useState(true);
  const [recording, setRecording] = useState(false);

  const loadToday = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSnapshot(todayStr());
      setSnapshot(data);
    } catch {
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadToday(); }, [loadToday]);

  async function handleRecord() {
    setRecording(true);
    try {
      const data = await triggerSnapshotRecord();
      setSnapshot(data);
      const dateLabel = data.recordedAt
        ? formatDateTime(data.recordedAt).slice(0, 10)
        : todayStr();
      toast.success(`今日快照已記錄（${dateLabel}）`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '記錄失敗');
    } finally {
      setRecording(false);
    }
  }

  const recordedAt = snapshot?.recordedAt ?? null;

  return (
    <div className="settings-card">
      <div className="settings-card__header">
        <span className="settings-card__title">每日快照</span>
        <button
          className="btn-ghost"
          onClick={handleRecord}
          disabled={loading || recording}
          aria-label={recording ? '記錄中' : undefined}
        >
          {recording
            ? <span className="icon-spin" aria-hidden="true"><Icon name="progress_activity" size={14} /></span>
            : '記錄快照'}
        </button>
      </div>
      <div className="settings-kv-row">
        <div className="settings-kv-pair">
          <span className="settings-kv__key">今日狀態</span>
          <span className="settings-kv__val">
            {loading ? '載入中…' : (recordedAt ? formatDateTime(recordedAt) : '尚未記錄')}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── API 診斷：結果列 ── */
function DiagResultRow<T>({
  label,
  result,
  loading,
  renderDetail,
}: {
  label:        string;
  result:       DiagResult<T> | null;
  loading:      boolean;
  renderDetail: (data: T) => string;
}) {
  if (!result && !loading) return null;

  let statusEl: React.ReactNode;
  let statusColor: string;
  let detail = '';

  if (loading) {
    statusEl    = <span className="icon-spin" aria-label="測試中" role="img"><Icon name="progress_activity" size={14} aria-hidden="true" /></span>;
    statusColor = 'var(--muted)';
  } else if (!result) {
    return null;
  } else if (!result.ok) {
    const isTimeout = result.error?.toLowerCase().includes('timeout') || result.error?.toLowerCase().includes('15');
    statusEl    = isTimeout ? 'TIMEOUT' : 'ERROR';
    statusColor = 'var(--up)';
    detail      = isTimeout ? '前端等待超過 15 秒' : (result.error ?? '未知錯誤');
  } else if (result.degraded) {
    statusEl    = 'DEGRADED';
    statusColor = 'var(--accent)';
    detail      = result.data ? `後端已降級回應  ${renderDetail(result.data)}` : '後端已降級回應';
  } else {
    statusEl    = 'OK';
    statusColor = 'var(--down)';
    detail      = result.data ? renderDetail(result.data) : '';
  }

  return (
    <div className="diag-result-row">
      <span className="diag-result-row__name">{label}</span>
      <span className="diag-result-row__status" style={{ color: statusColor }}>{statusEl}</span>
      {!loading && result && (
        <span className="diag-result-row__elapsed">{result.elapsedMs} ms</span>
      )}
      {detail && <span className="diag-result-row__detail">{detail}</span>}
    </div>
  );
}

/* ── API 診斷：系統狀態顯示 ── */
function SystemStatusDisplay({ data }: { data: SystemStatusDTO }) {
  const boolLabel = (v: boolean | undefined) =>
    v == null
      ? <span style={{ color: 'var(--dim)' }}>—</span>
      : <span style={{ color: v ? 'var(--down)' : 'var(--up)' }}>{v ? '是' : '否'}</span>;

  const sw      = data.apiSwitch;
  const circuit = sw?.circuit;
  const shioaji = sw?.providers?.shioaji;

  if (!sw) {
    return (
      <div className="diag-status-block">
        <span className="diag-status-block__group">系統狀態（原始回應）</span>
        <span style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
          {JSON.stringify(data)}
        </span>
      </div>
    );
  }

  const circuitStateLabel = (s: string | undefined) => {
    if (!s) return '—';
    if (s === 'OPEN')      return '跳闸';
    if (s === 'HALF_OPEN') return '半開';
    if (s === 'CLOSED')    return '閉合';
    return s;
  };

  return (
    <div className="diag-status-block">
      {/* API Switch */}
      <span className="diag-status-block__group">API Switch</span>
      <div className="diag-status-grid">
        <span className="diag-status-grid__key">報價來源</span>
        <span className="diag-status-grid__value">{sw.source ?? '—'}</span>
        <span className="diag-status-grid__key">盤中</span>
        <span className="diag-status-grid__value">{boolLabel(sw.marketOpen)}</span>
        <span className="diag-status-grid__key">Shioaji 啟用</span>
        <span className="diag-status-grid__value">{boolLabel(sw.shioajiEnabled)}</span>
      </div>

      {/* Circuit Breaker */}
      {circuit && (
        <>
          <span className="diag-status-block__group">熔斷器</span>
          <div className="diag-status-grid">
            <span className="diag-status-grid__key">熔斷狀態</span>
            <span className="diag-status-grid__value"
              style={{ color: circuit.state === 'OPEN' ? 'var(--up)' : circuit.state === 'HALF_OPEN' ? 'var(--accent)' : undefined }}>
              {circuitStateLabel(circuit.state)}
            </span>
            <span className="diag-status-grid__key">失敗次數</span>
            <span className="diag-status-grid__value">{circuit.failureCount ?? '—'}</span>
          </div>
        </>
      )}

      {/* Shioaji Manager */}
      {shioaji && (
        <>
          <span className="diag-status-block__group">Shioaji Manager</span>
          <div className="diag-status-grid">
            <span className="diag-status-grid__key">已連線</span>
            <span className="diag-status-grid__value">{boolLabel(shioaji.connected)}</span>
            <span className="diag-status-grid__key">已初始化</span>
            <span className="diag-status-grid__value">{boolLabel(shioaji.initialized)}</span>
            {shioaji.reinitializing && !shioaji.initialized && (
              <>
                <span className="diag-status-grid__key">重新初始化中</span>
                <span className="diag-status-grid__value" style={{ color: 'var(--accent)' }}>
                  <span className="icon-spin" aria-hidden="true"><Icon name="progress_activity" size={13} /></span>
                  {' '}進行中
                </span>
              </>
            )}
            <span className="diag-status-grid__key">訂閱股票數</span>
            <span className="diag-status-grid__value">{shioaji.subscribedStocks ?? '—'}</span>
            <span className="diag-status-grid__key">快取股票數</span>
            <span className="diag-status-grid__value">{shioaji.cachedStocks ?? '—'}</span>
          </div>
        </>
      )}
    </div>
  );
}

/* ── 重新初始化狀態文字 ── */
function ReinitializeStatusChip({ status, pollCount, error }: {
  status:    ReinitializeStatus;
  pollCount: number;
  error:     string | null;
}) {
  if (status === 'idle') return null;

  let text: string;
  let color: string;

  switch (status) {
    case 'triggering':
      text  = '觸發中…';
      color = 'var(--muted)';
      break;
    case 'polling':
      text  = `輪詢中（第 ${pollCount} 次）`;
      color = 'var(--accent)';
      break;
    case 'success':
      text  = '已初始化';
      color = 'var(--down)';
      break;
    case 'timeout':
      text  = '逾時（20 秒未完成）';
      color = 'var(--up)';
      break;
    case 'error':
      text  = error ?? '觸發失敗';
      color = 'var(--up)';
      break;
  }

  return (
    <span className="diag-reinit-status" style={{ color }}>
      {(status === 'triggering' || status === 'polling') && (
        <span className="icon-spin" aria-hidden="true" style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: 4 }}>
          <Icon name="progress_activity" size={13} />
        </span>
      )}
      {text}
    </span>
  );
}

/* ── API 診斷 Section ── */
function ApiDiagnosticsSection() {
  const [stockId, setStockId] = useState('2330');
  const diag = useSystemDiagnosticsViewModel();

  // 開啟 modal 時自動載入系統狀態（modal 關閉時 Radix Portal 會 unmount，重開即重載）
  const { loadStatus } = diag;
  useEffect(() => { loadStatus(); }, [loadStatus]);

  const hasAnyResult =
    diag.stockQuoteResult    !== null ||
    diag.holdingPricesResult !== null ||
    diag.marketIndicesResult !== null;

  const renderQuote = (d: QuoteDiagData) =>
    `${d.price} / ${d.change >= 0 ? '+' : ''}${d.change} / ${d.marketStatus} / ${d.quoteSource} / ${d.quoteStatus}`;

  const renderHoldings = (d: HoldingPricesDiagData) => {
    const preview = d.preview.map(p => `${p.stockCode}@${p.currentPrice}`).join(' / ');
    return `共 ${d.count} 筆  ${preview}`;
  };

  const renderMarket = (d: MarketIndicesDiagData) =>
    `共 ${d.count} 筆  加權 ${d.hasTwii ? '✓' : '✗'}  期貨 ${d.hasFutures ? '✓' : '✗'}`;

  return (
    <div className="settings-card">
      <div className="settings-card__header">
        <span className="settings-card__title">後端診斷</span>
        <button
          className="btn-ghost"
          onClick={diag.loadStatus}
          disabled={diag.anyTesting}
          aria-label={diag.loadingStatus ? '載入中' : undefined}
        >
          {diag.loadingStatus
            ? <span className="icon-spin" aria-hidden="true"><Icon name="progress_activity" size={14} /></span>
            : '重讀狀態'}
        </button>
      </div>

      {/* 操作 */}
      <div className="diag-controls">
        <div className="diag-controls__row">
          <label className="diag-stock-input">
            股票代號
            <input
              type="text"
              name="stockId"
              value={stockId}
              maxLength={6}
              autoComplete="off"
              spellCheck={false}
              onChange={e => setStockId(e.target.value.trim())}
              aria-label="單股代號"
            />
          </label>
        </div>
        <div className="diag-controls__row">
          <button
            className="btn-ghost"
            onClick={() => diag.runStockQuoteTest(stockId)}
            disabled={diag.anyTesting || !stockId}
            aria-label={diag.testingStock ? '測試中' : undefined}
          >
            {diag.testingStock
              ? <span className="icon-spin" aria-hidden="true"><Icon name="progress_activity" size={14} /></span>
              : '測單股報價'}
          </button>
          <button
            className="btn-ghost"
            onClick={diag.runHoldingPricesTest}
            disabled={diag.anyTesting}
            aria-label={diag.testingHoldings ? '測試中' : undefined}
          >
            {diag.testingHoldings
              ? <span className="icon-spin" aria-hidden="true"><Icon name="progress_activity" size={14} /></span>
              : '測持股批次報價'}
          </button>
          <button
            className="btn-ghost"
            onClick={diag.runMarketIndicesTest}
            disabled={diag.anyTesting}
            aria-label={diag.testingMarket ? '測試中' : undefined}
          >
            {diag.testingMarket
              ? <span className="icon-spin" aria-hidden="true"><Icon name="progress_activity" size={14} /></span>
              : '測市場指數'}
          </button>
          <button
            className="btn-ghost btn-ghost--accent diag-run-all"
            onClick={() => diag.runAllTests(stockId)}
            disabled={diag.anyTesting || !stockId}
            aria-label={diag.anyTesting ? '測試中' : undefined}
          >
            {diag.anyTesting
              ? <span className="icon-spin" aria-hidden="true"><Icon name="progress_activity" size={14} /></span>
              : '全部測試'}
          </button>
        </div>

        {/* 重新初始化列 */}
        <div className="diag-controls__row diag-controls__reinit">
          <button
            className="btn-ghost"
            onClick={diag.triggerReinitialize}
            disabled={diag.reinitializing}
            aria-label={diag.reinitializing ? '初始化中' : undefined}
          >
            {diag.reinitializing
              ? <span className="icon-spin" aria-hidden="true"><Icon name="progress_activity" size={14} /></span>
              : <Icon name="restart_alt" size={20} />}
            重新初始化 Shioaji
          </button>
          <ReinitializeStatusChip
            status={diag.reinitializeStatus}
            pollCount={diag.reinitializePollCount}
            error={diag.reinitializeError}
          />
        </div>
      </div>

      {/* 系統狀態 */}
      {diag.statusResult?.data && (
        <SystemStatusDisplay data={diag.statusResult.data} />
      )}
      {diag.statusResult && !diag.statusResult.ok && (
        <p className="diag-error">無法取得系統狀態：{diag.statusResult.error}</p>
      )}

      {/* 測試結果 */}
      {(hasAnyResult || diag.testingStock || diag.testingHoldings || diag.testingMarket) && (
        <div className="diag-results">
          <div className="diag-results__label">測試結果</div>
          <div className="diag-result-list">
            <DiagResultRow
              label={`單股報價（${diag.lastTestedStock || stockId}）`}
              result={diag.stockQuoteResult}
              loading={diag.testingStock}
              renderDetail={renderQuote}
            />
            <DiagResultRow
              label="持股批次報價"
              result={diag.holdingPricesResult}
              loading={diag.testingHoldings}
              renderDetail={renderHoldings}
            />
            <DiagResultRow
              label="市場指數"
              result={diag.marketIndicesResult}
              loading={diag.testingMarket}
              renderDetail={renderMarket}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── 主元件 ── */
interface SettingsModalProps {
  open:    boolean;
  onClose: () => void;
}

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="設定" size="md" className="settings-modal">
      <div className="settings-stack">
        <StockListSection />
        <SnapshotSection />
        <ApiDiagnosticsSection />
      </div>
    </Modal>
  );
}
