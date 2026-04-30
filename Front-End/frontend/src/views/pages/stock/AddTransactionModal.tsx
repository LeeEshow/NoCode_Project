import { useState, useEffect } from 'react';
import Modal from '../../components/Modal';
import { FormField, TextInput, NumberInput, SelectInput, RadioGroup, TextareaInput } from '../../components/FormInputs';
import { useTransactionsViewModel, calcCostFromTransactions } from '../../../viewmodels/useTransactionsViewModel';
import { toast } from '../../components/Toast/toastStore';
import type { TransactionType } from '../../../types';

function fmt(n: number, d = 2) {
  return n.toLocaleString('zh-TW', { minimumFractionDigits: d, maximumFractionDigits: d });
}

interface FormState {
  type:        TransactionType;
  shares:      string;
  totalAmount: string;
  date:        string;
  note:        string;
}

function defaultForm(): FormState {
  return {
    type: 'buy', shares: '', totalAmount: '', date: new Date().toISOString().slice(0, 10), note: '',
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

  /* Modal 開啟時載入歷史交易，供均價預覽使用 */
  useEffect(() => {
    if (open) vm.load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function field<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  const shares      = Number(form.shares)      || 0;
  const totalAmount = Number(form.totalAmount) || 0;
  const pricePerShare = shares > 0 ? totalAmount / shares : 0;

  /* 提交後計算新成本並寫回 */
  const handleSubmit = async () => {
    if (!shares || form.totalAmount === '' || !form.date) {
      toast.error('請填寫必填欄位（股數、交易金額、日期）');
      return;
    }
    await vm.addTx(
      { stockCode, stockName, type: form.type, shares, price: pricePerShare, fee: 0, date: form.date, note: form.note || undefined },
      () => {
        toast.success('交易已新增，持倉成本已更新');
        setForm(defaultForm());
        onSuccess();
        onClose();
      },
    );
    if (vm.error) toast.error(vm.error);
  };

  /* 即時預覽新均價 */
  const previewCost = (() => {
    if (!shares || form.totalAmount === '') return null;
    const fakeTx = { id: '__preview', stockCode, stockName, type: form.type, shares, price: pricePerShare, fee: 0, date: form.date, note: form.note };
    return calcCostFromTransactions([...vm.items, fakeTx]);
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

        <FormField label="交易日期" required>
          <TextInput
            type="date"
            value={form.date}
            onChange={e => field('date', e.target.value)}
          />
        </FormField>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField label="交易總金額（含手續費）" required>
            <NumberInput value={form.totalAmount} onChange={v => field('totalAmount', v)} min={0} step={1} placeholder="0" />
          </FormField>
          <FormField label="股數（股）" required>
            <NumberInput value={form.shares} onChange={v => field('shares', v)} min={1} step={1} placeholder="0" />
          </FormField>
        </div>

        <FormField label="備註">
          <TextareaInput
            value={form.note}
            onChange={e => field('note', e.target.value)}
            placeholder="選填"
            style={{ resize: 'vertical' }}
          />
        </FormField>

        {/* 即時試算摘要 */}
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
