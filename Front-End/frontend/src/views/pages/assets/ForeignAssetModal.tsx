import { useState, useEffect } from 'react';
import Modal from '../../components/Modal';
import { FormField, TextInput, NumberInput, SelectInput } from '../../components/FormInputs';
import { toast } from '../../components/Toast/toastStore';
import type { ForeignAssetDTO, ForeignAssetType, CreateForeignAssetPayload } from '../../../types';

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

const TYPE_OPTIONS: { value: ForeignAssetType; label: string }[] = [
  { value: '活存', label: '活存（無到期日）' },
  { value: '定存', label: '定存（有到期日）' },
  { value: '債券', label: '債券' },
];

interface FormState {
  type:          ForeignAssetType;
  name:          string;
  currency:      string;
  amount:        string;
  interestRatePct: string;
  maturityDate:  string;
  useManualRate: boolean;
  manualRate:    string;
}

function defaultForm(item?: ForeignAssetDTO): FormState {
  return {
    type:            item?.type          ?? '活存',
    name:            item?.name          ?? '',
    currency:        item?.currency      ?? 'USD',
    amount:          item != null ? String(item.amount) : '',
    interestRatePct: item != null ? String(+(item.interestRate * 100).toFixed(4)) : '',
    maturityDate:    item?.maturityDate  ?? '',
    useManualRate:   item?.useManualRate ?? false,
    manualRate:      item != null ? String(item.manualRate) : '',
  };
}

export interface ForeignAssetModalProps {
  open:     boolean;
  editItem: ForeignAssetDTO | null;
  saving:   boolean;
  onClose:  () => void;
  onSubmit: (payload: CreateForeignAssetPayload, id?: string) => void;
}

export default function ForeignAssetModal({
  open, editItem, saving, onClose, onSubmit,
}: ForeignAssetModalProps) {
  const [form, setForm] = useState<FormState>(() => defaultForm(editItem ?? undefined));

  useEffect(() => {
    if (open) setForm(defaultForm(editItem ?? undefined));
  }, [open, editItem]);

  function field<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  const needsMaturity = form.type === '定存' || form.type === '債券';
  const needsName     = form.type === '債券';

  const handleSubmit = () => {
    const amount      = parseFloat(form.amount);
    const interestRate = parseFloat(form.interestRatePct) / 100;
    const manualRate  = parseFloat(form.manualRate);

    if (!form.currency)                  { toast.error('請選擇幣別'); return; }
    if (isNaN(amount) || amount <= 0)    { toast.error('請填寫持有金額'); return; }
    if (isNaN(interestRate))             { toast.error('請填寫年利率（可填 0）'); return; }
    if (needsMaturity && !form.maturityDate) { toast.error('請填寫到期日'); return; }
    if (needsName && !form.name.trim())  { toast.error('請填寫債券名稱'); return; }
    if (form.useManualRate && (isNaN(manualRate) || manualRate <= 0)) {
      toast.error('請填寫手動匯率'); return;
    }

    const payload: CreateForeignAssetPayload = {
      type:          form.type,
      name:          form.name.trim(),
      currency:      form.currency,
      amount,
      interestRate,
      maturityDate:  needsMaturity ? form.maturityDate : null,
      useManualRate: form.useManualRate,
      manualRate:    form.useManualRate ? manualRate : 0,
    };

    onSubmit(payload, editItem?.id);
  };

  const handleClose = () => { setForm(defaultForm()); onClose(); };
  const isEdit = !!editItem;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={isEdit ? '編輯外幣資產' : '新增外幣資產'}
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

        {/* 類型 */}
        <FormField label="資產類型" required>
          <div style={{ display: 'flex', gap: 8 }}>
            {TYPE_OPTIONS.map(opt => (
              <label
                key={opt.value}
                className={`fa-type-radio${form.type === opt.value ? ' active' : ''}`}
              >
                <input
                  type="radio"
                  name="fa-type"
                  value={opt.value}
                  checked={form.type === opt.value}
                  onChange={() => field('type', opt.value)}
                />
                {opt.value}
              </label>
            ))}
          </div>
        </FormField>

        {/* 幣別 + 金額 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField label="幣別" required>
            <SelectInput
              value={form.currency}
              onChange={v => field('currency', v)}
              options={CURRENCY_OPTIONS}
            />
          </FormField>
          <FormField label="持有金額" required>
            <NumberInput
              value={form.amount}
              onChange={v => field('amount', v)}
              min={0}
              step={1000}
              placeholder="0"
            />
          </FormField>
        </div>

        {/* 名稱（債券必填，其他選填） */}
        <FormField label={needsName ? '債券名稱' : '備註名稱'} required={needsName}>
          <TextInput
            value={form.name}
            onChange={e => field('name', e.target.value)}
            placeholder={needsName ? '例：美國10年期公債' : '選填'}
          />
        </FormField>

        {/* 年利率 + 到期日 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField label="年利率（%）" required>
            <NumberInput
              value={form.interestRatePct}
              onChange={v => field('interestRatePct', v)}
              min={0}
              step={0.01}
              placeholder="0.00"
            />
          </FormField>
          {needsMaturity && (
            <FormField label="到期日" required>
              <TextInput
                type="date"
                value={form.maturityDate}
                onChange={e => field('maturityDate', e.target.value)}
              />
            </FormField>
          )}
        </div>

        {/* 匯率設定 */}
        <FormField label="匯率設定">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label className={`assets-rate-row${!form.useManualRate ? ' active' : ''}`}>
              <input
                type="radio"
                checked={!form.useManualRate}
                onChange={() => field('useManualRate', false)}
              />
              <span className="assets-rate-label">即時</span>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--dim)' }}>自動抓取即時匯率</span>
            </label>
            <label className={`assets-rate-row${form.useManualRate ? ' active' : ''}`}>
              <input
                type="radio"
                checked={form.useManualRate}
                onChange={() => field('useManualRate', true)}
              />
              <span className="assets-rate-label">手動</span>
              <input
                className="assets-rate-input"
                type="number"
                min={0}
                step={0.001}
                value={form.manualRate}
                disabled={!form.useManualRate}
                placeholder="0.000"
                onChange={e => field('manualRate', e.target.value)}
                onClick={e => e.stopPropagation()}
              />
            </label>
          </div>
        </FormField>

      </div>
    </Modal>
  );
}
