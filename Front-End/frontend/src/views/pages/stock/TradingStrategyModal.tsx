import Modal from '../../components/Modal';
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


function fmtPrice(n: number) {
  return n.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(isoStr: string) {
  const d = new Date(isoStr);
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${m}/${day}`;
}

/** 將 price 換算成 [0, 105] 的百分比（允許略超 100 以示突破目標） */
function calcPct(price: number, lo: number, hi: number): number {
  if (hi <= lo) return 50;
  return Math.max(0, Math.min(105, (price - lo) / (hi - lo) * 100));
}

type EntryAdvice = 'can' | 'no' | 'none';

function getEntryAdvice(current: number, trigger: number): EntryAdvice {
  if (current <= 0 || trigger <= 0) return 'none';
  const ratio = (current - trigger) / trigger;
  if (ratio > 0.03) return 'no';
  if (ratio >= -0.05) return 'can';
  return 'none';
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

  // ── 進度條計算 ─────────────────────────────────────────────────────────────
  let barSection: React.ReactNode = null;
  if (strategy && strategy.stopLossPrice != null) {
    const hasTarget  = strategy.targetPrice != null;
    const lo         = strategy.stopLossPrice;
    // 無目標時，以「止損→進場價」距離的 2 倍為右邊界，給進度條留空間
    const hi         = hasTarget
      ? strategy.targetPrice!
      : strategy.triggerPrice + (strategy.triggerPrice - lo);
    const entryPct   = calcPct(strategy.triggerPrice, lo, hi);
    const curPct     = currentPrice > 0 ? calcPct(currentPrice, lo, hi) : entryPct;
    const fillPct    = Math.min(curPct, 100);
    const dotLeft    = Math.min(curPct, 103);       // 超過目標時最多顯示到 103%
    const aboveEntry = currentPrice > strategy.triggerPrice;
    const advice     = getEntryAdvice(currentPrice, strategy.triggerPrice);

    barSection = (
      <div className="ts-modal__bar-wrap">
        {/* Rail */}
        <div className="ts-modal__rail">
          <div
            className={`ts-modal__rail-fill ${aboveEntry ? 'ts-modal__rail-fill--profit' : 'ts-modal__rail-fill--risk'}`}
            style={{ width: `${fillPct}%` }}
          />
          {/* 節點：止損 */}
          <div className="ts-modal__node ts-modal__node--stop" style={{ left: '0%' }} />
          {/* 節點：進場價 */}
          <div className="ts-modal__node ts-modal__node--entry" style={{ left: `${entryPct}%` }} />
          {/* 節點：目標（有才顯示） */}
          {hasTarget && <div className="ts-modal__node ts-modal__node--target" style={{ left: '100%' }} />}
          {/* 現價指示點 */}
          {currentPrice > 0 && (
            <div className="ts-modal__dot" style={{ left: `${dotLeft}%` }} />
          )}
        </div>

        {/* 標籤列 */}
        <div className="ts-modal__bar-labels">
          {/* 止損 — 左對齊 */}
          <div className="ts-modal__label ts-modal__label--left">
            <div className="ts-modal__label-name">止損</div>
            <div className="num-value">${fmtPrice(strategy.stopLossPrice)}</div>
          </div>

          {/* 進場價 — 以 entryPct 為中心 */}
          <div
            className="ts-modal__label ts-modal__label--center"
            style={{ left: `${entryPct}%` }}
          >
            <div className="ts-modal__label-name">
              進場價
              {advice === 'can' && <span className="ts-modal__advice--can">可進場</span>}
              {advice === 'no'  && <span className="ts-modal__advice--no">不建議進場</span>}
            </div>
            <div className="num-value">${fmtPrice(strategy.triggerPrice)}</div>
          </div>

          {/* 目標 / 持有中 — 右對齊 */}
          <div className="ts-modal__label ts-modal__label--right">
            {hasTarget ? (
              <>
                <div className="ts-modal__label-name">目標</div>
                <div className="num-value">${fmtPrice(strategy.targetPrice!)}</div>
              </>
            ) : (
              <div className="ts-modal__label-name ts-modal__label-name--dim">持有中 →</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Modal open={open} size="sm" onClose={onClose} footer={footer}>
      {/* Header：代碼 + 名稱 */}
      <div className="ts-modal__header">
        <div>
          <span className="stock-code">{stockCode}</span>
          <span className="stock-name" style={{ marginLeft: 8 }}>{stockName}</span>
        </div>
      </div>

      {strategy ? (
        <>
          {/* 上方列：操作 chip + 週期 chip + 信心 ── 現價 */}
          <div className="ts-modal__bar-top">
            <div className="ts-modal__chips">
              <span className="ts-modal__chip">{TRADE_TYPE_LABEL[strategy.tradeType] ?? strategy.tradeType}</span>
              <span className="ts-modal__chip">{TIMEFRAME_LABEL[strategy.timeframe] ?? strategy.timeframe}</span>
              <span className="ts-modal__meta">信心：{CONFIDENCE_LABEL[strategy.confidence] ?? strategy.confidence}</span>
            </div>
            {currentPrice > 0 && (
              <span className="ts-modal__current-price">
                現價 <span className="num-value">${fmtPrice(currentPrice)}</span>
              </span>
            )}
          </div>

          {/* 進度條 */}
          {barSection}

          {/* AI 建議 summary */}
          <div className="ts-modal__summary">
            <div className="ts-modal__summary-label">
              <span className="ts-modal__summary-date">{fmtDate(strategy.createdAt)}</span>
              AI 建議
              {status === 'expired' && (
                <span className="ts-modal__expired-badge">建議已過期</span>
              )}
            </div>
            <p className="ts-modal__summary-text">{strategy.summary}</p>
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
