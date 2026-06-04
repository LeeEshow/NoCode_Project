import { useState, useEffect, useCallback, useMemo } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { isTradingHours } from '../../utils/tradingHours';
import { useLatest } from '../../utils/useLatest';
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
import { useDownsideRiskViewModel } from '../../viewmodels/useDownsideRiskViewModel';
import { useScenarioViewModel }    from '../../viewmodels/useScenarioViewModel';
import { useTradingStrategyViewModel } from '../../viewmodels/useTradingStrategyViewModel';
import HoldingsTable        from './stock/HoldingsTable';
import AddTransactionModal  from './stock/AddTransactionModal';
import AddHoldingModal      from './stock/AddHoldingModal';
import WatchlistTable       from './stock/WatchlistTable';
import WatchlistModal       from './stock/WatchlistModal';
import TradingStrategyModal from './stock/TradingStrategyModal';
import RiskPanel from './stock/RiskPanel';
import { toast } from '../components/Toast/toastStore';
import Icon from '../components/Icon';
import type { WatchlistItemDTO, CreateWatchlistPayload, RebalanceSuggestion, QuoteSource, QuoteStatus } from '../../types';

/* ── QUOTE-F-05：報價來源摘要 ── */

interface QuoteSummary {
  sj: number; tw: number; yf: number; er: number;
  erDetail: { timeout: number; error: number; unavailable: number; unknown: number; stale: number };
}

function computeQuoteSummary(
  items: Array<{ quoteSource?: QuoteSource; quoteStatus?: QuoteStatus }>
): QuoteSummary | null {
  if (items.length === 0) return null;
  /* 至少一筆有 quoteSource 才顯示 */
  if (!items.some(i => i.quoteSource != null)) return null;
  const s: QuoteSummary = { sj: 0, tw: 0, yf: 0, er: 0, erDetail: { timeout: 0, error: 0, unavailable: 0, unknown: 0, stale: 0 } };
  for (const item of items) {
    const status = item.quoteStatus ?? 'ok';
    const source = item.quoteSource ?? 'unknown';
    if (status === 'ok') {
      if      (source === 'shioaji') s.sj++;
      else if (source === 'twse')    s.tw++;
      else if (source === 'yahoo')   s.yf++;
      else                           s.er++;   // ok + unknown → ER
    } else {
      s.er++;
      if      (status === 'timeout')     s.erDetail.timeout++;
      else if (status === 'error')       s.erDetail.error++;
      else if (status === 'unavailable') s.erDetail.unavailable++;
      else if (status === 'stale')       s.erDetail.stale++;
      else                               s.erDetail.unknown++;
    }
  }
  return s;
}

const TOOLTIP_STYLE: React.CSSProperties = {
  background: '#232b36',
  border: '1px solid var(--border-hi)',
  borderRadius: 'var(--radius-sm)',
  padding: '6px 10px',
  fontSize: 'var(--text-sm)',
  color: 'var(--muted)',
  zIndex: 9999,
  boxShadow: '0 6px 20px rgba(0,0,0,0.6)',
  lineHeight: 1.7,
  whiteSpace: 'nowrap',
};

