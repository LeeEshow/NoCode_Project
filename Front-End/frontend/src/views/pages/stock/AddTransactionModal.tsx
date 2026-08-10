import { useState, useEffect, useMemo, memo } from 'react';
import Modal from '../../components/Modal';
import { FormField, TextInput, NumberInput, RadioGroup, TextareaInput } from '../../components/FormInputs';
import { useTransactionsViewModel, calcCostFromTransactions } from '../../../viewmodels/useTransactionsViewModel';
import { toast } from '../../components/Toast/toastStore';
import type { TransactionType, TradingStrategyDTO } from '../../../types';
import './TradingStrategyModal.css';

function fmt(n: number, d = 2) {
  return n.toLocaleString('zh-TW', { minimumFractionDigits: d, maximumFractionDigits: d });
}

interface FormState {
  type:           TransactionType;
  shares:         string;
  totalAmount:    string;
  date:           string;
  note:           string;
  linkedStrategy: boolean;
}

function defaultForm(): FormState {
  return {
    type: 'buy', shares: '', totalAmount: '',
    date: new Date().toISOString().slice(0, 10),
    note: '', linkedStrategy: false,
  };
}

const RadioDot = memo(function RadioDot({ selected }: { selected: boolean }) {
  return (
    <span style={{
      display: 'inline-block', width: 14, height: 14, borderRadius: '50%',
      border: `2px solid ${selected ? 'var(--accent)' : 'var(--dim)'}`,
      background: selected ? 'var(--accent)' : 'transparent',
      flexShrink: 0, transition: 'border-color 0.15s, background 0.15s',
    }} />
  );
});

export interface AddTransactionModalProps {
  open:      boolean;
  stockCode: string;
  stockName: string;
  onClose:   () => void;
  onSuccess: () => void;
  strategy?: TradingStrategyDTO | null;
}

export default function AddTransactionModal({
  open, stockCode, stockName, onClose, onSuccess, strategy,
}: AddTransactionModalProps) {
  const vm = useTransactionsViewModel(stockCode);
  const [form, setForm] = useState<FormState>(defaultForm);

  useEffect(() => {
    if (open) {
      vm.load();
      setForm(defaultForm());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function field<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  const shares        = Number(form.shares)      || 0;
  const totalAmount   = Number(form.totalAmount) || 0;
  const pricePerShare = shares > 0 ? totalAmount / shares : 0;

  const handleClose = () => {
    setForm(defaultForm());
    onClose();
  };

  const handleSubmit = async () => {
    if (!shares || form.totalAmount === '' || !form.date) {
      toast.error('請填寫必填欄位（股數、交易金額、日期）');
      return;
    }
    const created = await vm.addTx({
      stockCode, stockName, type: form.type, shares, price: pricePerShare, fee: 0,
      date: form.date, note: form.note || undefined,
      linkedStrategy: form.linkedStrategy && form.type === 'buy',
    });
    if (!created) {
      toast.error(vm.error ?? '新增失敗，請重試');
      return;
    }
    const linkedMsg = form.linkedStrategy && form.type === 'buy' ? '，已連結至策略' : '';
    toast.success(`交易已新增${linkedMsg}，持倉成本已更新`);
    setForm(defaultForm());
    onSuccess();
    onClose();
  };

  const previewCost = useMemo(() => {
    if (!shares || form.totalAmount === '') return null;
    const fakeTx = {
      id: '__preview', stockCode, stockName, type: form.type,
      shares, price: pricePerShare, fee: 0, date: form.date, note: form.note,
    };
    return calcCostFromTransactions([...vm.items, fakeTx]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shares, form.totalAmount, form.type, form.date, form.note, pricePerShare, vm.items]);

  const hasStrategy = strategy != null;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`新增交易 — ${stockCode} ${stockName}`}
      size="sm"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn-ghost" onClick={handleClose}>取消</button>
          <button
            className="btn-ghost"
            style={{ borderColor: 'var(--accent-bd)', color: 'var(--accent)' }}
            disabled={vm.saving}
            onClick={handleSubmit}
          >
            {vm.saving ? '儲存中…' : '確認新增'}
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <FormField label="交易類型" required>
          <RadioGroup
            name="tx-type"
            value={form.type}
            onChange={v => {
              field('type', v as TransactionType);
              if (v !== 'buy') field('linkedStrategy', false);
            }}
            options={[{ value: 'buy', label: '買進' }, { value: 'sell', label: '賣出' }]}
          />
        </FormField>

        <FormField label="交易日期" required>
          <TextInput type="date" value={form.date} onChange={e => field('date', e.target.value)} />
        </FormField>

        <FormField label="交易總金額（含手續費）" required>
          <NumberInput value={form.totalAmount} onChange={v => field('totalAmount', v)} min={0} step={1} placeholder="0" />
        </FormField>

        <FormField label="股數（股）" required>
          <NumberInput value={form.shares} onChange={v => field('shares', v)} min={1} step={1} placeholder="0" />
        </FormField>

        <FormField label="備註">
          <TextareaInput
            value={form.note}
            onChange={e => field('note', e.target.value)}
            placeholder="選填"
            style={{ resize: 'vertical' }}
          />
        </FormField>

        {/* 連結策略 checkbox（僅買進 + 有策略時顯示） */}
        {hasStrategy && form.type === 'buy' && (
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
              padding: '8px 10px',
              background: form.linkedStrategy ? 'var(--accent-bg)' : 'transparent',
              border: `1px solid ${form.linkedStrategy ? 'var(--accent-bd)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-xs)',
              transition: 'background 0.12s, border-color 0.12s',
            }}
            role="checkbox"
            aria-checked={form.linkedStrategy}
            tabIndex={0}
            onClick={() => field('linkedStrategy', !form.linkedStrategy)}
            onKeyDown={e => e.key === 'Enter' && field('linkedStrategy', !form.linkedStrategy)}
          >
            <RadioDot selected={form.linkedStrategy} />
            <div>
              <div style={{ fontSize: 'var(--text-sm)', color: form.linkedStrategy ? 'var(--accent)' : 'var(--text)' }}>
                連結至布局策略
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--dim)', marginTop: 2 }}>
                計入策略執行（{strategy!.tranches.reduce((s, t) => s + (t.shares ?? 0), 0).toLocaleString('zh-TW')} 股分批計畫）
              </div>
            </div>
          </div>
        )}

        {/* 試算摘要 */}
        {shares > 0 && form.totalAmount !== '' && (
          <div style={{
            padding: '10px 12px',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-xs)',
            fontSize: 'var(--text-sm)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: 'var(--dim)' }}>每股成本（元）</span>
              <span className="mono" style={{ color: 'var(--text-value)' }}>{fmt(pricePerShare)}</span>
            </div>
            {previewCost && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: 'var(--dim)' }}>更新後均價</span>
                  <span className="mono" style={{ color: 'var(--text-value)' }}>{fmt(previewCost.costAvg)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--dim)' }}>更新後持股數</span>
                  <span className="mono" style={{ color: 'var(--text-value)' }}>{fmt(previewCost.shares, 0)}</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
