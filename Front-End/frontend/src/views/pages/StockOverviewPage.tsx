import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { isTradingHours } from '../../utils/tradingHours';
import PanelHeader from '../components/PanelHeader';
import MarketIndicesRow from '../components/MarketIndicesRow';
import { usePlanStore } from '../../stores/planStore';
import { useSnapshotStore } from '../../stores/snapshotStore';
import { useEnsurePlanStore } from '../../viewmodels/useEnsurePlanStore';
import LoadingPanel from '../components/LoadingPanel';
import { useMarketViewModel }   from '../../viewmodels/useMarketViewModel';
import { useHoldingsViewModel } from '../../viewmodels/useHoldingsViewModel';
import { useWatchlistViewModel } from '../../viewmodels/useWatchlistViewModel';
import { useTagViewModel } from '../../viewmodels/useTagViewModel';
import { useRiskViewModel } from '../../viewmodels/useRiskViewModel';
import { useRebalanceViewModel, computeVolatilityFactor, computeRebalanceSuggestions } from '../../viewmodels/useRebalanceViewModel';
import { useRebalanceRulesViewModel } from '../../viewmodels/useRebalanceRulesViewModel';
import { useRebalanceSnapshotViewModel } from '../../viewmodels/useRebalanceSnapshotViewModel';
import HoldingsTable        from './stock/HoldingsTable';
import AddTransactionModal  from './stock/AddTransactionModal';
import AddHoldingModal      from './stock/AddHoldingModal';
import WatchlistTable       from './stock/WatchlistTable';
import WatchlistModal       from './stock/WatchlistModal';
import RiskPanel from './stock/RiskPanel';
import { toast } from '../components/Toast/toastStore';
import type { WatchlistItemDTO, CreateWatchlistPayload, RebalanceSuggestion } from '../../types';

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

/* ── 工具函式 ── */