function QuoteSummaryBadge({ summary }: { summary: QuoteSummary }) {
  const { sj, tw, yf, er, erDetail } = summary;

  const tooltipContent = (
    <div>
      <div>
        {[
          sj > 0 && `Shioaji ${sj} 支`,
          tw > 0 && `TWSE ${tw} 支`,
          yf > 0 && `Yahoo ${yf} 支`,
        ].filter(Boolean).join(' ／ ') || '無正常報價'}
      </div>
      {er > 0 && (
        <div style={{ marginTop: 2, borderTop: '1px solid var(--border)', paddingTop: 2 }}>
          {erDetail.timeout     > 0 && <div>timeout {erDetail.timeout} 支</div>}
          {erDetail.error       > 0 && <div>error {erDetail.error} 支</div>}
          {erDetail.unavailable > 0 && <div>unavailable {erDetail.unavailable} 支</div>}
          {erDetail.stale       > 0 && <div>stale {erDetail.stale} 支</div>}
          {erDetail.unknown     > 0 && <div>unknown {erDetail.unknown} 支</div>}
        </div>
      )}
    </div>
  );

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <span
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--muted)',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.03em',
            cursor: 'default',
            userSelect: 'none',
          }}
          tabIndex={0}
          aria-label={`報價來源摘要：SJ ${sj} TW ${tw} YF ${yf} ER ${er}`}
        >
          {sj > 0 && <span>SJ {sj}&nbsp;&nbsp;</span>}
          {tw > 0 && <span>TW {tw}&nbsp;&nbsp;</span>}
          {yf > 0 && <span>YF {yf}&nbsp;&nbsp;</span>}
          {er > 0 && <span style={{ color: 'var(--up)' }}>ER {er}</span>}
        </span>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content sideOffset={6} style={TOOLTIP_STYLE}>
          {tooltipContent}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 14px', marginBottom: 10,
      background: 'var(--up-bg)', border: '1px solid var(--up-bd)',
      borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-sm)',
    }}>
      <span style={{ color: 'var(--up)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="warning" size={24} /> {message}</span>
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

/* ── 持股操作 Modal 狀態 ── */
interface TxTarget { code: string; name: string; }

export default function StockOverviewPage() {
  /* ViewModels */
  const market     = useMarketViewModel();
  const holdings   = useHoldingsViewModel();
  const watchlist  = useWatchlistViewModel();
  const tagVm      = useTagViewModel();
  const rulesVm    = useRebalanceRulesViewModel();
  const snapshotVm    = useRebalanceSnapshotViewModel();
  const downsideRisk  = useDownsideRiskViewModel();
  const strategyVm    = useTradingStrategyViewModel();

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
  const [strategyModal, setStrategyModal] = useState<{
    open: boolean; stockCode: string; stockName: string;
  }>({ open: false, stockCode: '', stockName: '' });

  /* 關注清單 CRUD */
  const handleWlSubmit = useCallback(async (payload: CreateWatchlistPayload, id?: string) => {
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
  }, [watchlist]);

  const handleWlDelete = useCallback(async (id: string) => {
    await watchlist.removeItem(id, () => toast.success('已從關注清單移除'));
    if (watchlist.error) toast.error(watchlist.error);
  }, [watchlist]);

  /* 穩定的 callback，避免 HoldingRow / WatchlistRow memo 失效 */
  const handleOpenAddTx = useCallback((code: string, name: string) => {
    setAddTxTarget({ code, name });
  }, []);

  const handleOpenStrategy = useCallback((code: string) => {
    const holdingName  = holdingsRef.current.items.find(h => h.stockCode === code)?.stockName ?? '';
    const watchlistName = watchlistRef.current.items.find(i => i.stockCode === code)?.stockName ?? '';
    setStrategyModal({ open: true, stockCode: code, stockName: holdingName || watchlistName });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleWlEdit = useCallback((item: WatchlistItemDTO) => {
    setWlEditItem(item);
    setWlModalOpen(true);
  }, []);

  /* 初始載入 rules、correlationMatrix、交易策略（自身 viewmodel 不自動載入）*/
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { rulesVm.loadRules(); tagVm.loadCorrelationMatrix(); strategyVm.load(); }, []);

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
  const holdingsRef  = useLatest(holdings);
  const marketRef    = useLatest(market);
  const watchlistRef = useLatest(watchlist);

  /* RiskPanel 穩定 callback（空 deps interval，useLatest 確保讀到最新 vm） */
  const rulesVmRef = useLatest(rulesVm);
  const tagVmRef   = useLatest(tagVm);

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

  /* QUOTE-F-05：報價來源摘要（純前端計算，零額外 API） */
  const holdingQuoteSummary  = useMemo(() => computeQuoteSummary(holdings.items),  [holdings.items]);
  const watchlistQuoteSummary = useMemo(() => computeQuoteSummary(watchlist.items), [watchlist.items]);

  /* PanelHeader 財務數值 */
  const { totalCurrentValue, totalDailyAmt, totalUnrealizedProfit } = useMemo(
    () => holdings.items.reduce(
      (acc, h) => ({
        totalCurrentValue:     acc.totalCurrentValue     + h.currentPrice * h.shares * 0.997,
        totalDailyAmt:         acc.totalDailyAmt         + h.change * h.shares,
        totalUnrealizedProfit: acc.totalUnrealizedProfit + h.unrealizedProfit,
      }),
      { totalCurrentValue: 0, totalDailyAmt: 0, totalUnrealizedProfit: 0 },
    ),
    [holdings.items],
  );
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
  const totalAssetValue  = liveStockInStore + planForexValue + cashBalance;
  const scenario = useScenarioViewModel(risk.tagStats, totalAssetValue);

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
        {/* 股票現值（hover：未實現損益） */}
        <Tooltip.Provider delayDuration={300}>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <div className="ph-stat" tabIndex={0}>
                <span className="ph-stat__label">股票現值</span>
                <span className="ph-stat__value" style={{
                  color: totalCurrentValue > 0 ? 'var(--up)' : totalCurrentValue < 0 ? 'var(--down)' : 'var(--text)',
                }}>
                  {fmt(totalCurrentValue)}
                </span>
              </div>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                className="ph-stat__sub-tooltip"
                style={{ color: totalUnrealizedProfit >= 0 ? 'var(--up)' : 'var(--down)' }}
                sideOffset={-8}
                side="bottom"
              >
                {totalUnrealizedProfit >= 0 ? '+' : ''}{fmt(totalUnrealizedProfit)}
                <Tooltip.Arrow style={{ fill: '#232b36' }} />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>

        {/* 當天成長率（hover：金額） */}
        <Tooltip.Provider delayDuration={300}>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <div className="ph-stat" tabIndex={0}>
                <span className="ph-stat__label">當天成長率</span>
                <span className="ph-stat__value" style={{
                  color: totalDailyAmt > 0 ? 'var(--up)' : totalDailyAmt < 0 ? 'var(--down)' : 'var(--text)',
                }}>
                  {totalDailyAmt > 0 ? '+' : ''}{fmt(dailyGrowthRate, 2)}%
                </span>
              </div>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                className="ph-stat__sub-tooltip"
                style={{ color: totalDailyAmt > 0 ? 'var(--up)' : totalDailyAmt < 0 ? 'var(--down)' : 'var(--text)' }}
                sideOffset={-8}
                side="bottom"
              >
                {totalDailyAmt > 0 ? '+' : ''}{fmt(totalDailyAmt)}
                <Tooltip.Arrow style={{ fill: '#232b36' }} />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>

        {/* 整年損益 — 連動投報計畫當年度（hover：金額） */}
        <Tooltip.Provider delayDuration={300}>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <div className="ph-stat" tabIndex={0}>
                <span className="ph-stat__label">整年損益</span>
                <span className="ph-stat__value" style={{
                  color: currentYearReturnPct == null ? 'var(--dim)'
                    : currentYearReturnPct >= 0 ? 'var(--up)' : 'var(--down)',
                  fontWeight: currentYearReturnPct == null ? 400 : 600,
                }}>
                  {currentYearReturnPct == null
                    ? '—'
                    : `${currentYearReturnPct >= 0 ? '+' : ''}${(currentYearReturnPct * 100).toFixed(2)}%`
                  }
                </span>
              </div>
            </Tooltip.Trigger>
            {currentYearReturnValue != null && (
              <Tooltip.Portal>
                <Tooltip.Content
                  className="ph-stat__sub-tooltip"
                  style={{ color: currentYearReturnValue >= 0 ? 'var(--up)' : 'var(--down)' }}
                  sideOffset={-8}
                  side="bottom"
                >
                  {currentYearReturnValue >= 0 ? '+' : ''}{fmt(currentYearReturnValue)}
                  <Tooltip.Arrow style={{ fill: '#232b36' }} />
                </Tooltip.Content>
              </Tooltip.Portal>
            )}
          </Tooltip.Root>
        </Tooltip.Provider>
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
          correlationLoading={tagVm.correlationLoading}
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
          correlationLoadFailed={tagVm.correlationLoadFailed}
          onReloadCorrelationMatrix={tagVm.loadCorrelationMatrix}
          mdd={downsideRisk.mdd}
          varCvar={downsideRisk.varCvar}
          downsideRiskLoading={downsideRisk.loading}
          downsideRiskSampleDays={downsideRisk.sampleDays}
          onDownsideRiskTabOpen={downsideRisk.fetch}
          scenarioBeta={scenario.beta}
          scenarioStress={scenario.stress}
          scenarioLoading={scenario.loading}
          scenarioSampleDays={scenario.sampleDays}
          scenarioKbarsAvailable={scenario.kbarsAvailable}
          onScenarioTabOpen={scenario.fetch}
        />

        {/* ── 庫存持股 Panel（P2-12 ~ P2-16）── */}
        <div className="ft-panel" style={{ marginBottom: 16 }}>
          <div className="ft-section-header">
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
              <span className="ft-section-title">庫存持股</span>
              {holdingQuoteSummary && (
                <Tooltip.Provider delayDuration={300}>
                  <QuoteSummaryBadge summary={holdingQuoteSummary} />
                </Tooltip.Provider>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn-ghost" onClick={() => { holdings.refreshPrices(); market.silentReload(); }}>重新整理</button>
              <button className="btn-ghost" onClick={() => setAddHoldingOpen(true)}><Icon name="add" size={20} /> 新增</button>
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
                  rebalanceTotalAsset={rebalance.totalAsset}
                  strategies={strategyVm.strategies}
                  onOpenStrategy={handleOpenStrategy}
                />
              </>
            )
          }
        </div>

        {/* ── 關注清單 Panel（P2-23）── */}
        <div className="ft-panel">
          <div className="ft-section-header">
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
              <span className="ft-section-title">關注清單</span>
              {watchlistQuoteSummary && (
                <Tooltip.Provider delayDuration={300}>
                  <QuoteSummaryBadge summary={watchlistQuoteSummary} />
                </Tooltip.Provider>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className="btn-ghost"
                onClick={() => { setWlEditItem(null); setWlModalOpen(true); }}
              >
                <Icon name="add" size={20} /> 新增
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
                  strategies={strategyVm.strategies}
                  onOpenStrategy={handleOpenStrategy}
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

      {/* F01：AI 交易策略 */}
      <TradingStrategyModal
        open={strategyModal.open}
        stockCode={strategyModal.stockCode}
        stockName={strategyModal.stockName}
        strategy={strategyVm.strategies[strategyModal.stockCode] ?? null}
        currentPrice={
          holdings.items.find(h => h.stockCode === strategyModal.stockCode)?.currentPrice
          ?? watchlist.items.find(i => i.stockCode === strategyModal.stockCode)?.currentPrice
        }
        onDismiss={() => strategyVm.dismiss(strategyModal.stockCode)}
        onClose={() => setStrategyModal(s => ({ ...s, open: false }))}
      />
    </div>
  );
}
