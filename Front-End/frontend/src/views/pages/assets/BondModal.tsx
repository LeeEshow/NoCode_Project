import { useState, useEffect } from 'react';
import Modal from '../../components/Modal';
import { FormField, TextInput, NumberInput, SelectInput, TextareaInput } from '../../components/FormInputs';
import { toast } from '../../components/Toast/toastStore';
import type { BondDTO, CreateBondPayload } from '../../../types';

const CURRENCY_OPTIONS = [
  { value: 'TWD', label: 'TWD — 台幣' },
  { value: 'USD', label: 'USD — 美元' },
  { value: 'JPY', label: 'JPY — 日圓' },
  { value: 'EUR', label: 'EUR — 歐元' },
  { value: 'CNY', label: 'CNY — 人民幣' },
  { value: 'HKD', label: 'HKD — 港元' },
  { value: 'GBP', label: 'GBP — 英鎊' },
  { value: 'AUD', label: 'AUD — 澳幣' },
  { value: 'SGD', label: 'SGD — 新幣' },
];

interface FormState {
  name:         string;
  couponRatePct: string;  // UI 顯示百分比，submit 前 ÷100
  maturityDate: string;
  currency:     string;
  faceValue:    string;
  note:         string;
}

function defaultForm(bond?: BondDTO): FormState {
  return {
    name:          bond?.name         ?? '',
    couponRatePct: bond != null ? String(+(bond.couponRate * 100).toFixed(4)) : '',
    maturityDate:  bond?.maturityDate ?? '',
    currency:      bond?.currency     ?? 'USD',
    faceValue:     bond != null ? String(bond.faceValue) : '',
    note:          bond?.note         ?? '',
  };
}

export interface BondModalProps {
  open:     boolean;
  editBond: BondDTO | null;
  saving:   boolean;
  onClose:  () => void;
  onSubmit: (payload: CreateBondPayload, id?: string) => void;
}

export default function BondModal({ open, editBond, saving, onClose, onSubmit }: BondModalProps) {
  const [form, setForm] = useState<FormState>(() => defaultForm(editBond ?? undefined));

  useEffect(() => {
    if (open) setForm(defaultForm(editBond ?? undefined));
  }, [open, editBond]);

  function field<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  const handleSubmit = () => {
    const couponRate = Number(form.couponRatePct) / 100;
    const faceValue  = Number(form.faceValue);
    if (!form.name.trim())        { toast.error('請填寫債券名稱'); return; }
    if (!form.couponRatePct || isNaN(couponRate)) { toast.error('請填寫票面利率'); return; }
    if (!form.maturityDate)       { toast.error('請填寫到期日'); return; }
    if (!faceValue || faceValue <= 0) { toast.error('請填寫持有面額'); return; }

    const payload: CreateBondPayload = {
      name:         form.name.trim(),
      couponRate,
      maturityDate: form.maturityDate,
      currency:     form.currency,
      faceValue,
      note:         form.note.trim() || undefined,
    };

    onSubmit(payload, editBond?.id);
  };

  const handleClose = () => { setForm(defaultForm()); onClose(); };
  const isEdit = !!editBond;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={isEdit ? '編輯債券' : '新增債券'}
      size="sm"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn-ghost" onClick={handleClose}>取消</button>
          <button
            className="btn-ghost"
            style={{ borderColor: 'var(--accent-bd)', color: 'var(--accent)' }}
            disabled={saving}
            onClick={handleSubmit}
          >
            {saving ? '儲存中…' : (isEdit ? '確認修改' : '確認新增')}
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <FormField label="債券名稱" required>
          <TextInput
            value={form.name}
            onChange={e => field('name', e.target.value)}
            placeholder="例：美國10年期公債"
          />
        </FormField>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField label="票面利率（%）" required>
            <NumberInput
              value={form.couponRatePct}
              onChange={v => field('couponRatePct', v)}
              min={0}
              step={0.01}
              placeholder="4.50"
            />
          </FormField>
          <FormField label="到期日" required>
            <TextInput
              type="date"
              value={form.maturityDate}
              onChange={e => field('maturityDate', e.target.value)}
            />
          </FormField>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField label="幣別" required>
            <SelectInput
              value={form.currency}
              onChange={v => field('currency', v)}
              options={CURRENCY_OPTIONS}
            />
          </FormField>
          <FormField label="持有面額" required>
            <NumberInput
              value={form.faceValue}
              onChange={v => field('faceValue', v)}
              min={0}
              step={1000}
              placeholder="0"
            />
          </FormField>
        </div>

        <FormField label="備註">
          <TextareaInput
            value={form.note}
            onChange={e => field('note', e.target.value)}
            placeholder="選填"
            style={{ height: 80, resize: 'vertical' }}
          />
        </FormField>
      </div>
    </Modal>
  );
}
