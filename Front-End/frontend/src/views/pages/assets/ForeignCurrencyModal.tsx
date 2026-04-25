import { useState } from 'react';
import Modal from '../../components/Modal';
import { FormField, NumberInput, SelectInput, RadioGroup } from '../../components/FormInputs';
import { toast } from '../../components/Toast/toastStore';
import type { CurrencyCode, UpdateForeignCurrencyPayload } from '../../../types';

const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD — 美元' },
  { value: 'JPY', label: 'JPY — 日圓' },
  { value: 'EUR', label: 'EUR — 歐元' },
  { value: 'CNY', label: 'CNY — 人民幣' },
  { value: 'HKD', label: 'HKD — 港元' },
  { value: 'GBP', label: 'GBP — 英鎊' },
  { value: 'AUD', label: 'AUD — 澳幣' },
  { value: 'SGD', label: 'SGD — 新幣' },
];

const RATE_SOURCE_OPTIONS = [
  { value: 'live',   label: '即時匯率' },
  { value: 'manual', label: '手動輸入' },
];

interface FormState {
  currencyCode: string;
  amount:       string;
  rateSource:   'live' | 'manual';
  manualRate:   string;
}

function defaultForm(): FormState {
  return { currencyCode: 'USD', amount: '', rateSource: 'live', manualRate: '' };
}

export interface ForeignCurrencyModalProps {
  open:            boolean;
  existingCodes:   CurrencyCode[];
  saving:          boolean;
  onClose:         () => void;
  onSubmit:        (code: CurrencyCode, payload: UpdateForeignCurrencyPayload) => void;
}

export default function ForeignCurrencyModal({
  open, existingCodes, saving, onClose, onSubmit,
}: ForeignCurrencyModalProps) {
  const [form, setForm] = useState<FormState>(defaultForm);

  function field<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  const availableOptions = CURRENCY_OPTIONS.filter(o => !existingCodes.includes(o.value as CurrencyCode));

  const handleSubmit = () => {
    const amount = Number(form.amount);
    if (!form.currencyCode) { toast.error('請選擇幣別'); return; }
    if (!amount || amount <= 0) { toast.error('請填寫持有金額'); return; }
    if (form.rateSource === 'manual' && !Number(form.manualRate)) {
      toast.error('請填寫手動匯率'); return;
    }
    onSubmit(form.currencyCode as CurrencyCode, {
      amount,
      useManualRate: form.rateSource === 'manual',
      manualRate:    form.rateSource === 'manual' ? Number(form.manualRate) : 0,
    });
    setForm(defaultForm());
  };

  const handleClose = () => { setForm(defaultForm()); onClose(); };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="新增外幣持倉"
      size="sm"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn-ghost" onClick={handleClose}>取消</button>
          <button
            className="btn-ghost"
            style={{ borderColor: 'var(--accent-bd)', color: 'var(--accent)' }}
            disabled={saving || availableOptions.length === 0}
            onClick={handleSubmit}
          >
            {saving ? '儲存中…' : '確認新增'}
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {availableOptions.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)', textAlign: 'center' }}>
            所有支援幣別已全數加入
          </p>
        ) : (
          <>
            <FormField label="幣別" required>
              <SelectInput
                value={form.currencyCode}
                onChange={v => field('currencyCode', v)}
                options={availableOptions}
              />
            </FormField>

            <FormField label="持有金額" required>
              <NumberInput
                value={form.amount}
                onChange={v => field('amount', v)}
                min={0}
                step={1}
                placeholder="0"
              />
            </FormField>

            <FormField label="匯率來源" required>
              <RadioGroup
                name="rate-source"
                value={form.rateSource}
                onChange={v => field('rateSource', v as 'live' | 'manual')}
                options={RATE_SOURCE_OPTIONS}
              />
            </FormField>

            {form.rateSource === 'manual' && (
              <FormField label="手動匯率" required>
                <NumberInput
                  value={form.manualRate}
                  onChange={v => field('manualRate', v)}
                  min={0}
                  step={0.0001}
                  placeholder="0.0000"
                />
              </FormField>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
