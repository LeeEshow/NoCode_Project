import { useState } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import Modal from '../../components/Modal';
import StatusBadge from '../../components/StatusBadge';
import type { BadgeVariant } from '../../components/StatusBadge';
import Icon from '../../components/Icon';
import { resolveStrategyStatus, ruleKey, mergeRealTimePriceStatuses, analyzeDirectionConflict, resolveStrategyDirection } from '../../../utils/tradingStrategy';
import type { TradingStrategyDTO, StrategyTranche, TriggerRule, RebalanceSuggestion, MarketState } from '../../../types';
import './TradingStrategyModal.css';

export interface TradingStrategyModalProps {
  open:              boolean;
  strategy:          TradingStrategyDTO | null;
  currentPrice:      number;
  sparkline?:        number[];
  positionShares?:   number;
  onDismiss?:        () => void;
  onClose:           () => void;
  onConfirmRule?:    (batch: number, ruleType: string, confirmed: boolean) => void;
  onAddExecution?:   (batch: number, executedPrice: number, executedShares: number) => void;
  suggestion?:       RebalanceSuggestion;
  marketStateAuto?:  MarketState | null;
}

/* ── helpers ── */

function fmtPrice(n: number | null | undefined, dec = 2): string {
  if (n == null) return '–';
  return n.toLocaleString('zh-TW', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function clampPct(v: number): number {
  return Math.max(0, Math.min(100, v));
}

/* Badge 映射 */
const TRADE_TEXT: Record<string, string> = {
  entry: '買進', add: '加碼', reduce: '減碼', exit: '出場',
  stop_loss: '止損', take_profit: '止盈', watch: '觀察',
  buy: '買進', sell: '賣出',
};
const TRADE_VAR: Record<string, BadgeVariant> = {
  entry: 'accent', add: 'accent', reduce: 'up', exit: 'up',
  stop_loss: 'up', take_profit: 'down', watch: 'muted',
  buy: 'accent', sell: 'up',
};
function tfText(tf: string): string {
  if (tf === 'short')  return '短期';
  if (tf === 'medium') return '中期';
  if (tf === 'long')   return '長期';
  /* 後端可能送 "1-2週 (…)" 或 "3-6月" 等自然語言格式 */
  if (tf.includes('週') || tf.toLowerCase().includes('week'))  return '短期';
  if (tf.includes('月') || tf.toLowerCase().includes('month')) return '中期';
  if (tf.includes('年') || tf.toLowerCase().includes('year'))  return '長期';
  return tf;
}
function tfVar(tf: string): BadgeVariant {
  const label = tfText(tf);
  if (label === '短期') return 'accent';
  if (label === '中期') return 'flat';
  return 'muted';
}

function confText(c: string): string {
  if (c === 'high')   return '高信心';
  if (c === 'medium') return '中信心';
  if (c === 'low')    return '低信心';
  const n = parseFloat(c);
  if (!isNaN(n)) return n >= 0.7 ? '高信心' : n >= 0.4 ? '中信心' : '低信心';
  return c;
}
function confVar(c: string): BadgeVariant {
  if (c === 'high')   return 'down';
  if (c === 'medium') return 'flat';
  if (c === 'low')    return 'muted';
  const n = parseFloat(c);
  if (!isNaN(n)) return n >= 0.7 ? 'down' : n >= 0.4 ? 'flat' : 'muted';
  return 'muted';
}

function fmtExecDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function fmtAxis(n: number | null | undefined): string {
  if (n == null) return '–';
  return n.toLocaleString('zh-TW', {
    minimumFractionDigits: 0,
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  });
}

function ruleDisplayName(rule: TriggerRule): string {
  switch (rule.type) {
    case 'price_in_range':   return '現價落入區間';
    case 'price_above':      return rule.value  != null ? `現價 > $${rule.value}`   : '現價突破';
    case 'price_below':      return rule.value  != null ? `現價 < $${rule.value}`   : '現價跌破';
    case 'price_above_ma':   return rule.period != null ? `站穩 MA${rule.period}`   : '站穩均線';
    case 'chip_dealer_buy':  return rule.period != null ? `自營商連買 ${rule.period} 日` : '自營商連買';
    case 'chip_foreign_buy': return rule.period != null ? `外資連買 ${rule.period} 日`   : '外資連買';
    case 'chip_trust_buy':   return rule.period != null ? `投信連買 ${rule.period} 日`   : '投信連買';
    case 'manual':           return '需人工確認';
    default:                 return rule.type;
  }
}

/* ── RuleStatus ── */

interface RuleStatusProps {
  rule:           TriggerRule;
  merged:         Record<string, boolean | null>;
  tranche:        StrategyTranche;
  onConfirmRule?: (batch: number, ruleType: string, confirmed: boolean) => void;
}

function RuleStatus({ rule, merged, tranche, onConfirmRule }: RuleStatusProps) {
  const k   = ruleKey(rule);
  const val = k in merged ? merged[k] : undefined;
  if (val === true)  return <span className="tsm-tranche__rule-status tsm-tranche__rule-status--pass"><Icon name="check_circle" size={14} aria-hidden="true" /> 達成</span>;
  if (val === false) return <span className="tsm-tranche__rule-status tsm-tranche__rule-status--fail"><Icon name="cancel" size={14} aria-hidden="true" /> 未達成</span>;
  if (rule.type === 'manual') return (
    <span className="tsm-tranche__rule-status">
      {onConfirmRule
        ? <>
            <button
              className="btn-ghost"
              style={{ fontSize: '0.78rem', padding: '2px 8px' }}
              onClick={e => { e.stopPropagation(); onConfirmRule(tranche.batch, 'manual', true); }}
            ><Icon name="check" size={14} aria-hidden="true" /> 確認達成</button>
            <button
              className="btn-ghost"
              style={{ fontSize: '0.78rem', padding: '2px 8px' }}
              onClick={e => { e.stopPropagation(); onConfirmRule(tranche.batch, 'manual', false); }}
            ><Icon name="close" size={14} aria-hidden="true" /> 未達成</button>
          </>
        : <span className="tsm-tranche__rule-status--wait"><Icon name="schedule" size={14} aria-hidden="true" /> 評估中</span>
      }
    </span>
  );
  return <span className="tsm-tranche__rule-status tsm-tranche__rule-status--wait"><Icon name="schedule" size={14} aria-hidden="true" /> 評估中</span>;
}

/* ── TrancheRow ── */

function TrancheRow({ tranche, tradeType, currentPrice, sparkline, onConfirmRule, onAddExecution, defaultExpanded = false, storageKey }: {
  tranche:          StrategyTranche;
  tradeType:        string;
  currentPrice:     number;
  sparkline:        number[];
  onConfirmRule?:   (batch: number, ruleType: string, confirmed: boolean) => void;
  onAddExecution?:  (batch: number, executedPrice: number, executedShares: number) => void;
  defaultExpanded?: boolean;
  storageKey:       string;
}) {
  const [expanded, setExpanded] = useState(() => {
    try {
      const v = localStorage.getItem(storageKey);
      if (v !== null) return v === 'true';
    } catch {}
    return defaultExpanded;
  });
  const [showExecForm, setShowExecForm] = useState(false);
  const [execPrice, setExecPrice]       = useState(0);
  const [execShares, setExecShares]     = useState(0);

  function toggleExpanded() {
    const next = !expanded;
    setExpanded(next);
    try { localStorage.setItem(storageKey, String(next)); } catch {}
  }

  function openExecForm() {
    setExecPrice(currentPrice > 0 ? currentPrice : tranche.priceHigh);
    setExecShares(tranche.shares);
    setShowExecForm(true);
  }

  function handleSubmitExecution() {
    if (execPrice <= 0 || execShares <= 0) return;
    onAddExecution!(tranche.batch, execPrice, execShares);
    setShowExecForm(false);
  }

  const merged   = mergeRealTimePriceStatuses(tranche, currentPrice, sparkline);
  const isSkipped  = tranche.status === 'skipped';
  const isExecuted = tranche.status === 'executed';
  const mod = isSkipped ? ' tsm-tranche--skipped' : isExecuted ? ' tsm-tranche--executed' : '';

  const statusVar: Record<string, BadgeVariant> = {
    triggered: 'down', pending: 'muted', waiting: 'muted', skipped: 'muted', executed: 'flat',
  };

  const rules    = tranche.triggerRules ?? [];
  const hasRules = rules.length > 0;
  const passed   = rules.filter(r => merged[ruleKey(r)] === true).length;

  function statusLabel(): string {
    if (tranche.status === 'triggered') return '已觸及';
    if (tranche.status === 'skipped')   return '已略過';
    if (tranche.status === 'executed')  return '已執行';
    return hasRules ? `等待中 ${passed}/${rules.length}` : '等待中';
  }

  // 累計計算（runtime，不存 Firestore）
  const executions  = tranche.executions ?? [];
  const totalShares = executions.reduce((s, e) => s + e.executedShares, 0);
  const avgPrice    = totalShares > 0
    ? executions.reduce((s, e) => s + e.executedPrice * e.executedShares, 0) / totalShares
    : 0;
  const pctDone = tranche.shares > 0 ? (totalShares / tranche.shares) * 100 : 0;

  const headerClickable = hasRules;

  return (
    <div className={`tsm-tranche${mod}${expanded ? ' tsm-tranche--open' : ''}`}>
      <div
        className={`tsm-tranche__header${headerClickable ? ' tsm-tranche__header--clickable' : ''}`}
        onClick={() => headerClickable && toggleExpanded()}
        role={headerClickable ? 'button' : undefined}
        tabIndex={headerClickable ? 0 : undefined}
        onKeyDown={headerClickable ? e => e.key === 'Enter' && toggleExpanded() : undefined}
      >
        <div className="tsm-tranche__title-group">
          <span className="tsm-tranche__num">第 {tranche.batch} 批</span>
          <StatusBadge variant={TRADE_VAR[tradeType] ?? 'accent'}>
            {TRADE_TEXT[tradeType] ?? tradeType}
          </StatusBadge>
          <span className="tsm-tranche__range num-value">
            ${fmtAxis(tranche.priceLow)} – {fmtAxis(tranche.priceHigh)}
          </span>
          <span className="tsm-tranche__size">{tranche.shares} 股</span>
        </div>
        <div className="tsm-tranche__header-right">
          <StatusBadge variant={statusVar[tranche.status] ?? 'muted'}>
            {statusLabel()}
          </StatusBadge>
          {!['pending', 'waiting', 'skipped'].includes(tranche.status) && onAddExecution && !showExecForm && (
            <button
              className="btn-ghost tsm-tranche__exec-btn"
              onClick={e => { e.stopPropagation(); openExecForm(); }}
              aria-label={isExecuted ? '新增執行紀錄' : '手動標記執行'}
            >
              <Icon name="play_arrow" size={14} aria-hidden="true" />
              {isExecuted ? '新增執行' : '手動標記執行'}
            </button>
          )}
          {hasRules && (
            <Icon
              name={expanded ? 'expand_less' : 'expand_more'}
              size={18}
              aria-hidden="true"
            />
          )}
        </div>
      </div>

      {/* 觸發規則 */}
      {expanded && hasRules && (
        <div className="tsm-tranche__rules">
          {tranche.triggerRules!.map((rule, i) => (
            <div key={i} className="tsm-tranche__rule">
              <span className="tsm-tranche__rule-name">{ruleDisplayName(rule)}</span>
              <RuleStatus rule={rule} merged={merged} tranche={tranche} onConfirmRule={onConfirmRule} />
            </div>
          ))}
        </div>
      )}

      {/* 手動標記執行表單 */}
      {showExecForm && (
        <div className="tsm-tranche__exec-form">
          <div className="tsm-tranche__exec-form-row">
            <label className="tsm-tranche__exec-form-label">成交均價</label>
            <input
              type="number"
              className="tsm-tranche__exec-form-input"
              value={execPrice}
              min={0.01}
              step={0.01}
              onChange={e => setExecPrice(parseFloat(e.target.value) || 0)}
            />
            <label className="tsm-tranche__exec-form-label">股數</label>
            <input
              type="number"
              className="tsm-tranche__exec-form-input"
              value={execShares}
              min={1}
              step={1}
              onChange={e => setExecShares(parseInt(e.target.value, 10) || 0)}
            />
          </div>
          <div className="tsm-tranche__exec-form-actions">
            <button
              className="btn-ghost btn-ghost--accent"
              disabled={execPrice <= 0 || execShares <= 0}
              onClick={handleSubmitExecution}
            >
              <Icon name="check" size={14} aria-hidden="true" /> 確認執行
            </button>
            <button className="btn-ghost" onClick={() => setShowExecForm(false)}>取消</button>
          </div>
        </div>
      )}

      {/* 已執行列表 */}
      {isExecuted && executions.length > 0 && (
        <div className="tsm-tranche__exec-list">
          {executions.map((e, i) => (
            <div key={i} className="tsm-tranche__exec-item">
              <span className="tsm-tranche__exec-item-date">{fmtExecDate(e.executedAt)}</span>
              <span className="tsm-tranche__exec-item-shares">{e.executedShares.toLocaleString('zh-TW')} 股</span>
              <span className="tsm-tranche__exec-item-price">@ {fmtPrice(e.executedPrice)}</span>
              {e.transactionId && (
                <span className="tsm-tranche__exec-item-txn">→ #{e.transactionId}</span>
              )}
            </div>
          ))}
          <div className="tsm-tranche__exec-summary">
            <span className="tsm-tranche__exec-summary-item">
              <span className="tsm-tranche__exec-summary-label">累計</span>
              <span className="num-value">{totalShares.toLocaleString('zh-TW')} 股</span>
            </span>
            <span className="tsm-tranche__exec-summary-item">
              <span className="tsm-tranche__exec-summary-label">均價</span>
              <span className="num-value">{fmtPrice(avgPrice)}</span>
            </span>
            {tranche.shares > 0 && (
              <span className="tsm-tranche__exec-summary-item">
                <span className="tsm-tranche__exec-summary-label">目標達成</span>
                <span className="num-value">{pctDone.toFixed(0)}%</span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main ── */

export default function TradingStrategyModal({
  open, strategy, currentPrice, sparkline = [], onDismiss, onClose, onConfirmRule, onAddExecution, suggestion, marketStateAuto,
}: TradingStrategyModalProps) {
  if (!strategy) {
    return (
      <Modal open={open} size="lg" className="tsm-modal" onClose={onClose}
        footer={
          <div className="tsm-footer">
            <button className="btn-ghost btn-ghost--accent" onClick={onClose}>關閉</button>
          </div>
        }
      >
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--dim)' }}>
          <Icon name="tips_and_updates" size={40} aria-hidden="true" />
          <div style={{ marginTop: 12, fontSize: 'var(--text-sm)' }}>目前尚無 AI 交易策略</div>
        </div>
      </Modal>
    );
  }

  const status      = resolveStrategyStatus(strategy, currentPrice);
  const tranches    = strategy.tranches ?? [];
  const hasTranches = tranches.length > 0;
  const conflict    = analyzeDirectionConflict(strategy, suggestion);

  const shouldWarnMacro =
    marketStateAuto === 'risk-off' &&
    resolveStrategyDirection(strategy.tradeType) === 'buy' &&
    status !== 'completed' &&
    status !== 'dismissed' &&
    status !== 'expired';

  /* Price axis geometry：右端 = 停利下限，若現價超出則以現價為右端 */
  const hasPriceData = strategy.stopLossPrice != null
    && strategy.targetPriceLow != null;
  const stopLoss  = strategy.stopLossPrice  ?? 0;
  const targetLow = strategy.targetPriceLow ?? 0;
  const axisRight = currentPrice > 0 && currentPrice > targetLow ? currentPrice : targetLow;
  const axisRange = axisRight - stopLoss;
  const toPct     = (p: number) =>
    axisRange > 0 ? clampPct((p - stopLoss) / axisRange * 100) : 50;

  const canDismiss = !strategy.dismissed && status !== 'expired' && status !== 'dismissed';

  const footer = (
    <div className="tsm-footer">
      <button
        className="btn-ghost"
        disabled={!canDismiss}
        onClick={() => { onDismiss?.(); onClose(); }}
      >
        {strategy.dismissed ? '已忽略' : '忽略此策略'}
      </button>
      <button className="btn-ghost btn-ghost--accent" onClick={onClose}>關閉</button>
    </div>
  );

  return (
    <Modal open={open} size="lg" className="tsm-modal" onClose={onClose} footer={footer}>

      {/* ── 1. 策略標頭 ── */}
      <div className="tsm-header">
        <div className="tsm-header__left">
          <div className="tsm-header__title">
            <span className="tsm-header__code">{strategy.stockCode}</span>
            <span className="tsm-header__name">{strategy.stockName}</span>
          </div>
          <div className="tsm-header__meta">
            均成本 ${fmtPrice(strategy.referencePrice)}
            &nbsp;·&nbsp;建立 {fmtDate(strategy.createdAt)}
            {strategy.expiresAt && <>&nbsp;·&nbsp;到期 {fmtDate(strategy.expiresAt)}</>}
            {strategy.riskRewardRatio != null && <>&nbsp;·&nbsp;R:R&nbsp;<span className="num-value">1:{strategy.riskRewardRatio.toFixed(1)}</span></>}
          </div>
        </div>
        <div className="tsm-header__badges">
          <StatusBadge variant={TRADE_VAR[strategy.tradeType] ?? 'accent'}>
            {TRADE_TEXT[strategy.tradeType] ?? strategy.tradeType}
          </StatusBadge>
          <StatusBadge variant={confVar(strategy.confidence)}>
            {confText(strategy.confidence)}
          </StatusBadge>
          <StatusBadge variant={tfVar(strategy.timeframe)}>
            {tfText(strategy.timeframe)}
          </StatusBadge>
          <span style={{ marginLeft: 8 }}>
            <StatusBadge variant={
              status === 'triggered'  ? 'down'   :
              status === 'completed'  ? 'flat'   :
              status === 'active'     ? 'accent' : 'muted'
            }>
              {status === 'triggered'  ? '已觸發' :
               status === 'completed'  ? '已完成' :
               status === 'active'     ? '觀察中' :
               status === 'expired'    ? '已過期' : '已忽略'}
            </StatusBadge>
          </span>
          {conflict.hasConflict && (
            <StatusBadge variant="up">
              <Icon name="warning" size={13} aria-hidden="true" />
              &nbsp;方向衝突
            </StatusBadge>
          )}
        </div>
      </div>

      {/* ── 1.5 Risk-Off 環境警示 ── */}
      {shouldWarnMacro && (
        <div className="tsm-macro-warn">
          <span className="tsm-macro-warn__icon"><Icon name="warning" size={16} aria-hidden="true" /></span>
          <div>
            <div className="tsm-macro-warn__title">當前市場狀態為 Risk-Off</div>
            <div className="tsm-macro-warn__desc">
              買入型策略在高波動環境下建議縮小批次、延後執行，或等待 VIX / 市場狀態回到中性。
            </div>
          </div>
        </div>
      )}

      {/* ── 2. 價格座標軸 ── */}
      {hasPriceData && (
        <Tooltip.Provider delayDuration={200}>
          <div className="tsm-price-axis">
            <div className="tsm-price-axis__stop">
              停損<br />${fmtAxis(stopLoss)}
            </div>

            <div className="tsm-price-axis__track-wrap">
              <div className="tsm-price-axis__line" />

              {currentPrice > 0 && axisRange > 0 && (
                <div
                  className="tsm-price-axis__fill"
                  style={{ width: `${toPct(currentPrice)}%` }}
                />
              )}

              {tranches.map(t => {
                const leftPct  = toPct(t.priceLow);
                const rightPct = toPct(t.priceHigh);
                return (
                  <Tooltip.Root key={`band-${t.batch}`}>
                    <Tooltip.Trigger asChild>
                      <div
                        className="tsm-price-axis__band"
                        style={{
                          left:   `${leftPct}%`,
                          width:  `${Math.max(rightPct - leftPct, 0.5)}%`,
                          cursor: 'default',
                        }}
                      />
                    </Tooltip.Trigger>
                    <Tooltip.Portal>
                      <Tooltip.Content
                        sideOffset={10}
                        className="ft-tooltip ft-tooltip--nowrap"
                      >
                        第{t.batch}批&nbsp;
                        <span className="num-value">
                          ${fmtAxis(t.priceLow)}&nbsp;–&nbsp;{fmtAxis(t.priceHigh)}
                        </span>
                        <Tooltip.Arrow className="ft-tooltip__arrow" />
                      </Tooltip.Content>
                    </Tooltip.Portal>
                  </Tooltip.Root>
                );
              })}

              <div className="tsm-price-axis__dot tsm-price-axis__dot--stop"   style={{ left: '0%' }} />
              <div className="tsm-price-axis__dot tsm-price-axis__dot--target" style={{ left: `${toPct(targetLow)}%` }} />

              {currentPrice > 0 && (
                <>
                  <span className="tsm-price-axis__dot--current" style={{ left: `${toPct(currentPrice)}%` }} />
                  <div  className="tsm-price-axis__label--current" style={{ left: `${Math.min(toPct(currentPrice), 95)}%` }}>
                    現價<br />${fmtAxis(currentPrice)}
                  </div>
                </>
              )}
            </div>

            <div className="tsm-price-axis__target">
              目標下限<br />${fmtAxis(targetLow)}
            </div>
          </div>
        </Tooltip.Provider>
      )}

      {/* ── 3. 狀態摘要 + 進場批次 ── */}
      {(hasTranches || strategy.triggerPrice != null) && (
        <div className="tsm-tranches">

          {hasTranches
            ? (() => {
                const sorted = [...tranches].sort((a, b) => a.batch - b.batch);
                const firstPendingBatch = sorted.find(
                  t => t.status === 'pending' || t.status === 'waiting'
                )?.batch ?? -1;
                return sorted.map(t => (
                  <TrancheRow
                    key={t.batch}
                    tranche={t}
                    tradeType={strategy.tradeType}
                    currentPrice={currentPrice}
                    sparkline={sparkline}
                    onConfirmRule={onConfirmRule}
                    onAddExecution={onAddExecution}
                    defaultExpanded={t.batch === firstPendingBatch}
                    storageKey={`tsm-exp-${strategy.stockCode}-${t.batch}`}
                  />
                ));
              })()
            : (
                /* 舊資料 fallback */
                <div className="tsm-tranche">
                  <div className="tsm-tranche__header">
                    <span className="tsm-tranche__num">進場</span>
                    <span className="tsm-tranche__range num-value">${fmtPrice(strategy.triggerPrice)}</span>
                  </div>
                </div>
              )
          }
        </div>
      )}

      {/* ── 4. AI 綜合建議 ── */}
      {strategy.summary && (
        <div className="tsm-summary">
          <span className="tsm-summary__label">AI建議：</span>
          {strategy.summary}
        </div>
      )}

      {/* ── 5. 再平衡建議 + 方向衝突（合併區塊）── */}
      {strategy.summary && suggestion && suggestion.action !== 'hold' && suggestion.shares > 0 && (
        <div className="tsm-section-divider" />
      )}
      {suggestion && suggestion.action !== 'hold' && suggestion.shares > 0 && (
        <div className={`tsm-insight${conflict.severity !== 'none' ? ` tsm-insight--${conflict.severity}` : ''}`}>
          <div className="tsm-insight__rebalance">
            <span className="tsm-rebalance__label">再平衡建議</span>
            <span className="tsm-rebalance__action" style={{
              color: suggestion.action === 'sell' ? 'var(--up)' : 'var(--accent)',
            }}>
              {suggestion.action === 'sell' ? '減碼' : '加碼'}&nbsp;
              {suggestion.shares.toLocaleString('zh-TW')} 股
            </span>
            <span className="tsm-rebalance__amount">
              約 NT${Math.round(suggestion.estimatedAmount).toLocaleString('zh-TW')}
            </span>
            {suggestion.efficiencyLabel && (
              <span className="tsm-rebalance__efficiency">
                {suggestion.efficiencyLabel}
              </span>
            )}
          </div>
          {conflict.severity !== 'none' && (
            <>
              <div className="tsm-conflict__title">
                {conflict.severity === 'warning' && <Icon name="warning" size={15} aria-hidden="true" />}
                {conflict.title}
              </div>
              <div className="tsm-conflict__desc">{conflict.description}</div>
              <div className="tsm-conflict__hint">{conflict.suggestion}</div>
            </>
          )}
        </div>
      )}

    </Modal>
  );
}
