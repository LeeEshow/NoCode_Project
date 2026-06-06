import { useState, useEffect, useMemo } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as Slider from '@radix-ui/react-slider';
import * as Select from '@radix-ui/react-select';
import type {
  TagDTO, CreateTagPayload, TagStat, MarketState, CorrelationEntry,
  HoldingDTO, OverlappingTagGroup, MddResult, VarCVarResult,
  PortfolioBetaResult, StressScenario,
} from '../../../types';
import { calcTagDailyReturnsFromSparklines, buildCorrelationEntries } from '../../../utils/correlationCalc';
import { chartColors } from '../../../styles/theme';
import { useSnapshotStore } from '../../../stores/snapshotStore';
import TagManagerTab from './TagManagerTab';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';

const MARKET_STATE_AUTO_LABEL: Record<string, string> = {
  'risk-on':       'Risk-On',
  'risk-off':      'Risk-Off',
  'neutral':       '中性',
  'liquidity-dry': '流動性枯竭',
};

interface Props {
  tags:     TagDTO[];
  loading:  boolean;
  saving:   boolean;
  onAdd:    (payload: CreateTagPayload, onSuccess?: () => void) => void;
  onUpdate: (id: string, payload: Partial<CreateTagPayload>, onSuccess?: () => void) => void;
  onRemove: (id: string, onSuccess?: () => void) => void;
  /* Phase 2 */
  riskTotal:               number;
  tagStats:                TagStat[];
  overlappingGroups:       OverlappingTagGroup[];
  hasWarning:              boolean;
  baseThreshold:           number;
  onThresholdChange:       (v: number) => void;
  /* Phase 2 後期 */
  marketState:             MarketState;
  marketStateChanging:     boolean;
  correlationMatrix:       CorrelationEntry[];
  correlationLoading:      boolean;
  onMarketStateChange:     (s: MarketState) => void;
  onSaveCorrelationMatrix: (entries: CorrelationEntry[]) => Promise<void>;
  onExpand?:               () => void;
  /* Phase 3 */
  liquidityCapRatio:    number;
  onLiquidityCapChange: (v: number) => void;
  onTriggerRebalance:   () => void;
  calculating:          boolean;
  volatilityFactor:     number;
  dynamicThreshold:     number;
  /* Phase 4-A */
  advLookbackDays:         number;
  onAdvLookbackDaysChange: (v: number) => void;
  /* Phase 4-B */
  concentrationLimit:         number;
  onConcentrationLimitChange: (v: number) => void;
  /* Phase 4-C */
  holdings:             HoldingDTO[];
  sparklines:           Record<string, number[]>;
  correlationUpdated:   boolean;
  onCorrelationUpdated: () => void;
  /* 批次重算動態風險 */
  onRecalculateAll: () => Promise<void>;
  recalculating:    boolean;
  /* Phase 4-E */
  snapshots:      { id: string; createdAt: string }[];
  snapshotsReady: boolean;
  /* UI-2 */
  selectedSnapshotId: string | null;
  onSelectSnapshot:   (id: string) => void;
  /* Phase 6 — 相關性矩陣載入失敗偵測 */
  correlationLoadFailed:     boolean;
  onReloadCorrelationMatrix: () => Promise<void>;
  /* 下行風險（A1+A2） */
  mdd:                   MddResult | null;
  varCvar:               VarCVarResult | null;
  downsideRiskLoading:   boolean;
  downsideRiskSampleDays: number;
  onDownsideRiskTabOpen: () => void;
  /* 情境分析（Phase C） */
  scenarioBeta:           PortfolioBetaResult | null;
  scenarioStress:         StressScenario[];
  scenarioLoading:        boolean;
  scenarioSampleDays:     number;
  scenarioKbarsAvailable: boolean;
  onScenarioTabOpen:      () => void;
}

/* ── UI-4 Tooltip Helper ── */
const TOOLTIP_STYLE = {
  fontSize: 'var(--text-sm)',
  maxWidth: '220px',
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  padding: '6px 10px',
  color: 'var(--text)',
  lineHeight: 1.5,
  zIndex: 9999,
} as const;

