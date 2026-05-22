import { useState, useEffect, useMemo } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as Slider from '@radix-ui/react-slider';
import * as Select from '@radix-ui/react-select';
import type {
  TagDTO, CreateTagPayload, TagStat, MarketState, CorrelationEntry,
  HoldingDTO, OverlappingTagGroup,
} from '../../../types';
import { calcTagDailyReturnsFromSparklines, buildCorrelationEntries } from '../../../utils/correlationCalc';
import { useSnapshotStore } from '../../../stores/snapshotStore';
import TagManagerTab from './TagManagerTab';
import Modal from '../../components/Modal';
import { toast } from '../../components/Toast';

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
          style={{ cursor: 'help', color: 'var(--dim)', fontSize: 'var(--text-xs)', userSelect: 'none' }}
        >
          ⓘ
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

const PANEL_ID      = 'risk-rebalance-panel';
const TAB_TAGS_ID   = 'risk-tab-tags';
const TAB_SETTINGS_ID = 'risk-tab-settings';

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
}: Props) {
  const vix             = useSnapshotStore(s => s.vix);
  const marketStateAuto = useSnapshotStore(s => s.marketStateAuto);

  const [expanded,  setExpanded]  = useState(false);
  const [activeTab, setActiveTab] = useState<'tags' | 'settings'>('tags');
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

  function buildRiskClipboardText(): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

    const tagMap = new Map(tags.map(t => [t.name, t]));

    function dirLabel(dir: string | undefined): string {
      if (dir === 'upper_only') return '僅上限↓';
      if (dir === 'lower_only') return '僅下限↑';
      return '雙向±';
    }

    const lines: string[] = [
      '=== 風險 / 再平衡配置報告 ===',
      `產生時間：${timestamp}`,
      '',
      '【Tag 標籤配置】',
      '標籤名稱\t當前配比\t目標配置\t觸發限制\t偏差\t狀態',
    ];

    for (const s of tagStats) {
      const actual = `${s.actualWeight.toFixed(1)}%`;
      const target = s.targetWeight != null ? `${s.targetWeight.toFixed(1)}%` : '—';
      const dir    = dirLabel(tagMap.get(s.tagName)?.triggerDirection);
      const delta  = s.targetWeight != null
        ? `${s.delta >= 0 ? '+' : ''}${s.delta.toFixed(1)}%`
        : '—';
      const status = s.targetWeight == null ? '無目標' : s.triggered ? '⚠ 偏差觸發' : '正常';
      lines.push(`${s.tagName}\t${actual}\t${target}\t${dir}\t${delta}\t${status}`);
    }

    /* 相關性矩陣 */
    if (tags.length >= 2) {
      lines.push('', '【Tag 相關性矩陣（ρ）】');

      const header = '\t' + tags.map(t => t.name).join('\t');
      lines.push(header);

      /* 預建 Map，避免雙重迴圈內 O(n) find */
      const corrMap = new Map(
        correlationMatrix.flatMap(e => [
          [`${e.tagA}|${e.tagB}`, e.rho],
          [`${e.tagB}|${e.tagA}`, e.rho],
        ])
      );

      for (const ta of tags) {
        const cells = tags.map(tb => {
          if (ta.name === tb.name) return '1.00';
          const rho = corrMap.get(`${ta.name}|${tb.name}`);
          return rho != null ? rho.toFixed(2) : '—';
        });
        lines.push(`${ta.name}\t${cells.join('\t')}`);
      }
    }

    lines.push('', '【股票 Tag 配置】', '代碼\t名稱\t標籤（持股權重%）');

    for (const h of holdings) {
      const tagPart = h.tags.length > 0
        ? h.tags.map(t => `${t.tagName}(${t.weightRatio}%)`).join(' ')
        : '—';
      lines.push(`${h.stockCode}\t${h.stockName}\t${tagPart}`);
    }

    return lines.join('\n');
  }

  async function handleCopyClick(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(buildRiskClipboardText());
      toast.success('已複製配置報告到剪貼簿');
    } catch {
      toast.error('複製失敗，請確認瀏覽器權限');
    }
  }

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

  /* 相關性矩陣未正確載入：明確失敗 OR 有 2+ Tag 但矩陣仍為空 */
  const showMatrixAlert = tags.length >= 2 && !correlationLoading && (
    correlationLoadFailed || correlationMatrix.length === 0
  );

  async function handleReloadMatrix(e: React.MouseEvent) {
    e.stopPropagation();
    await onReloadCorrelationMatrix();
    onTriggerRebalance();
  }

  const sliderVal = Math.round(baseThreshold * 100);
  const liqVal    = Math.round(liquidityCapRatio * 100);
  const concVal   = Math.round(concentrationLimit * 100);

  return (
    <div className="ft-panel" style={{ marginBottom: 16 }}>

      {/* ── 收折標題列 ── */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', gap: 8 }}>

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
            <span style={{ color: 'var(--muted)' }}>{expanded ? '▲' : '▼'}</span>
            <span
              onClick={handleCopyClick}
              title="點擊複製配置報告"
              style={{
                fontWeight: 500, whiteSpace: 'nowrap', color: 'var(--text)',
                cursor: 'copy', userSelect: 'none',
                borderBottom: '1px dashed var(--dim)',
                paddingBottom: 1,
              }}
            >
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
                ⚠ 矩陣未載入，重算
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
              <span style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)', whiteSpace: 'nowrap', marginLeft: 24 }}>
                ⚠ {deviationCount} 標籤偏差
              </span>
            )}
            {!expanded && needsMonthlyReminder && (
              <span style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)', whiteSpace: 'nowrap' }}>
                ⏰ 本月尚未再平衡
              </span>
            )}
            {marketStateAuto && marketStateAuto !== marketState && (
              <span style={{ color: 'var(--accent)', fontSize: 'var(--text-sm)', whiteSpace: 'nowrap', marginLeft: 8 }}>
                💡 系統建議：{MARKET_STATE_AUTO_LABEL[marketStateAuto] ?? marketStateAuto}{vix != null ? `（VIX ${vix.toFixed(1)}）` : ''}
              </span>
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
          <Tooltip.Provider>
        <div className="tab-panel-body" style={{ padding: '0 16px 16px' }}>

            {/* ── Tab 導覽列 ── */}
            <div
              role="tablist"
              aria-label="風險模組"
              style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 16 }}
            >
              <button
                role="tab"
                id="tab-btn-tags"
                aria-selected={activeTab === 'tags'}
                aria-controls={TAB_TAGS_ID}
                onClick={() => setActiveTab('tags')}
                style={{
                  padding: '6px 16px',
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === 'tags' ? '2px solid var(--accent)' : '2px solid transparent',
                  marginBottom: -1,
                  color: activeTab === 'tags' ? 'var(--accent)' : 'var(--muted)',
                  cursor: 'pointer',
                  fontSize: 'var(--text-sm)',
                  fontFamily: 'var(--font-sans)',
                  fontWeight: activeTab === 'tags' ? 600 : 400,
                  transition: 'color 0.15s, border-color 0.15s',
                }}
              >
                標籤配置
              </button>
              <button
                role="tab"
                id="tab-btn-settings"
                aria-selected={activeTab === 'settings'}
                aria-controls={TAB_SETTINGS_ID}
                onClick={() => setActiveTab('settings')}
                style={{
                  padding: '6px 16px',
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === 'settings' ? '2px solid var(--accent)' : '2px solid transparent',
                  marginBottom: -1,
                  color: activeTab === 'settings' ? 'var(--accent)' : 'var(--muted)',
                  cursor: 'pointer',
                  fontSize: 'var(--text-sm)',
                  fontFamily: 'var(--font-sans)',
                  fontWeight: activeTab === 'settings' ? 600 : 400,
                  transition: 'color 0.15s, border-color 0.15s',
                }}
              >
                風險設定
              </button>
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
                onAutoCalcRho={handleAutoCalcRho}
                onAutoCalcRhoAndRebalance={handleAutoCalcRhoAndRebalance}
                rhoCalcCalculating={rhoCalc.calculating}
              />
            </div>

            {/* ── Tab 2：風險設定 ── */}
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
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)', color: 'var(--text)',
                      fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)',
                      padding: '3px 6px',
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
        </Tooltip.Provider>
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
  );
}
