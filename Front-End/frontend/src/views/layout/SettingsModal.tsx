import { useState, useEffect, useCallback } from 'react';
import Modal from '../components/Modal/Modal';
import Icon from '../components/Icon';
import { useStockListViewModel } from '../../viewmodels/useStockListViewModel';
import { useSystemDiagnosticsViewModel } from '../../viewmodels/useSystemDiagnosticsViewModel';
import { fetchSnapshot, triggerSnapshotRecord } from '../../models/snapshotModel';
import { toast } from '../components/Toast';
import type { DailySnapshotDTO } from '../../types';
import type { DiagResult, SystemStatusDTO, QuoteDiagData, HoldingPricesDiagData, MarketIndicesDiagData } from '../../models/systemModel';
import './SettingsModal.css';

type ActiveTab = 'stocklist' | 'snapshot' | 'diagnostics';

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

/* ── 股票清單 Section ── */
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
    <div className="settings-section">
      <div className="settings-section__label">股票清單</div>
      <div className="settings-row">
        <span className="settings-row__label">上次更新</span>
        <span className="settings-row__value">{loading ? '載入中…' : formatDateTime(updatedAt)}</span>
      </div>
      <div className="settings-row">
        <span className="settings-row__label">總筆數</span>
        <span className="settings-row__value">{loading ? '—' : `${count.toLocaleString()} 筆`}</span>
        <button
          className="btn-ghost settings-row__action"
          onClick={handleRefresh}
          disabled={loading || refreshing}
          style={{ minWidth: 88 }}
        >
          {refreshing
            ? <Icon name="progress_activity" size={15} aria-label="更新中" style={{ animation: 'spin 1s linear infinite' }} />
            : '立即更新'}
        </button>
      </div>
    </div>
  );
}

