import { useState } from 'react';
import Modal from '../../components/Modal';
import Icon from '../../components/Icon';
import StatusBadge from '../../components/StatusBadge';
import type { BadgeVariant } from '../../components/StatusBadge';
import { upsert as upsertStrategy, remove as removeStrategy } from '../../../models/tradingStrategyModel';
import { toast } from '../../components/Toast/toastStore';
import type { TradingStrategyDTO, StrategyAction, StrategyPriority } from '../../../types';

export interface TradingStrategyModalProps {
  open:       boolean;
  strategy:   TradingStrategyDTO | null;
  stockCode:  string;
  stockName:  string;
  onClose:    () => void;
  onUpdated?: (s: TradingStrategyDTO) => void;
  onRemoved?: (stockCode: string)     => void;
}

const ACTION_LABEL: Record<StrategyAction, string>        = { buy: '計劃買進', sell: '計劃賣出', hold: '觀察中' };
const ACTION_VARIANT: Record<StrategyAction, BadgeVariant> = { buy: 'accent',   sell: 'up',      hold: 'muted'  };
const PRIORITY_LABEL: Record<StrategyPriority, string>    = { normal: '一般',   urgent: '緊急'                  };

function fmtShares(n: number): string {
  return n.toLocaleString('zh-TW') + ' 股';
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return '–';
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

/* ── 進度條 ─────────────────────────────────────────────────── */
function ProgressBar({ target, executed }: { target: number; executed: number }) {
  const pct = target > 0 ? Math.min(100, Math.round((executed / target) * 100)) : 0;
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: 'var(--accent)', borderRadius: 3, transition: 'width 0.3s',
        }} />
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', marginTop: 4,
        fontSize: 'var(--text-xs)', color: 'var(--dim)',
      }}>
        <span>已連結交易 {fmtShares(executed)}</span>
        <span>{pct}%</span>
      </div>
    </div>
  );
}

/* ── 編輯表單 ────────────────────────────────────────────────── */
interface EditFormProps {
  stockCode: string;
  stockName: string;
  initial?:  TradingStrategyDTO | null;
  onSaved:   (s: TradingStrategyDTO) => void;
  onCancel:  () => void;
}

function EditForm({ stockCode, stockName, initial, onSaved, onCancel }: EditFormProps) {
  const [action,   setAction]   = useState<StrategyAction>(initial?.action   ?? 'buy');
  const [target,   setTarget]   = useState(initial?.targetQuantity?.toString() ?? '');
  const [priority, setPriority] = useState<StrategyPriority>(initial?.priority ?? 'normal');
  const [notes,    setNotes]    = useState(initial?.notes ?? '');
  const [saving,   setSaving]   = useState(false);

  async function handleSave() {
    const qty = parseInt(target, 10);
    if (isNaN(qty) || qty < 0) {
      toast.error('目標股數必須為非負整數');
      return;
    }
    setSaving(true);
    try {
      const updated = await upsertStrategy(stockCode, stockName, action, qty, priority, notes);
      onSaved(updated);
      toast.success('策略已儲存');
    } catch {
      toast.error('儲存失敗，請重試');
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'var(--surface)',
    border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)',
    color: 'var(--text)', padding: '7px 10px',
    fontSize: 'var(--text-sm)', boxSizing: 'border-box',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', marginBottom: 6 }}>操作方向</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['buy', 'sell', 'hold'] as StrategyAction[]).map(a => (
            <button
              key={a}
              className={`btn-ghost${action === a ? ' btn-ghost--accent' : ''}`}
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => setAction(a)}
            >
              {ACTION_LABEL[a]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--muted)', marginBottom: 6 }}>
          目標股數（股）
        </label>
        <input
          type="number" min={0} step={1}
          value={target} onChange={e => setTarget(e.target.value)}
          placeholder="0" style={inputStyle}
        />
      </div>

      <div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', marginBottom: 6 }}>優先度</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['normal', 'urgent'] as StrategyPriority[]).map(p => (
            <button
              key={p}
              className={`btn-ghost${priority === p ? ' btn-ghost--accent' : ''}`}
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => setPriority(p)}
            >
              {PRIORITY_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--muted)', marginBottom: 6 }}>
          備註 / 布局理由
        </label>
        <textarea
          value={notes} onChange={e => setNotes(e.target.value)}
          maxLength={200} rows={3}
          placeholder="選填，例：等待回調至支撐區"
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn-ghost" onClick={onCancel}>取消</button>
        <button className="btn-ghost btn-ghost--accent" disabled={saving} onClick={handleSave}>
          {saving ? '儲存中…' : '儲存策略'}
        </button>
      </div>
    </div>
  );
}