function fmt(n: number, d = 0) {
  return n.toLocaleString('zh-TW', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function pad2(n: number) { return String(n).padStart(2, '0'); }

function formatLastUpdated(d: Date | null) {
  if (!d) return { date: '—', time: '—' };
  const date = `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  return { date, time };
}

/* ── 持股操作 Modal 狀態 ── */
interface TxTarget { code: string; name: string; }

export default function StockOverviewPage() {
  /* ViewModels */
  const market     = useMarketViewModel();
  const holdings   = useHoldingsViewModel();
  const watchlist  = useWatchlistViewModel();
  const tagVm      = useTagViewModel();
  const rulesVm    = useRebalanceRulesViewModel();
  const snapshotVm = useRebalanceSnapshotViewModel();

  /* 風險/再平衡純計算（CLAUDE.md 組裝順序）*/
  const volatilityFactor    = useMemo(
    () => computeVolatilityFactor(holdings.items, holdings.sparklines),
    [holdings.items, holdings.sparklines],
  );
  const preDynamicThreshold = rulesVm.rules.baseThreshold * volatilityFactor;

  const risk = useRiskViewModel(
    holdings.items,
    tagVm.tags,
    rulesVm.rules.baseThreshold,
    tagVm.correlationMatrix,
    preDynamicThreshold,
    rulesVm.rules.concentrationLimit,
  );

  const rebalance = useRebalanceViewModel(
    holdings.items,
    risk.tagStats,
    rulesVm.rules,
    holdings.klines,
    holdings.sparklines,
  );

  /* 快照建議 → HoldingsTable（優先用選取快照，fallback 即時計算）*/
  const rebalanceSuggestions = useMemo<Record<string, RebalanceSuggestion>>(() => {
    const src = snapshotVm.selectedSnapshot?.suggestions ?? rebalance.suggestions;
    return Object.fromEntries(src.map(s => [s.stockCode, s]));
  }, [snapshotVm.selectedSnapshot, rebalance.suggestions]);

  /* 相關性矩陣是否有重大更新 */
  const [correlationUpdated, setCorrelationUpdated] = useState(false);

  /* Modal 狀態 */
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

  /* 穩定的 callback，避免 HoldingRow / WatchlistRow memo 失效 */
  const handleOpenAddTx = useCallback((code: string, name: string) => {
    setAddTxTarget({ code, name });
  }, []);

  const handleWlEdit = useCallback((item: WatchlistItemDTO) => {
    setWlEditItem(item);
    setWlModalOpen(true);
  }, []);

  /* 初始載入 rules 與 correlationMatrix（自身 viewmodel 不自動載入）*/
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { rulesVm.loadRules(); tagVm.loadCorrelationMatrix(); }, []);

  /* 計算再平衡並儲存快照 */
  const handleTriggerRebalance = useCallback(async () => {
    const totalAsset = holdings.items.reduce((s, h) => s + h.currentPrice * h.shares, 0);
    const { suggestions } = computeRebalanceSuggestions(
      holdings.items, risk.tagStats, rulesVm.rules, holdings.klines, holdings.sparklines,
    );
    await snapshotVm.triggerCalculation(suggestions, {
      totalAsset,
      baseThreshold:     rulesVm.rules.baseThreshold,
      liquidityCapRatio: rulesVm.rules.liquidityCapRatio,
      marketState:       tagVm.marketState,
    });
    setCorrelationUpdated(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdings.items, holdings.klines, holdings.sparklines, risk.tagStats, rulesVm.rules, tagVm.marketState]);

  /* 5 秒輪詢（僅盤中） */
  const holdingsRef  = useRef(holdings);
  const marketRef    = useRef(market);
  const watchlistRef = useRef(watchlist);
  holdingsRef.current  = holdings;
  marketRef.current    = market;
  watchlistRef.current = watchlist;

  /* RiskPanel 穩定 callback（vmRef 模式，空 deps，避免 inline arrow 每次 render 重建） */
  const rulesVmRef = useRef(rulesVm);
  const tagVmRef   = useRef(tagVm);
  rulesVmRef.current = rulesVm;
  tagVmRef.current   = tagVm;

  const handleThresholdChange         = useCallback((v: number) => rulesVmRef.current.updateRules({ baseThreshold: v }), []);
  const handleLiquidityCapChange      = useCallback((v: number) => rulesVmRef.current.updateRules({ liquidityCapRatio: v }), []);
  const handleAdvLookbackDaysChange   = useCallback((v: number) => rulesVmRef.current.updateRules({ advLookbackDays: v }), []);
  const handleConcentrationLimitChange= useCallback((v: number) => rulesVmRef.current.updateRules({ concentrationLimit: v }), []);
  const handleCorrelationUpdated      = useCallback(() => setCorrelationUpdated(true), []);
  const handleRecalculateAll          = useCallback(() => tagVmRef.current.recalculateAllDynamicRisk(tagVmRef.current.marketState), []);

  useEffect(() => {
    const id = setInterval(() => {
      if (!isTradingHours()) return;
      holdingsRef.current.refreshPrices();
      marketRef.current.silentReload();
      watchlistRef.current.silentReload();
    }, 5000);
    return () => clearInterval(id);
  }, []);

  const { date: dateStr, time: timeStr } = formatLastUpdated(market.lastUpdated);

  /* PanelHeader 財務數值 */
  const { totalCurrentValue, totalDailyAmt, totalUnrealizedProfit } = useMemo(() => ({
    totalCurrentValue:    holdings.items.reduce((s, h) => s + h.currentPrice * h.shares * 0.997, 0),
    totalDailyAmt:        holdings.items.reduce((s, h) => s + h.change * h.shares, 0),
    totalUnrealizedProfit: holdings.items.reduce((s, h) => s + h.unrealizedProfit, 0),
  }), [holdings.items]);
  const prevValue       = totalCurrentValue - totalDailyAmt;
  const dailyGrowthRate = prevValue !== 0 ? (totalDailyAmt / prevValue) * 100 : 0;
  useEnsurePlanStore();

  /* planStore 原始輸入 + snapshotStore cashBalance → 整年報酬率以 useMemo 計算（Derived Data，不存 state） */
  const execCapital      = usePlanStore(s => s.execCapital);
  const reinvest         = usePlanStore(s => s.reinvest);
  const planForexValue   = usePlanStore(s => s.forexValue);
  const liveStockInStore = usePlanStore(s => s.liveStockValue);
  const updateStockValue = usePlanStore(s => s.updateStockValue);
  const cashBalance      = useSnapshotStore(s => s.cashBalance);

  const { currentYearReturnPct, currentYearReturnValue } = useMemo(() => {
    const invested   = execCapital + reinvest;
    const totalAsset = liveStockInStore + planForexValue + cashBalance;
    const returnValue = totalAsset - invested;
    const returnPct   = invested !== 0 ? totalAsset / invested - 1 : null;
    return { currentYearReturnPct: returnPct, currentYearReturnValue: returnValue };
  }, [execCapital, reinvest, planForexValue, liveStockInStore, cashBalance]);

  /* holdings.items 每次更新（含 5 秒輪詢）→ 同步最新股票現值到 planStore */
  useEffect(() => {
    updateStockValue(totalCurrentValue);
  }, [totalCurrentValue, updateStockValue]);

  return (
    <div style={{ minWidth: 0 }}>

      {/* 頂部橫幅 PanelHeader */}
      <PanelHeader>
        {/* 今日日期 */}
        <div className="ph-stat" style={{ minWidth: 100 }}>
          <span className="ph-stat__value" style={{ color: 'var(--muted)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-sans)', fontWeight: 400, display: 'flex', flexDirection: 'column', lineHeight: 1.6 }}>
            <span>{dateStr}</span>
            <span>{timeStr}</span>
          </span>
        </div>

        {/* 當天成長率：主值為百分比，tooltip 顯示金額 */}
        <div className="ph-stat">
          <span className="ph-stat__label">當天成長率</span>
          <span className="ph-stat__value" style={{
            color: totalDailyAmt > 0 ? 'var(--up)' : totalDailyAmt < 0 ? 'var(--down)' : 'var(--text)',
          }}>
            {totalDailyAmt > 0 ? '+' : ''}{fmt(dailyGrowthRate, 2)}%
            <span className="ph-stat__sub">
              {totalDailyAmt > 0 ? '+' : ''}{fmt(totalDailyAmt)}
            </span>
          </span>
        </div>

        {/* 股票現值（hover tooltip 顯示未實現損益） */}
        <div className="ph-stat">
          <span className="ph-stat__label">股票現值</span>
          <span className="ph-stat__value" style={{
            color: totalCurrentValue > 0 ? 'var(--up)' : totalCurrentValue < 0 ? 'var(--down)' : 'var(--text)',
          }}>
            {fmt(totalCurrentValue)}
            <span className="ph-stat__sub" style={{
              color: totalUnrealizedProfit >= 0 ? 'var(--up)' : 'var(--down)',
            }}>
              {totalUnrealizedProfit >= 0 ? '+' : ''}{fmt(totalUnrealizedProfit)}
            </span>
          </span>
        </div>

        {/* 整年報酬率 — 連動投報計畫當年度 */}
        <div className="ph-stat">
          <span className="ph-stat__label">整年報酬率</span>
          <span className="ph-stat__value" style={{
            color: currentYearReturnPct == null ? 'var(--dim)'
              : currentYearReturnPct >= 0 ? 'var(--up)' : 'var(--down)',
            fontWeight: currentYearReturnPct == null ? 400 : 600,
          }}>
            {currentYearReturnPct == null
              ? '—'
              : `${currentYearReturnPct >= 0 ? '+' : ''}${(currentYearReturnPct * 100).toFixed(2)}%`
            }
            {currentYearReturnValue != null && (
              <span className="ph-stat__sub" style={{
                color: currentYearReturnValue >= 0 ? 'var(--up)' : 'var(--down)',
              }}>
                {currentYearReturnValue >= 0 ? '+' : ''}{fmt(currentYearReturnValue)}
              </span>
            )}
          </span>
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

        {/* ── 風險/再平衡模組 ── */}
        <RiskPanel
          tags={tagVm.tags}
          loading={tagVm.loading}
          saving={tagVm.saving}
          onAdd={tagVm.addTag}
          onUpdate={tagVm.updateTag}
          onRemove={tagVm.removeTag}
          riskTotal={risk.riskTotal}
          tagStats={risk.tagStats}
          overlappingGroups={risk.overlappingGroups}
          hasWarning={risk.hasWarning}
          baseThreshold={rulesVm.rules.baseThreshold}
          onThresholdChange={handleThresholdChange}
          marketState={tagVm.marketState}
          marketStateChanging={tagVm.marketStateChanging}
          correlationMatrix={tagVm.correlationMatrix}
          onMarketStateChange={tagVm.changeMarketState}
          onSaveCorrelationMatrix={tagVm.saveCorrelationMatrix}
          liquidityCapRatio={rulesVm.rules.liquidityCapRatio}
          onLiquidityCapChange={handleLiquidityCapChange}
          onTriggerRebalance={handleTriggerRebalance}
          calculating={snapshotVm.saving}
          volatilityFactor={rebalance.volatilityFactor}
          dynamicThreshold={rebalance.dynamicThreshold}
          advLookbackDays={rulesVm.rules.advLookbackDays}
          onAdvLookbackDaysChange={handleAdvLookbackDaysChange}
          concentrationLimit={rulesVm.rules.concentrationLimit}
          onConcentrationLimitChange={handleConcentrationLimitChange}
          holdings={holdings.items}
          sparklines={holdings.sparklines}
          correlationUpdated={correlationUpdated}
          onCorrelationUpdated={handleCorrelationUpdated}
          onRecalculateAll={handleRecalculateAll}
          recalculating={tagVm.saving}
          snapshots={snapshotVm.snapshots}
          snapshotsReady={snapshotVm.ready}
          selectedSnapshotId={snapshotVm.selectedId}
          onSelectSnapshot={snapshotVm.selectSnapshot}
        />

        {/* ── 庫存持股 Panel（P2-12 ~ P2-16）── */}
        <div className="ft-panel" style={{ marginBottom: 16 }}>
          <div className="ft-section-header">
            <span className="ft-section-title">庫存持股</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn-ghost" onClick={() => { holdings.refreshPrices(); market.silentReload(); }}>重新整理</button>
              <button className="btn-ghost" onClick={() => setAddHoldingOpen(true)}>＋ 新增</button>
            </div>
          </div>

          {holdings.loading
            ? <LoadingPanel loading rows={4} />
            : (
              <>
                {holdings.error && (
                  <ErrorBanner message={`持股載入失敗：${holdings.error}`} onRetry={holdings.load} />
                )}
                <HoldingsTable
                  items={holdings.items}
                  sparklines={holdings.sparklines}
                  klines={holdings.klines}
                  profiles={holdings.profiles}
                  chips={holdings.chips}
                  expandedCode={holdings.expandedCode}
                  onToggle={holdings.toggleExpand}
                  onExpandLoad={holdings.ensureExpandData}
                  onAddTx={handleOpenAddTx}
                  onChanged={holdings.refreshAfterTx}
                  onReorder={holdings.reorder}
                  allTags={tagVm.tags}
                  onAddHoldingTag={holdings.addHoldingTag}
                  onUpdateHoldingTag={holdings.updateHoldingTag}
                  onRemoveHoldingTag={holdings.removeHoldingTag}
                  overlappingGroups={risk.overlappingGroups}
                  concentrationLimit={rulesVm.rules.concentrationLimit}
                  rebalanceSuggestions={rebalanceSuggestions}
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
                  sparklines={watchlist.sparklines}
                  klines={watchlist.klines}
                  profiles={watchlist.profiles}
                  chips={watchlist.chips}
                  expandedCode={watchlist.expandedCode}
                  onToggle={watchlist.toggleExpand}
                  onExpandLoad={watchlist.ensureExpandData}
                  onEdit={handleWlEdit}
                  onDelete={handleWlDelete}
                  onReorder={watchlist.reorder}
                  deleting={watchlist.saving}
                />
              </>
            )
          }
        </div>
      </div>

      {/* ── Modals ── */}

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
