import { useState } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import Modal from '../../components/Modal';
import StatusBadge from '../../components/StatusBadge';
import type { BadgeVariant } from '../../components/StatusBadge';
import Icon from '../../components/Icon';
import { resolveStrategyStatus, ruleKey, mergeRealTimePriceStatuses } from '../../../utils/tradingStrategy';
import type { TradingStrategyDTO, StrategyTranche, TriggerRule } from '../../../types';
import './TradingStrategyModal.css';

export interface TradingStrategyModalProps {
  open:            boolean;
  strategy:        TradingStrategyDTO;
  currentPrice:    number;
  sparkline?:      number[];
  positionShares?: number;
  onDismiss:       () => void;
  onClose:         () => void;
  onConfirmRule?:  (batch: number, ruleType: string, confirmed: boolean) => void;
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

/* ── TrancheRow ── */

function TrancheRow({ tranche, tradeType, currentPrice, sparkline, onConfirmRule, defaultExpanded = false }: {
  tranche:         StrategyTranche;
  tradeType:       string;
  currentPrice:    number;
  sparkline:       number[];
  onConfirmRule?:  (batch: number, ruleType: string, confirmed: boolean) => void;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const merged = mergeRealTimePriceStatuses(tranche, currentPrice, sparkline);
  const mod =
    tranche.status === 'triggered' ? ' tsm-tranche--triggered' :
    tranche.status === 'skipped'   ? ' tsm-tranche--skipped'   : '';

  const statusVar: Record<string, BadgeVariant> = { triggered: 'down', pending: 'muted', waiting: 'muted', skipped: 'muted' };

  const rules   = tranche.triggerRules ?? [];
  const hasRules = rules.length > 0;
  const passed  = rules.filter(r => merged[ruleKey(r)] === true).length;

  function statusLabel(): string {
    if (tranche.status === 'triggered') return '已觸及';
    if (tranche.status === 'skipped')   return '已略過';
    return hasRules ? `等待中 ${passed}/${rules.length}` : '等待中';
  }

  function RuleStatus({ rule }: { rule: TriggerRule }) {
    const k   = ruleKey(rule);
    const val = k in merged ? merged[k] : undefined;
    if (val === true)  return <span className="tsm-tranche__rule-status tsm-tranche__rule-status--pass">✅ 達成</span>;
    if (val === false) return <span className="tsm-tranche__rule-status tsm-tranche__rule-status--fail">❌ 未達成</span>;
    if (rule.type === 'manual') return (
      <span className="tsm-tranche__rule-status">
        {onConfirmRule
          ? <>
              <button
                className="btn-ghost"
                style={{ fontSize: '0.78rem', padding: '2px 8px' }}
                onClick={e => { e.stopPropagation(); onConfirmRule(tranche.batch, 'manual', true); }}
              >✓ 確認達成</button>
              <button
                className="btn-ghost"
                style={{ fontSize: '0.78rem', padding: '2px 8px' }}
                onClick={e => { e.stopPropagation(); onConfirmRule(tranche.batch, 'manual', false); }}
              >✗ 未達成</button>
            </>
          : <span className="tsm-tranche__rule-status--wait">⏳ 評估中</span>
        }
      </span>
    );
    return <span className="tsm-tranche__rule-status tsm-tranche__rule-status--wait">⏳ 評估中</span>;
  }

  return (
    <div className={`tsm-tranche${mod}`}>
      <div
        className={`tsm-tranche__header${hasRules ? ' tsm-tranche__header--clickable' : ''}`}
        onClick={() => hasRules && setExpanded(v => !v)}
        role={hasRules ? 'button' : undefined}
        tabIndex={hasRules ? 0 : undefined}
        onKeyDown={hasRules ? e => e.key === 'Enter' && setExpanded(v => !v) : undefined}
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
          {hasRules && (
            <Icon
              name={expanded ? 'expand_less' : 'expand_more'}
              size={18}
              aria-hidden="true"
            />
          )}
        </div>
      </div>

      {expanded && hasRules && (
        <div className="tsm-tranche__rules">
          {tranche.triggerRules!.map((rule, i) => (
            <div key={i} className="tsm-tranche__rule">
              <span className="tsm-tranche__rule-name">{ruleDisplayName(rule)}</span>
              <RuleStatus rule={rule} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main ── */

export default function TradingStrategyModal({
  open, strategy, currentPrice, sparkline = [], onDismiss, onClose, onConfirmRule,
}: TradingStrategyModalProps) {
  const status      = resolveStrategyStatus(strategy, currentPrice);
  const tranches    = strategy.tranches ?? [];
  const hasTranches = tranches.length > 0;

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
        onClick={() => { onDismiss(); onClose(); }}
      >
        {strategy.dismissed ? '已忽略' : '忽略此策略'}
      </button>
      <button className="btn-ghost btn-ghost--accent" onClick={onClose}>關閉</button>
    </div>
  );

  return (
    <Modal open={open} size="lg" onClose={onClose} footer={footer}>

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
              status === 'triggered' ? 'down'   :
              status === 'active'    ? 'accent' : 'muted'
            }>
              {status === 'triggered' ? '已觸發' :
               status === 'active'    ? '觀察中' :
               status === 'expired'   ? '已過期' : '已忽略'}
            </StatusBadge>
          </span>
        </div>
      </div>

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
              <div
                className="tsm-price-axis__label"
                style={{ left: `${toPct(targetLow)}%`, color: 'var(--down)' }}
              >
                ${fmtAxis(targetLow)}
              </div>

              {currentPrice > 0 && (
                <>
                  <span className="tsm-price-axis__dot--current" style={{ left: `${toPct(currentPrice)}%` }}>★</span>
                  <div  className="tsm-price-axis__label--current" style={{ left: `${Math.min(toPct(currentPrice), 95)}%` }}>
                    現價<br />${fmtAxis(currentPrice)}
                  </div>
                </>
              )}
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
                    defaultExpanded={t.batch === firstPendingBatch}
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

    </Modal>
  );
}