/* ── Main ───────────────────────────────────────────────────── */

export default function TradingStrategyModal({
  open, strategy, stockCode, stockName, onClose, onUpdated, onRemoved,
}: TradingStrategyModalProps) {
  const [editing,  setEditing]  = useState(false);
  const [removing, setRemoving] = useState(false);

  function handleClose() {
    setEditing(false);
    onClose();
  }

  async function handleRemove() {
    if (!strategy) return;
    setRemoving(true);
    try {
      await removeStrategy(stockCode);
      onRemoved?.(stockCode);
      toast.success('策略已刪除');
      handleClose();
    } catch {
      toast.error('刪除失敗，請重試');
    } finally {
      setRemoving(false);
    }
  }

  /* 新增 or 編輯表單 */
  if (!strategy || editing) {
    return (
      <Modal open={open} size="sm" onClose={handleClose}
        title={`${stockCode} ${stockName}｜${strategy ? '編輯策略' : '新增策略'}`}
      >
        <EditForm
          stockCode={stockCode}
          stockName={stockName}
          initial={strategy}
          onSaved={s => { onUpdated?.(s); setEditing(false); }}
          onCancel={() => strategy ? setEditing(false) : handleClose()}
        />
      </Modal>
    );
  }

  /* 詳情顯示 */
  const target      = strategy.targetQuantity;
  const executed    = strategy.executedQuantity;
  const remaining   = strategy.remainingQuantity;
  const isCompleted = target > 0 && remaining === 0;

  const footer = (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <button
        className="btn-ghost"
        style={{ color: 'var(--up)', borderColor: 'transparent' }}
        disabled={removing}
        onClick={handleRemove}
      >
        {removing ? '刪除中…' : '刪除策略'}
      </button>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-ghost" onClick={() => setEditing(true)}>
          <Icon name="edit" size={14} aria-hidden="true" /> 編輯
        </button>
        <button className="btn-ghost btn-ghost--accent" onClick={handleClose}>關閉</button>
      </div>
    </div>
  );

  return (
    <Modal open={open} size="sm" onClose={handleClose} footer={footer}
      title={`${stockCode} ${stockName}｜布局策略`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* 方向 + 優先度 + 完成狀態 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatusBadge variant={ACTION_VARIANT[strategy.action]}>
            {ACTION_LABEL[strategy.action]}
          </StatusBadge>
          {strategy.priority === 'urgent' && (
            <StatusBadge variant="up">緊急</StatusBadge>
          )}
          {isCompleted && (
            <StatusBadge variant="flat">已達標</StatusBadge>
          )}
        </div>

        {/* 目標 / 進度 */}
        {strategy.action !== 'hold' && target > 0 && (
          <div style={{
            padding: '12px 14px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-xs)',
          }}>
            <div style={{ display: 'flex', gap: 20, fontSize: 'var(--text-sm)', marginBottom: 12 }}>
              <div>
                <div style={{ color: 'var(--dim)', fontSize: 'var(--text-xs)', marginBottom: 2 }}>目標</div>
                <div className="num-value">{fmtShares(target)}</div>
              </div>
              <div>
                <div style={{ color: 'var(--dim)', fontSize: 'var(--text-xs)', marginBottom: 2 }}>剩餘</div>
                <div className="num-value" style={{ color: remaining > 0 ? 'var(--accent)' : 'var(--down)' }}>
                  {fmtShares(remaining)}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--dim)', fontSize: 'var(--text-xs)', marginBottom: 2 }}>已連結</div>
                <div className="num-value">{fmtShares(executed)}</div>
              </div>
            </div>
            <ProgressBar target={target} executed={executed} />
          </div>
        )}

        {/* 備註 */}
        {strategy.notes && (
          <div style={{
            padding: '10px 14px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-xs)',
            fontSize: 'var(--text-sm)',
            color: 'var(--text)',
            lineHeight: 1.6,
          }}>
            <span style={{ color: 'var(--dim)', fontSize: 'var(--text-xs)', display: 'block', marginBottom: 4 }}>備註</span>
            {strategy.notes}
          </div>
        )}

        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--dim)', textAlign: 'right' }}>
          更新：{fmtDate(strategy.updatedAt)}
        </div>
      </div>
    </Modal>
  );
}
