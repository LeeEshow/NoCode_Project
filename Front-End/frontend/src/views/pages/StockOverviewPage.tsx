import { useState, useEffect } from 'react';

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 14px', marginBottom: 10,
      background: 'var(--up-bg)', border: '1px solid var(--up-bd)',
      borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-sm)',
    }}>
      <span style={{ color: 'var(--up)' }}>⚠ {message}</span>
      <button className="btn-ghost" style={{ padding: '2px 10px', fontSize: 'var(--text-sm)' }} onClick={onRetry}>
        重試
      </button>
    </div>
  );
}

import PanelHeader from '../components/PanelHeader';
import MarketIndicesRow from '../components/MarketIndicesRow';
import LoadingPanel from '../components/LoadingPanel';
import { useMarketViewModel }   from '../../viewmodels/useMarketViewModel';
import { useHoldingsViewModel } from '../../viewmodels/useHoldingsViewModel';
import { useWatchlistViewModel } from '../../viewmodels/useWatchlistViewModel';
import HoldingsTable        from './stock/HoldingsTable';
import TransactionHistoryModal from './stock/TransactionHistoryModal';
import AddTransactionModal  from './stock/AddTransactionModal';
import AddHoldingModal      from './stock/AddHoldingModal';
import WatchlistTable       from './stock/WatchlistTable';
import WatchlistModal       from './stock/WatchlistModal';
import { toast } from '../components/Toast/toastStore';
import type { WatchlistItemDTO, CreateWatchlistPayload } from '../../types';

/* ── 工具函式 ── */