/* ── 每日快照 Section ── */
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
    <div className="settings-section">
      <div className="settings-section__label">每日快照</div>
      <div className="settings-row">
        <span className="settings-row__label">今日狀態</span>
        <span className="settings-row__value">
          {loading ? '載入中…' : (recordedAt ? formatDateTime(recordedAt) : '尚未記錄')}
        </span>
        <button
          className="btn-ghost settings-row__action"
          onClick={handleRecord}
          disabled={loading || recording}
          style={{ minWidth: 100 }}
        >
          {recording
            ? <Icon name="progress_activity" size={15} aria-label="記錄中" style={{ animation: 'spin 1s linear infinite' }} />
            : '記錄快照'}
        </button>
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
    statusEl   = <Icon name="progress_activity" size={14} aria-label="測試中" style={{ animation: 'spin 1s linear infinite' }} />;
    statusColor = 'var(--muted)';
  } else if (!result) {
    return null;
  } else if (!result.ok) {
    const isTimeout = result.error?.toLowerCase().includes('timeout') || result.error?.toLowerCase().includes('15');
    statusEl   = isTimeout ? 'TIMEOUT' : 'ERROR';
    statusColor = 'var(--up)';
    detail      = isTimeout ? '前端等待超過 15 秒' : (result.error ?? '未知錯誤');
  } else if (result.degraded) {
    statusEl   = 'DEGRADED';
    statusColor = 'var(--accent)';
    detail      = result.data ? `後端已降級回應  ${renderDetail(result.data)}` : '後端已降級回應';
  } else {
    statusEl   = 'OK';
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
      : <span style={{ color: v ? 'var(--down)' : 'var(--up)' }}>{v ? 'true' : 'false'}</span>;

  const sw = data.apiSwitch;
  const cb = data.circuitBreaker;
  const sm = data.shioajiManager;

  /* 後端結構不符時，顯示原始 JSON 供診斷 */
  if (!sw && !cb && !sm) {
    return (
      <div className="settings-section">
        <div className="settings-section__label">系統狀態（原始回應）</div>
        <div className="settings-row">
          <span className="settings-row__value" style={{ wordBreak: 'break-all' }}>
            {JSON.stringify(data)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      {sw && (
        <div className="settings-section">
          <div className="settings-section__label">API Switch</div>
          <div className="diag-status-grid">
            <span className="diag-status-grid__key">source</span>
            <span className="diag-status-grid__value">{sw.source ?? '—'}</span>
            <span className="diag-status-grid__key">marketOpen</span>
            <span className="diag-status-grid__value">{boolLabel(sw.marketOpen)}</span>
            <span className="diag-status-grid__key">shioajiEnabled</span>
            <span className="diag-status-grid__value">{boolLabel(sw.shioajiEnabled)}</span>
          </div>
        </div>
      )}
      {cb && (
        <div className="settings-section">
          <div className="settings-section__label">Circuit Breaker</div>
          <div className="diag-status-grid">
            <span className="diag-status-grid__key">state</span>
            <span className="diag-status-grid__value">{cb.state ?? '—'}</span>
            <span className="diag-status-grid__key">failureCount</span>
            <span className="diag-status-grid__value">{cb.failureCount ?? '—'}</span>
          </div>
        </div>
      )}
      {sm && (
        <div className="settings-section">
          <div className="settings-section__label">Shioaji Manager</div>
          <div className="diag-status-grid">
            <span className="diag-status-grid__key">connected</span>
            <span className="diag-status-grid__value">{boolLabel(sm.connected)}</span>
            <span className="diag-status-grid__key">subscribedStocks</span>
            <span className="diag-status-grid__value">{sm.subscribedStocks ?? '—'}</span>
            <span className="diag-status-grid__key">initialized</span>
            <span className="diag-status-grid__value">{boolLabel(sm.initialized)}</span>
            <span className="diag-status-grid__key">cachedQuotes</span>
            <span className="diag-status-grid__value">{sm.cachedQuotes ?? '—'}</span>
            <span className="diag-status-grid__key" />
            <span className="diag-status-grid__value" />
            <span className="diag-status-grid__key">cachedFutures</span>
            <span className="diag-status-grid__value">{sm.cachedFutures ?? '—'}</span>
          </div>
        </div>
      )}
    </>
  );
}

/* ── API 診斷 Section ── */
function ApiDiagnosticsSection() {
  const [stockId, setStockId] = useState('2330');
  const diag = useSystemDiagnosticsViewModel();

  const hasAnyResult =
    diag.stockQuoteResult    !== null ||
    diag.holdingPricesResult !== null ||
    diag.marketIndicesResult !== null;

  /* renderDetail helpers */
  const renderQuote = (d: QuoteDiagData) =>
    `${d.price} / ${d.change >= 0 ? '+' : ''}${d.change} / ${d.marketStatus} / ${d.quoteSource} / ${d.quoteStatus}`;

  const renderHoldings = (d: HoldingPricesDiagData) => {
    const preview = d.preview.map(p => `${p.stockCode}@${p.currentPrice}`).join(' / ');
    return `共 ${d.count} 筆  ${preview}`;
  };

  const renderMarket = (d: MarketIndicesDiagData) =>
    `共 ${d.count} 筆  加權 ${d.hasTwii ? '✓' : '✗'}  期貨 ${d.hasFutures ? '✓' : '✗'}`;

  return (
    <div>
      {/* 系統狀態 */}
      {diag.statusResult?.data && (
        <SystemStatusDisplay data={diag.statusResult.data} />
      )}
      {diag.statusResult && !diag.statusResult.ok && (
        <div className="settings-section">
          <div className="settings-section__label">系統狀態</div>
          <div className="settings-row">
            <span style={{ color: 'var(--up)', fontSize: 'var(--text-sm)' }}>
              無法取得：{diag.statusResult.error}
            </span>
          </div>
        </div>
      )}

      {/* 操作列 */}
      <div className="settings-section">
        <div className="settings-section__label">診斷操作</div>
        <div className="diag-controls">
          <label className="diag-stock-input">
            單股代號
            <input
              type="text"
              value={stockId}
              maxLength={6}
              onChange={e => setStockId(e.target.value.trim())}
              aria-label="單股代號"
            />
          </label>
          <button
            className="btn-ghost"
            onClick={diag.loadStatus}
            disabled={diag.anyTesting}
          >
            {diag.loadingStatus
              ? <Icon name="progress_activity" size={14} aria-label="載入中" style={{ animation: 'spin 1s linear infinite' }} />
              : '重新讀取狀態'}
          </button>
          <button
            className="btn-ghost"
            onClick={() => diag.runStockQuoteTest(stockId)}
            disabled={diag.anyTesting || !stockId}
          >
            {diag.testingStock
              ? <Icon name="progress_activity" size={14} aria-label="測試中" style={{ animation: 'spin 1s linear infinite' }} />
              : '測單股報價'}
          </button>
          <button
            className="btn-ghost"
            onClick={diag.runHoldingPricesTest}
            disabled={diag.anyTesting}
          >
            {diag.testingHoldings
              ? <Icon name="progress_activity" size={14} aria-label="測試中" style={{ animation: 'spin 1s linear infinite' }} />
              : '測持股批次報價'}
          </button>
          <button
            className="btn-ghost"
            onClick={diag.runMarketIndicesTest}
            disabled={diag.anyTesting}
          >
            {diag.testingMarket
              ? <Icon name="progress_activity" size={14} aria-label="測試中" style={{ animation: 'spin 1s linear infinite' }} />
              : '測市場指數'}
          </button>
          <button
            className="btn-ghost btn-ghost--accent"
            onClick={() => diag.runAllTests(stockId)}
            disabled={diag.anyTesting || !stockId}
          >
            {diag.anyTesting
              ? <Icon name="progress_activity" size={14} aria-label="測試中" style={{ animation: 'spin 1s linear infinite' }} />
              : '全部測試'}
          </button>
        </div>
      </div>

      {/* 測試結果 */}
      {(hasAnyResult || diag.testingStock || diag.testingHoldings || diag.testingMarket) && (
        <div className="settings-section">
          <div className="settings-section__label">測試結果</div>
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
  const [activeTab, setActiveTab] = useState<ActiveTab>('stocklist');

  return (
    <Modal open={open} onClose={onClose} title="設定" size="md" className="settings-modal">
      {/* Tab Bar */}
      <div role="tablist" className="settings-tabs">
        {([
          ['stocklist',   '股票清單'],
          ['snapshot',    '每日快照'],
          ['diagnostics', 'API 診斷'],
        ] as [ActiveTab, string][]).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={activeTab === id}
            className="settings-tab"
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab Panels（條件渲染，避免未選中的 tab 在背景打 API） */}
      <div role="tabpanel">
        {activeTab === 'stocklist'   && <StockListSection />}
        {activeTab === 'snapshot'    && <SnapshotSection />}
        {activeTab === 'diagnostics' && <ApiDiagnosticsSection />}
      </div>
    </Modal>
  );
}