function SettingTooltip({ content }: { content: string }) {
  return (
    <Tooltip.Root delayDuration={300}>
      <Tooltip.Trigger asChild>
        <span
          aria-label="說明"
          aria-hidden="false"
          style={{ cursor: 'help', color: 'var(--dim)', userSelect: 'none', lineHeight: 1 }}
        >
          <Icon name="info" size={14} />
        </span>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content role="tooltip" style={TOOLTIP_STYLE} sideOffset={4}>
          {content}
          <Tooltip.Arrow style={{ fill: 'var(--border)' }} />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

interface ScenarioDetail {
  desc:   string;
  shocks: { tag: string; pct: string }[];
}

const SCENARIO_DETAIL: Record<string, ScenarioDetail> = {
  'market-crash': {
    desc:   '模擬台股整體大幅下跌，成長型標的跌幅最大。',
    shocks: [
      { tag: '市值型', pct: '-15%' }, { tag: '成長', pct: '-20%' },
      { tag: '高股息', pct: '-10%' }, { tag: '科技', pct: '-18%' },
      { tag: '金融',   pct: '-12%' }, { tag: '台股', pct: '-15%' },
    ],
  },
  'semi-cycle': {
    desc:   '模擬半導體景氣循環下行，科技類股受創。',
    shocks: [
      { tag: '半導體', pct: '-25%' }, { tag: '成長', pct: '-15%' }, { tag: '科技', pct: '-20%' },
    ],
  },
  'liquidity-dry': {
    desc:   '模擬市場流動性急劇收縮，槓桿型資產跌幅最重。',
    shocks: [
      { tag: '槓桿',   pct: '-30%' }, { tag: '成長',   pct: '-20%' },
      { tag: '高股息', pct: '-15%' }, { tag: '市值型', pct: '-10%' }, { tag: '台股', pct: '-12%' },
    ],
  },
  'twd-appreciation': {
    desc:   '模擬台幣兌美元快速升值，外幣資產換算台幣後縮水。',
    shocks: [
      { tag: '美股', pct: '-8%' }, { tag: 'USD', pct: '-8%' },
      { tag: '海外', pct: '-6%' }, { tag: '外幣', pct: '-7%' }, { tag: '美元', pct: '-8%' },
    ],
  },
  'rate-hike': {
    desc:   '模擬利率快速上升，長天期債券與高股息估值受壓。',
    shocks: [
      { tag: '長債', pct: '-15%' }, { tag: '債券', pct: '-10%' },
      { tag: '高股息', pct: '-5%' }, { tag: '金融', pct: '-5%' },
    ],
  },
};

const PANEL_ID           = 'risk-rebalance-panel';
const TAB_TAGS_ID        = 'risk-tab-tags';
const TAB_DOWNSIDE_ID    = 'risk-tab-downside';
const TAB_SCENARIO_ID    = 'risk-tab-scenario';
const TAB_SETTINGS_ID    = 'risk-tab-settings';

const MDD_WARN_THRESHOLD  = -0.05;  /* 距高點 -5% 顯示觀察圖示 */
const MDD_ALERT_THRESHOLD = -0.10;  /* 距高點 -10% 顯示警示圖示 */

const MARKET_STATE_OPTIONS: { value: MarketState; label: string }[] = [
  { value: 'neutral',       label: '中性' },
  { value: 'risk-on',       label: 'Risk-On（積極）' },
  { value: 'risk-off',      label: 'Risk-Off（防禦）' },
  { value: 'liquidity-dry', label: '流動性枯竭' },
];

function rhoKey(a: string, b: string): string {
  return [a, b].sort().join('__');
}

function isThisMonth(dateStr: string): boolean {
  const now = new Date();
  const d   = new Date(dateStr);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function formatSnapDate(dateStr: string): string {
  const d = new Date(dateStr);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth()+1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

interface RhoCalcState {
  calculating:      boolean;
  preview:          CorrelationEntry[] | null;
  bigDiffKeys:      Set<string>;
  pendingRebalance: boolean;
}

export default function RiskPanel({
  tags, loading, saving, onAdd, onUpdate, onRemove,
  riskTotal, tagStats, overlappingGroups,
  baseThreshold, onThresholdChange,
  marketState, marketStateChanging, correlationMatrix, correlationLoading,
  onMarketStateChange, onSaveCorrelationMatrix, onExpand,
  liquidityCapRatio, onLiquidityCapChange, onTriggerRebalance, calculating,
  volatilityFactor, dynamicThreshold,
  advLookbackDays, onAdvLookbackDaysChange,
  concentrationLimit, onConcentrationLimitChange,
  holdings, sparklines,
  correlationUpdated, onCorrelationUpdated,
  snapshots, snapshotsReady,
  selectedSnapshotId, onSelectSnapshot,
  onRecalculateAll, recalculating,
  correlationLoadFailed, onReloadCorrelationMatrix,
  mdd, varCvar, downsideRiskLoading, downsideRiskSampleDays, onDownsideRiskTabOpen,
  scenarioBeta, scenarioStress, scenarioLoading, scenarioSampleDays,
  scenarioKbarsAvailable, onScenarioTabOpen,
}: Props) {
  const vix             = useSnapshotStore(s => s.vix);
  const marketStateAuto = useSnapshotStore(s => s.marketStateAuto);

  const [expanded,            setExpanded]            = useState(false);
  const [activeTab,           setActiveTab]           = useState<'tags' | 'downside' | 'scenario' | 'settings'>('tags');
  const [factorExposureOpen,  setFactorExposureOpen]  = useState(false);
  const [downsideTabOpened,  setDownsideTabOpened]  = useState(false);
  const [scenarioTabOpened,  setScenarioTabOpened]  = useState(false);
  const [localRho,  setLocalRho]  = useState<Map<string, string>>(new Map());

  const [rhoCalc,   setRhoCalc]   = useState<RhoCalcState>({
    calculating: false, preview: null, bigDiffKeys: new Set(), pendingRebalance: false,
  });

  useEffect(() => {
    const m = new Map<string, string>();
    correlationMatrix.forEach(e => { m.set(rhoKey(e.tagA, e.tagB), String(e.rho)); });
    setLocalRho(m);
  }, [correlationMatrix]);

  function getRho(a: string, b: string): string {
    return localRho.get(rhoKey(a, b)) ?? '1';
  }
  function setRho(a: string, b: string, val: string) {
    const k = rhoKey(a, b);
    setLocalRho(m => { const n = new Map(m); n.set(k, val); return n; });
  }

  function handleMatrixBlur() {
    const entries: CorrelationEntry[] = [];
    tags.forEach((ta, i) => {
      tags.slice(i + 1).forEach(tb => {
        const val = parseFloat(getRho(ta.name, tb.name));
        entries.push({ tagA: ta.name, tagB: tb.name, rho: isNaN(val) ? 1 : Math.min(Math.max(val, -1), 1) });
      });
    });
    onSaveCorrelationMatrix(entries);
  }

  function runRhoCalc(pendingRebalance: boolean) {
    if (tags.length < 2 || holdings.length === 0) return;
    setRhoCalc(s => ({ ...s, calculating: true, preview: null, bigDiffKeys: new Set() }));
    const tagReturns  = calcTagDailyReturnsFromSparklines(holdings, sparklines);
    const newEntries  = buildCorrelationEntries(tags, tagReturns);
    const currentMap  = new Map(correlationMatrix.map(e => [rhoKey(e.tagA, e.tagB), e.rho]));
    const bigDiffKeys = new Set<string>();
    for (const e of newEntries) {
      const k = rhoKey(e.tagA, e.tagB);
      const oldRho = currentMap.get(k) ?? 1;
      if (Math.abs(e.rho - oldRho) > 0.2) bigDiffKeys.add(k);
    }
    setRhoCalc({ calculating: false, preview: newEntries, bigDiffKeys, pendingRebalance });
  }

  function handleAutoCalcRho()             { runRhoCalc(false); }
  function handleAutoCalcRhoAndRebalance() { runRhoCalc(true);  }

  async function handleConfirmRho() {
    if (!rhoCalc.preview) return;
    await onSaveCorrelationMatrix(rhoCalc.preview);
    if (rhoCalc.bigDiffKeys.size > 0) onCorrelationUpdated();
    const pending = rhoCalc.pendingRebalance;
    setRhoCalc({ calculating: false, preview: null, bigDiffKeys: new Set(), pendingRebalance: false });
    if (pending) onTriggerRebalance();
  }

  function handleCancelRho() {
    setRhoCalc({ calculating: false, preview: null, bigDiffKeys: new Set(), pendingRebalance: false });
  }

  function handleToggle() {
    const next = !expanded;
    setExpanded(next);
    if (next) onExpand?.();
  }

  /* MDD 圖示狀態 */
  const mddIcon = useMemo(() => {
    if (!mdd || mdd.currentDrawdown === 0) return null;
    if (mdd.currentDrawdown <= MDD_ALERT_THRESHOLD) return { color: 'var(--up)' };
    if (mdd.currentDrawdown <= MDD_WARN_THRESHOLD)  return { color: 'var(--accent)' };
    return null;
  }, [mdd]);

  const needsMonthlyReminder = useMemo(() => {
    if (!snapshotsReady) return false;
    if (snapshots.length === 0) return true;
    return !isThisMonth(snapshots[0].createdAt);
  }, [snapshots, snapshotsReady]);

  const RISK_MAX = 2.0;
  const riskLabel        = tags.length > 0 && riskTotal > 0 ? riskTotal.toFixed(2) : '—';
  const riskBarPct       = tags.length > 0 && riskTotal > 0 ? Math.min(riskTotal / RISK_MAX, 1) * 100 : 0;
  const riskBarColor     = riskTotal < 0.3 ? 'var(--down)' : riskTotal < 0.6 ? 'var(--accent)' : riskTotal < 1.0 ? '#B89A5A' : 'var(--up)';
  const marketStateLabel = MARKET_STATE_OPTIONS.find(o => o.value === marketState)?.label ?? marketState;
  const deviationCount   = tagStats.filter(s => s.triggered).length;

  /* 相關性矩陣未正確載入：明確失敗 OR 有 2+ Tag 但矩陣仍為空 OR 所有 ρ 都為 1（從未計算過） */
  const allRhoAreOne = correlationMatrix.length > 0 && correlationMatrix.every(e => e.rho === 1);
  const showMatrixAlert = tags.length >= 2 && !correlationLoading && (
    correlationLoadFailed || correlationMatrix.length === 0 || allRhoAreOne
  );

  async function handleReloadMatrix(e: React.MouseEvent) {
    e.stopPropagation();
    await onReloadCorrelationMatrix();
    // Risk 值由 useRiskViewModel useMemo 在 correlationMatrix 更新後自動重算，不觸發再平衡
  }

  const sliderVal = Math.round(baseThreshold * 100);
  const liqVal    = Math.round(liquidityCapRatio * 100);
  const concVal   = Math.round(concentrationLimit * 100);

  return (
    <Tooltip.Provider>
    <div className="ft-panel" style={{ marginBottom: 16 }}>

      {/* ── 收折標題列 ── */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', gap: 8 }}>

        {/* 左側：可點擊展開/收折 */}
        <div
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          aria-controls={PANEL_ID}
          onClick={handleToggle}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleToggle(); } }}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            flex: 1, cursor: 'pointer', flexWrap: 'nowrap',
            fontSize: 'var(--text-sm)', color: 'var(--text)',
            overflow: 'hidden', minWidth: 0,
          }}
        >
          {/* 標題 */}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <Icon name={expanded ? 'expand_less' : 'expand_more'} size={24} style={{ color: 'var(--muted)' }} />
            <span style={{ fontWeight: 500, whiteSpace: 'nowrap', color: 'var(--text)' }}>
              風險/再平衡模組
            </span>
          </span>
          {/* {市場狀態}：進度條 {風險值} {標籤偏差說明} */}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
            <span style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{marketStateLabel}：</span>
            {!showMatrixAlert && riskBarPct > 0 && (
              <span
                aria-hidden="true"
                style={{ display: 'inline-flex', alignItems: 'center', width: 56, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}
              >
                <span style={{ width: `${riskBarPct}%`, height: '100%', background: riskBarColor, borderRadius: 3, transition: 'width 0.4s ease, background 0.4s ease' }} />
              </span>
            )}
            {showMatrixAlert ? (
              <button
                className="btn-ghost"
                onClick={handleReloadMatrix}
                disabled={correlationLoading}
                style={{ fontSize: 'var(--text-xs)', padding: '2px 10px', color: 'var(--up)', borderColor: 'var(--up-bd)', whiteSpace: 'nowrap' }}
                aria-label="相關性矩陣未載入，點擊重新讀取並重算"
              >
                <Icon name="warning" size={20} /> 矩陣未載入，重算
              </button>
            ) : (
              <span
                aria-live="polite"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
              >
                {riskLabel}
              </span>
            )}
            {deviationCount > 0 && (
              <Tooltip.Root delayDuration={300}>
                <Tooltip.Trigger asChild>
                  <span style={{ color: 'var(--muted)', cursor: 'help', display: 'inline-flex', alignItems: 'center' }}>
                    <Icon name="warning" size={24} />
                  </span>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content role="tooltip" style={TOOLTIP_STYLE} sideOffset={4}>
                    {deviationCount} 個標籤偏離目標配置
                    <Tooltip.Arrow style={{ fill: 'var(--border)' }} />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            )}
            {!expanded && needsMonthlyReminder && (
              <Tooltip.Root delayDuration={300}>
                <Tooltip.Trigger asChild>
                  <span style={{ color: 'var(--muted)', cursor: 'help', display: 'inline-flex', alignItems: 'center' }}>
                    <Icon name="schedule" size={24} />
                  </span>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content role="tooltip" style={TOOLTIP_STYLE} sideOffset={4}>
                    本月尚未執行再平衡
                    <Tooltip.Arrow style={{ fill: 'var(--border)' }} />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            )}
            {mddIcon && (
              <Tooltip.Root delayDuration={300}>
                <Tooltip.Trigger asChild>
                  <span style={{ color: mddIcon.color, cursor: 'help', display: 'inline-flex', alignItems: 'center' }}>
                    <Icon name="trending_down" size={24} />
                  </span>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content role="tooltip" style={TOOLTIP_STYLE} sideOffset={4}>
                    <div>距高點 {(mdd!.currentDrawdown * 100).toFixed(1)}%</div>
                    <div style={{ color: 'var(--dim)', fontSize: 'var(--text-xs)', marginTop: 2 }}>
                      歷史最大回撤 {(mdd!.maxDrawdown * 100).toFixed(1)}%
                    </div>
                    <Tooltip.Arrow style={{ fill: 'var(--border)' }} />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            )}
            {marketStateAuto && marketStateAuto !== marketState && (
              <Tooltip.Root delayDuration={300}>
                <Tooltip.Trigger asChild>
                  <span style={{ color: 'var(--accent)', cursor: 'help', display: 'inline-flex', alignItems: 'center' }}>
                    <Icon name="tips_and_updates" size={24} />
                  </span>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content role="tooltip" style={TOOLTIP_STYLE} sideOffset={4}>
                    系統建議：{MARKET_STATE_AUTO_LABEL[marketStateAuto] ?? marketStateAuto}{vix != null ? `（VIX ${vix.toFixed(1)}）` : ''}
                    <Tooltip.Arrow style={{ fill: 'var(--border)' }} />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            )}
          </span>
        </div>

        {/* 右側：快照下拉（不觸發展開/收折）*/}
        {snapshots.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)', whiteSpace: 'nowrap' }}>再平衡：</span>
            {snapshots.length === 1 ? (
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--dim)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                {formatSnapDate(snapshots[0].createdAt)}
              </span>
            ) : (
              <Select.Root value={selectedSnapshotId ?? ''} onValueChange={onSelectSnapshot}>
                <Select.Trigger
                  className="rd-select-trigger"
                  aria-label="選擇再平衡快照"
                  onClick={e => e.stopPropagation()}
                >
                  <Select.Value />
                  <Select.Icon style={{ color: 'var(--dim)', fontSize: 10, marginLeft: 2 }}>▾</Select.Icon>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className="rd-select-content" position="popper" sideOffset={4}>
                    <Select.Viewport>
                      {snapshots.map(s => (
                        <Select.Item key={s.id} value={s.id} className="rd-select-item">
                          <Select.ItemText>{formatSnapDate(s.createdAt)}</Select.ItemText>
                        </Select.Item>
                      ))}
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            )}
          </div>
        )}
      </div>

      {/* ── 展開內容（grid 動畫）── */}
      <div
        id={PANEL_ID}
        className={`risk-panel-body${expanded ? ' is-open' : ''}`}
        aria-hidden={!expanded}
      >
        <div className="risk-panel-body__inner">
        <div className="tab-panel-body" style={{ padding: '0 16px 16px' }}>

            {/* ── Tab 導覽列 ── */}
            <div
              role="tablist"
              aria-label="風險模組"
              style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 16 }}
            >
              {(['tags', 'downside', 'scenario', 'settings'] as const).map(tab => (
                <button
                  key={tab}
                  role="tab"
                  id={`tab-btn-${tab}`}
                  aria-selected={activeTab === tab}
                  aria-controls={
                    tab === 'tags'     ? TAB_TAGS_ID     :
                    tab === 'downside' ? TAB_DOWNSIDE_ID :
                    tab === 'scenario' ? TAB_SCENARIO_ID :
                    TAB_SETTINGS_ID
                  }
                  onClick={() => {
                    setActiveTab(tab);
                    if (tab === 'downside' && !downsideTabOpened) {
                      setDownsideTabOpened(true);
                      onDownsideRiskTabOpen();
                    }
                    if (tab === 'scenario' && !scenarioTabOpened) {
                      setScenarioTabOpened(true);
                      onScenarioTabOpen();
                    }
                  }}
                  style={{
                    padding: '6px 16px',
                    background: 'none',
                    border: 'none',
                    borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                    marginBottom: -1,
                    color: activeTab === tab ? 'var(--accent)' : 'var(--muted)',
                    cursor: 'pointer',
                    fontSize: 'var(--text-sm)',
                    fontFamily: 'var(--font-sans)',
                    fontWeight: activeTab === tab ? 600 : 400,
                    transition: 'color 0.15s, border-color 0.15s',
                  }}
                >
                  {tab === 'tags' ? '標籤配置' : tab === 'downside' ? '下行風險' : tab === 'scenario' ? '情境分析' : '風險設定'}
                </button>
              ))}
            </div>

            {/* ── Tab 1：標籤配置 ── */}
            <div
              id={TAB_TAGS_ID}
              role="tabpanel"
              aria-labelledby="tab-btn-tags"
              hidden={activeTab !== 'tags'}
            >
              <TagManagerTab
                tags={tags}
                tagStats={tagStats}
                overlappingGroups={overlappingGroups}
                loading={loading}
                saving={saving}
                onAdd={onAdd}
                onUpdate={onUpdate}
                onRemove={onRemove}
                holdings={holdings}
                sparklines={sparklines}
                onRecalculateAll={onRecalculateAll}
                recalculating={recalculating}
                onTriggerRebalance={onTriggerRebalance}
                calculating={calculating}
                correlationUpdated={correlationUpdated}
                onAutoCalcRhoAndRebalance={handleAutoCalcRhoAndRebalance}
                dynamicThreshold={dynamicThreshold}
              />

              {/* ── 因子曝險摘要（E3） ── */}
              {tagStats.length > 0 && (
                <div style={{ borderTop: '1px solid var(--border)', marginTop: 8 }}>
                  <button
                    type="button"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      width: '100%', padding: '8px 16px',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--muted)', fontSize: 'var(--text-sm)', fontWeight: 600,
                      textAlign: 'left',
                    }}
                    aria-expanded={factorExposureOpen}
                    onClick={() => setFactorExposureOpen(v => !v)}
                  >
                    <Icon name={factorExposureOpen ? 'expand_less' : 'expand_more'} size={16} />
                    因子曝險摘要
                  </button>
                  {factorExposureOpen && (
                    <div style={{ padding: '4px 16px 16px' }}>
                      {[...tagStats]
                        .sort((a, b) => b.actualWeight - a.actualWeight)
                        .map((stat, idx) => (
                          <div key={stat.tagName} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                            <span style={{ width: 80, fontSize: 'var(--text-xs)', color: 'var(--muted)', flexShrink: 0, textAlign: 'right' }}>
                              {stat.tagName}
                            </span>
                            <div style={{ flex: 1, height: 8, background: 'var(--surface)', borderRadius: 4, overflow: 'hidden' }}>
                              <div style={{
                                width: `${Math.min(stat.actualWeight, 100)}%`,
                                height: '100%',
                                background: chartColors[idx % chartColors.length],
                                borderRadius: 4,
                                transition: 'width 0.3s',
                              }} />
                            </div>
                            <span style={{ width: 44, fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--text-value)', textAlign: 'right', flexShrink: 0 }}>
                              {stat.actualWeight.toFixed(1)}%
                            </span>
                          </div>
                        ))
                      }
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Tab 2：下行風險 ── */}
            <div
              id={TAB_DOWNSIDE_ID}
              role="tabpanel"
              aria-labelledby="tab-btn-downside"
              hidden={activeTab !== 'downside'}
            >
              {downsideRiskLoading ? (
                <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--dim)', fontSize: 'var(--text-sm)' }}>
                  <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', verticalAlign: 'middle', marginRight: 8 }} />
                  載入快照資料…
                </div>
              ) : !downsideTabOpened ? (
                <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--dim)', fontSize: 'var(--text-sm)' }}>
                  點擊此 Tab 後自動載入
                </div>
              ) : downsideRiskSampleDays < 60 ? (
                <div style={{ padding: '24px 0', textAlign: 'center' }}>
                  <p style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)', marginBottom: 4 }}>快照資料不足</p>
                  <p style={{ color: 'var(--dim)', fontSize: 'var(--text-xs)' }}>
                    目前 {downsideRiskSampleDays} 筆，需至少 60 筆才可顯示初版指標
                  </p>
                </div>
              ) : (
                <div>
                  {/* VaR / CVaR 指標卡 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                    {[
                      { label: '單日 VaR 95%', pct: varCvar?.var95Pct, amount: varCvar?.var95Amount, tip: '在 95% 信心水準下，單日最大可能損失' },
                      { label: 'CVaR 95%',     pct: varCvar?.cvar95Pct, amount: varCvar?.cvar95Amount, tip: '最差 5% 交易日的平均損失（比 VaR 更保守的尾部風險估計）' },
                    ].map(({ label, pct, amount, tip }) => (
                      <div key={label} style={{
                        padding: '12px 16px',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>{label}</span>
                          <SettingTooltip content={tip} />
                        </div>
                        {pct != null ? (
                          <>
                            <div style={{ fontSize: 'var(--text-base)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', color: 'var(--up)', fontWeight: 600 }}>
                              {(pct * 100).toFixed(2)}%
                            </div>
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--dim)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                              ≈ ${amount != null ? amount.toLocaleString('zh-TW', { maximumFractionDigits: 0 }) : '—'}
                            </div>
                          </>
                        ) : (
                          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--dim)' }}>—</div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* 最大回撤摘要 */}
                  {mdd && (
                    <div style={{
                      padding: '10px 14px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                      gap: '8px 16px',
                      marginBottom: 12,
                    }}>
                      {[
                        { label: '目前距高點', value: `${(mdd.currentDrawdown * 100).toFixed(1)}%` },
                        { label: '歷史最大回撤', value: `${(mdd.maxDrawdown * 100).toFixed(1)}%` },
                        { label: '高點日期', value: mdd.peakDate || '—' },
                        { label: '低點日期', value: mdd.troughDate || '—' },
                        { label: '恢復天數', value: mdd.isRecovered && mdd.recoveryDays != null ? `${mdd.recoveryDays} 天` : '尚未回到前高' },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--dim)', marginBottom: 2 }}>{label}</div>
                          <div style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--dim)' }}>
                    歷史模擬法，基於過去 {downsideRiskSampleDays} 筆快照資料
                    {downsideRiskSampleDays < 252 && '（252 筆以上可信度較高）'}
                  </p>
                </div>
              )}
            </div>

            {/* ── Tab 3：情境分析 ── */}
            <div
              id={TAB_SCENARIO_ID}
              role="tabpanel"
              aria-labelledby="tab-btn-scenario"
              hidden={activeTab !== 'scenario'}
            >
              {scenarioLoading ? (
                <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--dim)', fontSize: 'var(--text-sm)' }}>
                  <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', verticalAlign: 'middle', marginRight: 8 }} />
                  載入資料…
                </div>
              ) : !scenarioTabOpened ? (
                <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--dim)', fontSize: 'var(--text-sm)' }}>
                  點擊此 Tab 後自動載入
                </div>
              ) : (
                <div>

                  {/* ── Portfolio Beta ── */}
                  {scenarioKbarsAvailable && (
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12 }}>
                        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)', fontWeight: 500 }}>Portfolio Beta</span>
                        <SettingTooltip content="投組日報酬對加權指數日報酬做 OLS 回歸所得的市場敏感係數。Beta > 1 表示比大盤波動更大，Beta < 1 表示相對防禦。" />
                      </div>
                      {scenarioSampleDays < 60 ? (
                        <div style={{ padding: '16px 0', color: 'var(--dim)', fontSize: 'var(--text-sm)' }}>
                          快照資料不足（{scenarioSampleDays} 筆），需至少 60 筆才可計算
                        </div>
                      ) : scenarioBeta == null ? (
                        <div style={{ padding: '16px 0', color: 'var(--dim)', fontSize: 'var(--text-sm)' }}>
                          指數資料與快照日期對齊不足，無法計算
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10, marginBottom: 8 }}>
                          {[
                            {
                              label: 'Beta',
                              value: scenarioBeta.realizedBeta.toFixed(3),
                              sub: scenarioBeta.realizedBeta < 0.8 ? '防禦型' : scenarioBeta.realizedBeta <= 1.2 ? '接近大盤' : '積極型',
                              subColor: scenarioBeta.realizedBeta < 0.8 ? 'var(--down)' : scenarioBeta.realizedBeta <= 1.2 ? 'var(--accent)' : 'var(--up)',
                            },
                            { label: '年化 Alpha', value: `${(scenarioBeta.alpha * 100).toFixed(2)}%`, sub: undefined, subColor: undefined },
                            { label: 'R²',          value: scenarioBeta.rSquared.toFixed(3),           sub: undefined, subColor: undefined },
                          ].map(({ label, value, sub, subColor }) => (
                            <div key={label} style={{ padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--dim)', marginBottom: 4 }}>{label}</div>
                              <div style={{ fontSize: 'var(--text-base)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', color: 'var(--text)', fontWeight: 600 }}>{value}</div>
                              {sub && <div style={{ fontSize: 'var(--text-xs)', color: subColor, marginTop: 2 }}>{sub}</div>}
                            </div>
                          ))}
                        </div>
                      )}
                      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--dim)' }}>
                        {scenarioBeta != null && (
                          <>基於 {scenarioBeta.sampleDays} 筆對齊日報酬
                          {scenarioBeta.status === 'reference' && '（資料偏少，僅供參考）'}
                          {scenarioBeta.status === 'display'   && '（90 筆以上，可供參考）'}
                          {scenarioBeta.status === 'reliable'  && '（252 筆以上，可信度較高）'}
                          </>
                        )}
                      </p>
                    </div>
                  )}

                  {/* ── 壓力測試 ── */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12 }}>
                      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)', fontWeight: 500 }}>情境壓力測試</span>
                      <SettingTooltip content="依各 Tag 權重與預設 Shock 估算投組在特定情境下的可能損失。若你的 Tag 名稱與情境定義不符，該情境估算為 0。" />
                    </div>
                    {scenarioStress.length === 0 ? (
                      <div style={{ color: 'var(--dim)', fontSize: 'var(--text-sm)' }}>尚無 Tag 配置，無法估算</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                        {scenarioStress.map(s => {
                          const detail = SCENARIO_DETAIL[s.id];
                          return (
                            <div key={s.id} style={{ display: 'flex', alignItems: 'center', padding: '6px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', gap: 16 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>{s.name}</span>
                                {detail && (
                                  <Tooltip.Root delayDuration={200}>
                                    <Tooltip.Trigger asChild>
                                      <span style={{ cursor: 'help', color: 'var(--dim)', lineHeight: 1 }}>
                                        <Icon name="info" size={13} />
                                      </span>
                                    </Tooltip.Trigger>
                                    <Tooltip.Portal>
                                      <Tooltip.Content
                                        role="tooltip"
                                        sideOffset={5}
                                        style={{ ...TOOLTIP_STYLE, maxWidth: 260 }}
                                      >
                                        <span style={{ display: 'block', color: 'var(--text)', marginBottom: 6 }}>{detail.desc}</span>
                                        <span style={{ display: 'block', color: 'var(--dim)', fontSize: 'var(--text-xs)', marginBottom: 4 }}>預設 Shock：</span>
                                        {detail.shocks.map(sh => (
                                          <span key={sh.tag} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 'var(--text-xs)' }}>
                                            <span style={{ color: 'var(--muted)' }}>{sh.tag}</span>
                                            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--up)' }}>{sh.pct}</span>
                                          </span>
                                        ))}
                                        <span style={{ display: 'block', borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 5, fontSize: 'var(--text-xs)', color: 'var(--dim)' }}>
                                          損失 = Σ（Tag實際權重 × Shock）× 總資產
                                        </span>
                                        <Tooltip.Arrow style={{ fill: 'var(--border)' }} />
                                      </Tooltip.Content>
                                    </Tooltip.Portal>
                                  </Tooltip.Root>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
                                <span style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', color: s.estimatedReturnPct < 0 ? 'var(--up)' : 'var(--dim)' }}>
                                  {s.estimatedReturnPct < 0 ? '' : '+'}{(s.estimatedReturnPct * 100).toFixed(1)}%
                                </span>
                                <span style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', color: 'var(--dim)' }}>
                                  {s.estimatedLossAmount > 0 ? `≈ -$${s.estimatedLossAmount.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}` : '—'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--dim)', marginTop: 8 }}>
                      Tag 名稱需與預設情境一致才有估算值；匯率/利率情境需對應相關 Tag 存在。
                    </p>
                  </div>

                </div>
              )}
            </div>

            {/* ── Tab 4：風險設定 ── */}
            <div
              id={TAB_SETTINGS_ID}
              role="tabpanel"
              aria-labelledby="tab-btn-settings"
              hidden={activeTab !== 'settings'}
            >
              {/* 市場狀態 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-sm)', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                  市場狀態
                  <SettingTooltip content="選擇你判斷目前市場所處的狀態，系統會依此調整各 Tag 的風險係數，影響 Risk 總值計算" />
                </span>
                <div role="radiogroup" aria-label="市場狀態" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {MARKET_STATE_OPTIONS.map(opt => (
                    <label
                      key={opt.value}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '4px 10px',
                        border: `1px solid ${marketState === opt.value ? 'var(--accent)' : 'var(--border)'}`,
                        borderRadius: 'var(--radius-sm)',
                        background: marketState === opt.value ? 'var(--accent-bg)' : 'transparent',
                        cursor: marketStateChanging ? 'not-allowed' : 'pointer',
                        fontSize: 'var(--text-sm)', whiteSpace: 'nowrap',
                        color: marketState === opt.value ? 'var(--accent)' : 'var(--muted)',
                        opacity: marketStateChanging ? 0.6 : 1,
                        transition: 'border-color 0.15s, background 0.15s',
                      }}
                    >
                      <input
                        type="radio"
                        name="market-state"
                        value={opt.value}
                        checked={marketState === opt.value}
                        disabled={marketStateChanging}
                        onChange={() => onMarketStateChange(opt.value)}
                        style={{ display: 'none' }}
                      />
                      {marketStateChanging && marketState === opt.value && (
                        <span style={{ display: 'inline-block', width: 10, height: 10, border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                      )}
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>

              {/* 各項設定 — 2 欄網格，窄視窗自動降為 1 欄 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(252px, 1fr))', gap: '14px 32px', marginBottom: 20 }}>

                {/* 基礎偏離門檻 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span id="lbl-risk-threshold" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-sm)', color: 'var(--muted)', whiteSpace: 'nowrap', minWidth: 104, flexShrink: 0 }}>
                    基礎偏離門檻
                    <SettingTooltip content="Tag 實際配置偏離目標幾 % 才觸發再平衡建議。設越小越敏感，設越大表示容忍更多偏差" />
                  </span>
                  <Slider.Root
                    className="rd-slider"
                    min={1} max={20} step={1}
                    value={[sliderVal]}
                    onValueChange={([v]) => onThresholdChange(v / 100)}
                    aria-labelledby="lbl-risk-threshold"
                  >
                    <Slider.Track className="rd-slider__track">
                      <Slider.Range className="rd-slider__range" />
                    </Slider.Track>
                    <Slider.Thumb className="rd-slider__thumb" />
                  </Slider.Root>
                  <span style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', minWidth: 40, color: 'var(--text-value)' }}>
                    ± {sliderVal}%
                  </span>
                </div>

                {/* 集中度上限 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span id="lbl-conc-limit" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-sm)', color: 'var(--muted)', whiteSpace: 'nowrap', minWidth: 104, flexShrink: 0 }}>
                    集中度上限
                    <SettingTooltip content="同性質 Tag 合計持股比例的警戒線，超過此值代表資產過度集中在同類標的" />
                  </span>
                  <Slider.Root
                    className="rd-slider"
                    min={50} max={95} step={5}
                    value={[concVal]}
                    onValueChange={([v]) => onConcentrationLimitChange(v / 100)}
                    aria-labelledby="lbl-conc-limit"
                  >
                    <Slider.Track className="rd-slider__track">
                      <Slider.Range className="rd-slider__range" />
                    </Slider.Track>
                    <Slider.Thumb className="rd-slider__thumb" />
                  </Slider.Root>
                  <span style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', minWidth: 40, color: 'var(--text-value)' }}>
                    {concVal}%
                  </span>
                </div>

                {/* 流動性上限 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span id="lbl-liq-cap" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-sm)', color: 'var(--muted)', whiteSpace: 'nowrap', minWidth: 104, flexShrink: 0 }}>
                    流動性上限
                    <SettingTooltip content="單次再平衡每檔的交易量，不超過該股平均日成交量的這個比例，避免大單衝擊市場價格" />
                  </span>
                  <Slider.Root
                    className="rd-slider"
                    min={5} max={50} step={5}
                    value={[liqVal]}
                    onValueChange={([v]) => onLiquidityCapChange(v / 100)}
                    aria-labelledby="lbl-liq-cap"
                  >
                    <Slider.Track className="rd-slider__track">
                      <Slider.Range className="rd-slider__range" />
                    </Slider.Track>
                    <Slider.Thumb className="rd-slider__thumb" />
                  </Slider.Root>
                  <span style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', minWidth: 40, color: 'var(--text-value)' }}>
                    {liqVal}%
                  </span>
                </div>

                {/* ADV 計算天數 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label htmlFor="adv-days" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-sm)', color: 'var(--muted)', whiteSpace: 'nowrap', minWidth: 104, flexShrink: 0 }}>
                    ADV 計算天數
                    <SettingTooltip content="計算平均日成交量時回溯幾天。天數多較平滑，天數少較貼近近期真實成交狀況" />
                  </label>
                  <input
                    id="adv-days"
                    type="number"
                    inputMode="numeric"
                    min={5} max={60} step={5}
                    value={advLookbackDays}
                    onChange={e => {
                      const v = Math.round(Number(e.target.value) / 5) * 5;
                      onAdvLookbackDaysChange(Math.max(5, Math.min(60, v)));
                    }}
                    style={{
                      width: 60, textAlign: 'center',
                      height: 'var(--ctrl-h)', boxSizing: 'border-box',
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)', color: 'var(--text)',
                      fontFamily: 'var(--font-mono)', fontSize: 'var(--text-md)',
                      padding: '0 6px',
                    }}
                  />
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--dim)' }}>日（5 ～ 60）</span>
                </div>

                {/* 波動係數 — 唯讀資訊，全寬橫列 */}
                <div style={{
                  gridColumn: '1 / -1',
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '6px 12px',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-sm)', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    波動係數
                    <SettingTooltip content="近 20 日波動相對過去 90 日的倍數。大於 1 表示近期比平常動盪，偏離門檻會自動放寬" />
                  </span>
                  <span style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', color: 'var(--text-value)' }}>
                    {volatilityFactor.toFixed(2)}
                  </span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--dim)', fontVariantNumeric: 'tabular-nums' }}>
                    → 動態門檻 ± {(dynamicThreshold * 100).toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Tag 相關性矩陣（常態展示）*/}
              {tags.length >= 2 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>
                      Tag 相關性矩陣
                      <SettingTooltip content="各 Tag 之間漲跌的連動程度（ρ）。越接近 1 代表同漲同跌、分散效果差；越接近 0 代表彼此獨立" />
                    </span>
                    <button
                      className="btn-ghost"
                      onClick={handleAutoCalcRho}
                      disabled={rhoCalc.calculating || tags.length < 2 || holdings.length === 0}
                      aria-label="自動計算 Tag 相關性矩陣"
                      title="依持股 Sparkline 計算各 Tag 間的 Pearson ρ"
                      style={{ fontSize: 'var(--text-xs)', padding: '2px 10px' }}
                    >
                      {rhoCalc.calculating
                        ? <span style={{ display: 'inline-block', width: 10, height: 10, border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', verticalAlign: 'middle' }} />
                        : <><Icon name="sync" size={20} /> Tag 矩陣 ρ</>}
                    </button>
                  </div>

                  {correlationLoading ? (
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--dim)', margin: '8px 0' }}>
                      資料載入中…
                    </p>
                  ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ borderCollapse: 'collapse', fontSize: 'var(--text-xs)', tableLayout: 'auto' }}>
                      <thead>
                        <tr>
                          <th style={{ padding: '4px 8px', color: 'var(--dim)', fontWeight: 400 }} />
                          {tags.map(t => (
                            <th key={t.id} style={{ padding: '4px 8px', color: 'var(--muted)', fontWeight: 500, textAlign: 'center', whiteSpace: 'nowrap' }}>
                              {t.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tags.map((ta, i) => (
                          <tr key={ta.id}>
                            <td style={{ padding: '4px 8px', color: 'var(--muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>{ta.name}</td>
                            {tags.map((tb, j) => {
                              if (j < i) return <td key={tb.id} />;
                              if (j === i) return (
                                <td key={tb.id} style={{ padding: '4px 6px', textAlign: 'center' }}>
                                  <span style={{ color: 'var(--dim)', fontFamily: 'var(--font-mono)' }}>1.00</span>
                                </td>
                              );
                              return (
                                <td key={tb.id} style={{ padding: '4px 6px' }}>
                                  <input
                                    type="number"
                                    inputMode="decimal"
                                    min={-1} max={1} step={0.01}
                                    value={getRho(ta.name, tb.name)}
                                    onChange={e => setRho(ta.name, tb.name, e.target.value)}
                                    onBlur={handleMatrixBlur}
                                    style={{
                                      width: 60, textAlign: 'center',
                                      background: 'var(--surface)', border: '1px solid var(--border)',
                                      borderRadius: 'var(--radius-sm)', color: 'var(--text)',
                                      fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
                                      padding: '2px 4px',
                                    }}
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--dim)', marginTop: 6 }}>
                      ρ 範圍 −1 ～ 1；未填寫預設 1.0（最保守估計）。離開欄位後自動儲存。
                    </p>
                  </div>
                  )}
                </div>
              )}

            </div>

          </div>
        </div>
      </div>

      {/* ρ 計算結果預覽 Modal */}
      <Modal
        open={rhoCalc.preview != null}
        onClose={handleCancelRho}
        title="Tag 矩陣 ρ 計算結果"
        size="md"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn-ghost" onClick={handleCancelRho}>取消</button>
            <button className="btn-ghost btn-ghost--accent" onClick={handleConfirmRho}>
              更新並儲存{rhoCalc.pendingRebalance ? '，並計算再平衡' : ''}
            </button>
          </div>
        }
      >
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', marginBottom: 12 }}>
          橘色表示與現有值差距 &gt; 0.2
          {rhoCalc.pendingRebalance && '；確認後將自動觸發再平衡計算。'}
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 'var(--text-xs)' }}>
            <thead>
              <tr>
                <th style={{ padding: '4px 8px', color: 'var(--dim)', fontWeight: 400 }} />
                {tags.map(t => (
                  <th key={t.id} style={{ padding: '4px 8px', color: 'var(--muted)', fontWeight: 500, textAlign: 'center', whiteSpace: 'nowrap' }}>
                    {t.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tags.map((ta, i) => (
                <tr key={ta.id}>
                  <td style={{ padding: '4px 8px', color: 'var(--muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>{ta.name}</td>
                  {tags.map((tb, j) => {
                    if (j < i) return <td key={tb.id} />;
                    if (j === i) return (
                      <td key={tb.id} style={{ padding: '4px 6px', textAlign: 'center' }}>
                        <span style={{ color: 'var(--dim)', fontFamily: 'var(--font-mono)' }}>1.00</span>
                      </td>
                    );
                    const entry = rhoCalc.preview?.find(e =>
                      (e.tagA === ta.name && e.tagB === tb.name) ||
                      (e.tagA === tb.name && e.tagB === ta.name)
                    );
                    const isBig = rhoCalc.bigDiffKeys.has(rhoKey(ta.name, tb.name));
                    return (
                      <td key={tb.id} style={{ padding: '4px 6px', textAlign: 'center' }}>
                        <span style={{
                          fontFamily: 'var(--font-mono)',
                          color: isBig ? 'var(--text)' : 'var(--muted)',
                          background: isBig ? 'rgba(200,140,60,0.18)' : 'transparent',
                          padding: isBig ? '1px 4px' : undefined,
                          borderRadius: isBig ? 3 : undefined,
                        }}>
                          {entry?.rho.toFixed(2) ?? '—'}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>
    </div>
    </Tooltip.Provider>
  );
}
