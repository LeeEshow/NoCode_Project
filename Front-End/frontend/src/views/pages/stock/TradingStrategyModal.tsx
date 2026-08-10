import Modal from '../../components/Modal';
import Icon from '../../components/Icon';
import StatusBadge from '../../components/StatusBadge';
import type { BadgeVariant } from '../../components/StatusBadge';
import { remove as removeStrategy } from '../../../models/tradingStrategyModel';
import { toast } from '../../components/Toast/toastStore';
import { resolveStrategyStatus } from '../../../utils/tradingStrategy';
import type { TradingStrategyDTO, TradeType, StrategyStatus } from '../../../types';
import { useState } from 'react';

export interface TradingStrategyModalProps {
  open:        boolean;
  strategy:    TradingStrategyDTO | null;
  stockCode:   string;
  stockName:   string;
  onClose:     () => void;
  onDismissed?: (stockCode: string) => void;
  onRemoved?:   (stockCode: string) => void;
}

const TRADE_LABEL:   Record<TradeType, string>      = { buy: '買進', sell: '賣出', hold: '觀察' };
const TRADE_VARIANT: Record<TradeType, BadgeVariant> = { buy: 'accent', sell: 'up', hold: 'muted' };

const STATUS_LABEL:   Record<StrategyStatus, string>      = {
  active:    '活躍',
  triggered: '已觸發',
  completed: '已完成',
  dismissed: '已忽略',
  expired:   '已過期',
};
const STATUS_VARIANT: Record<StrategyStatus, BadgeVariant> = {
  active:    'flat',
  triggered: 'accent',
  completed: 'down',
  dismissed: 'muted',
  expired:   'muted',
};

