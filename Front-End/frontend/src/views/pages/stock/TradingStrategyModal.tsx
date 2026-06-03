import Modal from '../../components/Modal';
import StatusBadge from '../../components/StatusBadge';
import type { BadgeVariant } from '../../components/StatusBadge';
import Icon from '../../components/Icon';
import { computeStrategyStatus } from '../../../utils/tradingStrategy';
import type { TradingStrategyDTO, StrategyStatus } from '../../../types';
import './TradingStrategyModal.css';

export interface TradingStrategyModalProps {
  open:          boolean;
  stockCode:     string;
  stockName:     string;
  strategy:      TradingStrategyDTO | null;
  currentPrice?: number;
  onDismiss:     () => void;
  onClose:       () => void;
}

const TRADE_TYPE_LABEL: Record<string, string> = {
  entry:       '建倉',
  add:         '加碼',
  reduce:      '減碼',
  exit:        '清倉',
  stop_loss:   '止損',
  take_profit: '止盈',
  watch:       '觀察',
};

const TIMEFRAME_LABEL: Record<string, string> = {
  short:  '短線',
  medium: '中線',
  long:   '長線',
};

const CONFIDENCE_LABEL: Record<string, string> = {
  high:   '高',
  medium: '中',
  low:    '低',
};

const STATUS_VARIANT: Record<StrategyStatus, BadgeVariant> = {
  active:    'accent',
  triggered: 'up',
  expired:   'muted',
  dismissed: 'muted',
};

const STATUS_TEXT: Record<StrategyStatus, string> = {
  active:    '有效中',
  triggered: '已觸發',
  expired:   '已到期',
  dismissed: '已忽略',
};

function fmtPrice(n: number) {
  return n.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(isoStr: string) {
  const d = new Date(isoStr);
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${m}/${day}`;
}

export default function TradingStrategyModal({
  open, stockCode, stockName, strategy, currentPrice = 0, onDismiss, onClose,
}: TradingStrategyModalProps) {
  const status = strategy ? computeStrategyStatus(strategy, currentPrice) : null;
  const canDismiss = strategy != null && !strategy.dismissed && status !== 'expired' && status !== 'dismissed';

  const handleDismiss = () => {
    onDismiss();
    onClose();
  };

  const footer = (
    <div className="ts-modal__footer-actions">
      {canDismiss && (
        <button className="btn-ghost" onClick={handleDismiss}>忽略</button>
      )}
      <button className="btn-ghost btn-ghost--accent" onClick={onClose}>關閉</button>
    </div>
  );

  return (
    <Modal open={open} size="sm" onClose={onClose} footer={footer}>
      {/* Header：代碼 + 名稱 + 狀態徽章 */}
      <div className="ts-modal__header">
        <div>
          <span className="stock-code">{stockCode}</span>
          <span className="stock-name" style={{ marginLeft: 8 }}>{stockName}</span>
        </div>
        {status && (
          <StatusBadge variant={STATUS_VARIANT[status]}>
            {STATUS_TEXT[status]}
          </StatusBadge>
        )}
      </div>

      {strategy ? (
        <>
          {/* 第一列：交易類型 · 觸發價 · 時間週期 */}
          <div className="ts-modal__info-row">
            <span className="ts-modal__chip">{TRADE_TYPE_LABEL[strategy.tradeType] ?? strategy.tradeType}</span>
            <span className="ts-modal__meta">
              觸發：<span className="num-value">${fmtPrice(strategy.triggerPrice)}</span>
            </span>
            <span className="ts-modal__chip">{TIMEFRAME_LABEL[strategy.timeframe] ?? strategy.timeframe}</span>
          </div>

          {/* 第二列：信心 · 目標（有值才顯示）· 停損（有值才顯示）*/}
          <div className="ts-modal__info-row" style={{ marginTop: 6 }}>
            <span className="ts-modal__meta">信心：{CONFIDENCE_LABEL[strategy.confidence] ?? strategy.confidence}</span>
            {strategy.targetPrice != null && (
              <span className="ts-modal__meta">
                目標：<span className="num-value">${fmtPrice(strategy.targetPrice)}</span>
              </span>
            )}
            {strategy.stopLossPrice != null && (
              <span className="ts-modal__meta">
                停損：<span className="num-value">${fmtPrice(strategy.stopLossPrice)}</span>
              </span>
            )}
          </div>

          {/* AI 建議 summary */}
          <div className="ts-modal__summary">
            <div className="ts-modal__summary-label">AI 建議</div>
            <p className="ts-modal__summary-text">{strategy.summary}</p>
          </div>

          {/* Footer meta */}
          <div className="ts-modal__footer-meta">
            {currentPrice > 0 && (
              <span>參考現價 <span className="num-value">${fmtPrice(currentPrice)}</span></span>
            )}
            <span>建立 {fmtDate(strategy.createdAt)}</span>
          </div>
        </>
      ) : (
        /* 空狀態 */
        <div className="ts-modal__empty">
          <Icon name="tips_and_updates" size={32} />
          <span>尚無 AI 交易策略</span>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--dim)' }}>
            可透過 AI 助理分析後生成策略
          </span>
        </div>
      )}
    </Modal>
  );
}