function fmt(n: number, d = 0) {
  return n.toLocaleString('zh-TW', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function sign(n: number) { return n > 0 ? '+' : ''; }
function cls(n: number)  { return n > 0 ? 'txt-up' : n < 0 ? 'txt-down' : 'txt-flat'; }

function pad2(n: number) { return String(n).padStart(2, '0'); }

const WEEKDAYS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

/* 即時時鐘 hook */
function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/* DecNum：小數點後小一號字體 */
function DecNum({ value }: { value: string }) {
  const dot = value.indexOf('.');
  if (dot === -1) return <>{value}</>;
  return <>{value.slice(0, dot)}<span className="dec-small">{value.slice(dot)}</span></>;
}

/* ── 持股操作 Modal 狀態 ── */
interface TxTarget { code: string; name: string; }

export default function StockOverviewPage() {
  /* ViewModels */
  const market   = useMarketViewModel();
  const holdings = useHoldingsViewModel();
  const watchlist = useWatchlistViewModel();

  /* Modal 狀態 */
  const [historyTarget, setHistoryTarget] = useState<TxTarget | null>(null);
  const [addTxTarget,   setAddTxTarget]   = useState<TxTarget | null>(null);
  const [addHoldingOpen, setAddHoldingOpen] = useState(false);
  const [wlModalOpen,   setWlModalOpen]   = useState(false);
  const [wlEditItem,    setWlEditItem]    = useState<WatchlistItemDTO | null>(null);

  /* 關注清單 CRUD */
  const handleWlSubmit = async (payload: CreateWatchlistPayload, id?: string) => {
    if (id) {
      await watchlist.updateItem(id, payload, () => {
        toast.success('關注清單已更新');
        setWlModalOpen(false);
        setWlEditItem(null);
      });
    } else {
      await watchlist.addItem(payload, () => {
        toast.success('已加入關注清單');
        setWlModalOpen(false);
      });
    }
    if (watchlist.error) toast.error(watchlist.error);
  };

  const handleWlDelete = async (id: string) => {
    await watchlist.removeItem(id, () => toast.success('已從關注清單移除'));
    if (watchlist.error) toast.error(watchlist.error);
  };

  /* 即時時鐘 */
  const now = useClock();
  const dateStr    = `${now.getFullYear()}-${pad2(now.getMonth()+1)}-${pad2(now.getDate())}`;
  const weekdayStr = WEEKDAYS[now.getDay()];

  /* PanelHeader 財務數值（* 1000 換算張→股）*/
  const totalCurrentValue  = holdings.items.reduce((s, h) => s + h.currentPrice * h.shares * 1000 * 0.997, 0);
  const totalDailyAmt      = holdings.items.reduce((s, h) => s + h.change * h.shares * 1000, 0);
  const prevValue          = totalCurrentValue - totalDailyAmt;
  const dailyGrowthRate    = prevValue !== 0 ? (totalDailyAmt / prevValue) * 100 : 0;

  return (
    <div style={{ minWidth: 0 }}>

      {/* 頂部橫幅 PanelHeader */}
      <PanelHeader>
        {/* 今日日期 */}
        <div className="ph-stat" style={{ minWidth: 128 }}>
          <span className="ph-stat__label" style={{ fontSize: 'var(--text-2xs)', color: 'var(--dim)' }}>今日</span>
          <span className="ph-stat__value" style={{ color: 'var(--dim)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', fontWeight: 400 }}>
            {dateStr}&nbsp;{weekdayStr}
          </span>
        </div>

        {/* 當天成長率：金額整數 + 百分比2位小數，正紅負綠零深色 */}
        <div className="ph-stat">
          <span className="ph-stat__label">當天成長率</span>
          <span className="ph-stat__value" style={{
            color: totalDailyAmt > 0 ? 'var(--up)' : totalDailyAmt < 0 ? 'var(--down)' : 'var(--text)',
          }}>
            {totalDailyAmt > 0 ? '+' : ''}{fmt(totalDailyAmt)}
            <span className="ph-stat__sub">
              &nbsp;{totalDailyAmt > 0 ? '+' : ''}{fmt(dailyGrowthRate, 2)}%
            </span>
          </span>
        </div>

        {/* 未實現損益 = Σ(即時報價 × 持有張數 × 1000) */}
        <div className="ph-stat">
          <span className="ph-stat__label">未實現損益</span>
          <span className="ph-stat__value" style={{
            color: totalCurrentValue > 0 ? 'var(--up)' : totalCurrentValue < 0 ? 'var(--down)' : 'var(--text)',
          }}>
            {fmt(totalCurrentValue)}
          </span>
        </div>

        {/* 整年報酬率（來源待補）*/}
        <div className="ph-stat">
          <span className="ph-stat__label">整年報酬率</span>
          <span className="ph-stat__value" style={{ color: 'var(--dim)', fontWeight: 400 }}>—</span>
        </div>
      </PanelHeader>

      {/* 頁面主內容 */}
      <div style={{ padding: '16px 28px 28px' }}>

        {/* ── 市場指數錯誤 ── */}
        {market.error && !market.loading && (
          <ErrorBanner message={`市場指數載入失敗：${market.error}`} onRetry={market.reload} />
        )}

        {/* ── 市場指數列（P2-09）── */}
        <MarketIndicesRow
          indices={market.data?.indices ?? []}
          exportIndicator={market.data?.exportIndicator ?? null}
          loading={market.loading}
        />

        {/* ── 庫存持股 Panel（P2-12 ~ P2-16）── */}
        <div className="ft-panel" style={{ marginBottom: 16 }}>
          <div className="ft-section-header">
            <span className="ft-section-title">庫存持股</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {/* FIX-05：新增持股入口 */}
              <button className="btn-ghost" onClick={() => setAddHoldingOpen(true)}>＋ 新增持股</button>
              <button className="btn-ghost" onClick={holdings.load}>重新整理</button>
            </div>
          </div>

          {holdings.loading
            ? <LoadingPanel loading rows={4} />
            : (
              <>
                {holdings.error && (
                  <ErrorBanner message={`持股載入失敗：${holdings.error}`} onRetry={holdings.load} />
                )}

                {/* P2-13 ~ P2-16：持股表格（含 SparkLine / K線 / 基礎數據）*/}
                <HoldingsTable
                  items={holdings.items}
                  sparklines={holdings.sparklines}
                  klines={holdings.klines}
                  profiles={holdings.profiles}
                  expandedCode={holdings.expandedCode}
                  onToggle={holdings.toggleExpand}
                  onExpandLoad={holdings.ensureExpandData}
                  onHistory={(code, name) => setHistoryTarget({ code, name })}
                  onAddTx={(code, name) => setAddTxTarget({ code, name })}
                />
              </>
            )
          }
        </div>

        {/* ── 關注清單 Panel（P2-23）── */}
        <div className="ft-panel">
          <div className="ft-section-header">
            <span className="ft-section-title">關注清單</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className="btn-ghost"
                onClick={() => { setWlEditItem(null); setWlModalOpen(true); }}
              >
                + 新增
              </button>
            </div>
          </div>

          {watchlist.loading
            ? <LoadingPanel loading rows={2} />
            : (
              <>
                {watchlist.error && (
                  <ErrorBanner message={`關注清單載入失敗：${watchlist.error}`} onRetry={watchlist.load} />
                )}
                <WatchlistTable
                  items={watchlist.items}
                  onEdit={item => { setWlEditItem(item); setWlModalOpen(true); }}
                  onDelete={handleWlDelete}
                  deleting={watchlist.saving}
                />
              </>
            )
          }
        </div>
      </div>

      {/* ── Modals ── */}

      {/* P2-19：交易歷史 */}
      <TransactionHistoryModal
        open={!!historyTarget}
        stockCode={historyTarget?.code ?? null}
        stockName={historyTarget?.name ?? ''}
        onClose={() => setHistoryTarget(null)}
        onChanged={holdings.refreshAfterTx}
      />

      {/* P2-20：新增交易 */}
      {addTxTarget && (
        <AddTransactionModal
          open={!!addTxTarget}
          stockCode={addTxTarget.code}
          stockName={addTxTarget.name}
          onClose={() => setAddTxTarget(null)}
          onSuccess={holdings.refreshAfterTx}
        />
      )}

      {/* FIX-05：新增持股 */}
      <AddHoldingModal
        open={addHoldingOpen}
        onClose={() => setAddHoldingOpen(false)}
        onSuccess={holdings.refreshAfterTx}
      />

      {/* P2-24：關注清單新增 / 編輯 */}
      <WatchlistModal
        open={wlModalOpen}
        editItem={wlEditItem}
        saving={watchlist.saving}
        onClose={() => { setWlModalOpen(false); setWlEditItem(null); }}
        onSubmit={handleWlSubmit}
      />
    </div>
  );
}
