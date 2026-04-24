import { useState } from 'react';
import Modal from '../../components/Modal';
import { FormField, TextInput, NumberInput, SelectInput, RadioGroup } from '../../components/FormInputs';
import { useTransactionsViewModel, calcCostFromTransactions } from '../../../viewmodels/useTransactionsViewModel';
import { toast } from '../../components/Toast/toastStore';
import type { TransactionType } from '../../../types';

function fmt(n: number, d = 2) {
  return n.toLocaleString('zh-TW', { minimumFractionDigits: d, maximumFractionDigits: d });
}

interface FormState {
  type:   TransactionType;
  shares: string;
  price:  string;
  fee:    string;
  date:   string;
  note:   string;
}

function defaultForm(): FormState {
  return {
    type: 'buy', shares: '', price: '', fee: '20', date: new Date().toISOString().slice(0, 10), note: '',
  };
}

export interface AddTransactionModalProps {
  open:      boolean;
  stockCode: string;
  stockName: string;
  onClose:   () => void;
  onSuccess: () => void;
}

export default function AddTransactionModal({
  open, stockCode, stockName, onClose, onSuccess,
}: AddTransactionModalProps) {
  const vm = useTransactionsViewModel(stockCode);
  const [form, setForm] = useState<FormState>(defaultForm);

  function field<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  /* 即時估算 */
  const shares = Number(form.shares) || 0;
  const price  = Number(form.price)  || 0;
  const fee    = Number(form.fee)    || 0;
  const estAmount = shares * price + (form.type === 'buy' ? fee : -fee);

  /* 提交後計算新成本並寫回 */
  const handleSubmit = async () => {
    if (!shares || !price || !form.date) {
      toast.error('請填寫必填欄位（股數、成交價、日期）');
      return;
    }
    await vm.addTx(
      { stockCode, stockName, type: form.type, shares, price, fee, date: form.date, note: form.note || undefined },
      () => {
        toast.success('交易已新增，持倉成本已更新');
        setForm(defaultForm());
        onSuccess();
        onClose();
      },
    );
    if (vm.error) toast.error(vm.error);
  };

  /* 即時預覽新均價（用已載入的 tx list + 本次） */
  const previewCost = (() => {
    if (!shares || !price) return null;
    const fakeTx = { id: '__preview', stockCode, stockName, type: form.type, shares, price, fee, date: form.date, note: form.note };
    const calc = calcCostFromTransactions([...vm.items, fakeTx]);
    return calc;
  })();

  return (
    <Modal
      open={open}
      onClose={() => { setForm(defaultForm()); onClose(); }}
      title={`新增交易 — ${stockCode} ${stockName}`}
      size="sm"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn-ghost" onClick={() => { setForm(defaultForm()); onClose(); }}>取消</button>
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
            onChange={v => field('type', v as TransactionType)}
            options={[{ value: 'buy', label: '買進' }, { value: 'sell', label: '賣出' }]}
          />
        </FormField>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField label="交易日期" required>
            <TextInput
              type="date"
              value={form.date}
              onChange={e => field('date', e.target.value)}
            />
          </FormField>
          <FormField label="手續費（元）">
            <NumberInput value={form.fee} onChange={v => field('fee', v)} min={0} />
          </FormField>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField label="股數" required>
            <NumberInput value={form.shares} onChange={v => field('shares', v)} min={1} step={1} placeholder="0" />
          </FormField>
          <FormField label="成交價（元）" required>
            <NumberInput value={form.price} onChange={v => field('price', v)} min={0} step={0.01} placeholder="0.00" />
          </FormField>
        </div>

        <FormField label="備註">
          <TextInput
            value={form.note}
            onChange={e => field('note', e.target.value)}
            placeholder="選填"
          />
        </FormField>

        {/* 即時試算摘要 */}
        {shares > 0 && price > 0 && (
          <div style={{
            padding: '10px 12px',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-xs)',
            fontSize: 'var(--text-sm)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: 'var(--dim)' }}>本次{form.type === 'buy' ? '買入' : '賣出'}金額</span>
              <span className="mono" style={{ color: 'var(--text-value)' }}>
                {form.type === 'buy' ? '+' : '−'}{fmt(Math.abs(estAmount))}
              </span>
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
