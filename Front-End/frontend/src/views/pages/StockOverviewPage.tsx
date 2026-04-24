import { useState } from 'react';

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
import MarketIndicesRow from '../components/MarketIndicesRow';
import LoadingPanel from '../components/LoadingPanel';
import { useMarketViewModel }   from '../../viewmodels/useMarketViewModel';
import { useHoldingsViewModel } from '../../viewmodels/useHoldingsViewModel';
import { useWatchlistViewModel } from '../../viewmodels/useWatchlistViewModel';
import HoldingsSummaryRow   from './stock/HoldingsSummaryRow';
import HoldingsTable        from './stock/HoldingsTable';
import TransactionHistoryModal from './stock/TransactionHistoryModal';
import AddTransactionModal  from './stock/AddTransactionModal';
import WatchlistTable       from './stock/WatchlistTable';
import WatchlistModal       from './stock/WatchlistModal';
import { toast } from '../components/Toast/toastStore';
import type { WatchlistItemDTO, CreateWatchlistPayload } from '../../types';

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

  return (
    <div style={{ padding: '20px 28px', minWidth: 0 }}>

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
            <button className="btn-ghost" onClick={holdings.load}>重新整理</button>
          </div>
        </div>

        {holdings.loading
          ? <LoadingPanel loading rows={4} />
          : (
            <>
              {/* API 錯誤提示（不中斷頁面）*/}
              {holdings.error && (
                <ErrorBanner message={`持股載入失敗：${holdings.error}`} onRetry={holdings.load} />
              )}

              {/* P2-12：未實現損益摘要列 */}
              {holdings.items.length > 0 && (
                <HoldingsSummaryRow summary={holdings.summary} />
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