function fmtPrice(n: number | null | undefined): string {
  if (n == null) return '–';
  return n.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '–';
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

const TRANCHE_STATUS_LABEL: Record<string, string> = {
  pending:   '待觸發',
  triggered: '已觸發',
  executed:  '已執行',
};

export default function TradingStrategyModal({
  open, strategy, stockCode, stockName, onClose, onDismissed, onRemoved,
}: TradingStrategyModalProps) {
  const [removing, setRemoving] = useState(false);

  async function handleRemove() {
    if (!strategy) return;
    setRemoving(true);
    try {
      await removeStrategy(stockCode);
      onRemoved?.(stockCode);
      toast.success('策略已刪除');
      onClose();
    } catch {
      toast.error('刪除失敗，請重試');
    } finally {
      setRemoving(false);
    }
  }

  function handleDismiss() {
    onDismissed?.(stockCode);
    toast.success('已忽略此策略');
    onClose();
  }

  const status  = strategy ? resolveStrategyStatus(strategy) : null;
  const isDone  = status === 'dismissed' || status === 'expired' || status === 'completed';

  const footer = (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <button
        className="btn-ghost"
        style={{ color: 'var(--up)', borderColor: 'transparent' }}
        disabled={removing || !strategy}
        onClick={handleRemove}
      >
        {removing ? '刪除中…' : '刪除策略'}
      </button>
      <div style={{ display: 'flex', gap: 8 }}>
        {strategy && !isDone && (
          <button className="btn-ghost" onClick={handleDismiss}>
            忽略策略
          </button>
        )}
        <button className="btn-ghost btn-ghost--accent" onClick={onClose}>關閉</button>
      </div>
    </div>
  );

  return (
    <Modal open={open} size="md" onClose={onClose} footer={footer}
      title={`${stockCode} ${stockName}｜AI 交易策略`}
    >
      {!strategy ? (
        <div style={{ color: 'var(--dim)', fontSize: 'var(--text-sm)', padding: '16px 0' }}>
          尚無 AI 交易策略
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <StatusBadge variant={TRADE_VARIANT[strategy.tradeType]}>
              <Icon name="tips_and_updates" size={12} aria-hidden="true" />
              {' '}{TRADE_LABEL[strategy.tradeType]}
            </StatusBadge>
            {status && (
              <StatusBadge variant={STATUS_VARIANT[status]}>
                {STATUS_LABEL[status]}
              </StatusBadge>
            )}
            {strategy.confidence != null && (
              <StatusBadge variant="flat">信心 {strategy.confidence}%</StatusBadge>
            )}
            {strategy.timeframe && (
              <StatusBadge variant="muted">{strategy.timeframe}</StatusBadge>
            )}
          </div>

          {/* 摘要 */}
          {strategy.summary && (
            <div style={{
              padding: '12px 14px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-xs)',
              fontSize: 'var(--text-sm)',
              color: 'var(--text)',
              lineHeight: 1.7,
            }}>
              <div style={{ color: 'var(--dim)', fontSize: 'var(--text-xs)', marginBottom: 6 }}>
                策略摘要
              </div>
              {strategy.summary}
            </div>
          )}

          {/* 價格區塊 */}
          {(strategy.referencePrice != null || strategy.targetPriceLow != null || strategy.stopLossPrice != null) && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 1,
              background: 'var(--border)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-xs)',
              overflow: 'hidden',
            }}>
              {[
                { label: '參考價', value: fmtPrice(strategy.referencePrice) },
                {
                  label: '目標區間',
                  value: strategy.targetPriceLow != null && strategy.targetPriceHigh != null
                    ? `${fmtPrice(strategy.targetPriceLow)} – ${fmtPrice(strategy.targetPriceHigh)}`
                    : fmtPrice(strategy.targetPriceLow ?? strategy.targetPriceHigh),
                },
                { label: '止損價', value: fmtPrice(strategy.stopLossPrice) },
              ].map(({ label, value }) => (
                <div key={label} style={{
                  padding: '10px 12px',
                  background: 'var(--surface)',
                  display: 'flex', flexDirection: 'column', gap: 4,
                }}>
                  <div style={{ color: 'var(--dim)', fontSize: 'var(--text-xs)' }}>{label}</div>
                  <div className="num-value" style={{ fontSize: 'var(--text-sm)' }}>{value}</div>
                </div>
              ))}
            </div>
          )}

          {/* 風報比 */}
          {strategy.riskRewardRatio != null && (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--dim)' }}>
              風險報酬比 <span className="num-value" style={{ color: 'var(--accent)' }}>
                1 : {strategy.riskRewardRatio.toFixed(1)}
              </span>
            </div>
          )}

          {/* 觸發條件 */}
          {strategy.triggerCondition && (
            <div style={{
              padding: '10px 14px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-xs)',
            }}>
              <div style={{ color: 'var(--dim)', fontSize: 'var(--text-xs)', marginBottom: 4 }}>觸發條件</div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text)', lineHeight: 1.6 }}>
                {strategy.triggerCondition}
              </div>
            </div>
          )}

          {/* 失效條件 */}
          {strategy.invalidationCondition && (
            <div style={{
              padding: '10px 14px',
              background: 'var(--surface)',
              border: '1px solid var(--up-bd)',
              borderRadius: 'var(--radius-xs)',
            }}>
              <div style={{ color: 'var(--up)', fontSize: 'var(--text-xs)', marginBottom: 4 }}>失效條件</div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text)', lineHeight: 1.6 }}>
                {strategy.invalidationCondition}
              </div>
            </div>
          )}

          {/* 批次列表 */}
          {strategy.tranches.length > 0 && (
            <div>
              <div style={{ color: 'var(--dim)', fontSize: 'var(--text-xs)', marginBottom: 8 }}>
                分批計畫（共 {strategy.tranches.length} 批）
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {strategy.tranches.map(t => (
                  <div key={t.batch} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-xs)',
                    fontSize: 'var(--text-sm)',
                  }}>
                    <div style={{ color: 'var(--muted)' }}>批次 {t.batch}</div>
                    <div className="num-value" style={{ flex: 1, textAlign: 'center' }}>
                      {t.priceLow != null && t.priceHigh != null
                        ? `${fmtPrice(t.priceLow)} – ${fmtPrice(t.priceHigh)}`
                        : '–'}
                    </div>
                    {t.shares != null && (
                      <div className="num-value" style={{ color: 'var(--accent)', marginRight: 12 }}>
                        {t.shares.toLocaleString('zh-TW')} 股
                      </div>
                    )}
                    <StatusBadge variant={t.status === 'executed' ? 'down' : t.status === 'triggered' ? 'accent' : 'muted'}>
                      {TRANCHE_STATUS_LABEL[t.status] ?? t.status}
                    </StatusBadge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 底部：到期日 + 更新日 */}
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: 'var(--text-xs)', color: 'var(--dim)',
          }}>
            {strategy.expiresAt
              ? <span>到期：{fmtDate(strategy.expiresAt)}</span>
              : <span />
            }
            <span>更新：{fmtDate(strategy.updatedAt)}</span>
          </div>
        </div>
      )}
    </Modal>
  );
}
