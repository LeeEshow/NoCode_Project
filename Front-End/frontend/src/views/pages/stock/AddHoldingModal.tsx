import { useState, useEffect, useRef } from 'react';
import Modal from '../../components/Modal';
import { FormField, TextInput, NumberInput } from '../../components/FormInputs';
import { searchStocks } from '../../../models/holdingModel';
import { createTransaction } from '../../../models/transactionModel';
import { fetchTransactions } from '../../../models/transactionModel';
import { recalculateHoldings } from '../../../models/holdingModel';
import { calcCostFromTransactions } from '../../../viewmodels/useTransactionsViewModel';
import { useSnapshotStore } from '../../../stores/snapshotStore';
import { toast } from '../../components/Toast/toastStore';
import type { StockSearchResultDTO } from '../../../types';

interface FormState {
  stockCode:   string;
  stockName:   string;
  totalAmount: string;
  shares:      string;
  date:        string;
}

function defaultForm(): FormState {
  return {
    stockCode:   '',
    stockName:   '',
    totalAmount: '',
    shares:      '',
    date:        new Date().toISOString().slice(0, 10),
  };
}

export interface AddHoldingModalProps {
  open:      boolean;
  onClose:   () => void;
  onSuccess: () => void;
}

export default function AddHoldingModal({ open, onClose, onSuccess }: AddHoldingModalProps) {
  const [form, setForm]           = useState<FormState>(defaultForm);
  const [searchResult, setResult] = useState<StockSearchResultDTO[]>([]);
  const [showDrop, setShowDrop]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) { setForm(defaultForm()); setResult([]); setShowDrop(false); }
  }, [open]);

  function field<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function handleCodeInput(val: string) {
    field('stockCode', val);
    field('stockName', '');
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (val.length < 1) { setResult([]); setShowDrop(false); return; }
    searchTimer.current = setTimeout(async () => {
      try {
        const results = await searchStocks(val);
        setResult(results);
        setShowDrop(results.length > 0);
      } catch { /* silent */ }
    }, 300);
  }

  function selectStock(s: StockSearchResultDTO) {
    setForm(f => ({ ...f, stockCode: s.code, stockName: s.name }));
    setResult([]);
    setShowDrop(false);
  }

  const valid =
    form.stockCode.trim() &&
    form.totalAmount !== '' && Number(form.totalAmount) >= 0 &&
    Number(form.shares) > 0 &&
    !!form.date;

  const handleSubmit = async () => {
    if (!valid) { toast.error('請填寫全部必填欄位'); return; }
    setSaving(true);
    try {
      const stockCode = form.stockCode.trim();
      const stockName = form.stockName.trim() || stockCode;
      const shares      = Number(form.shares);
      const totalAmount = Number(form.totalAmount);
      const pricePerShare = totalAmount / shares;
      await createTransaction({
        stockCode,
        stockName,
        type:   'buy',
        shares,
        price:  pricePerShare,
        fee:    0,
        date:   form.date,
      });
      const txs  = await fetchTransactions(stockCode);
      const calc = calcCostFromTransactions(txs);
      await recalculateHoldings([{ stockCode, ...calc }]);

      /* 連動流動資金：新增持股視同買入，扣除總金額 */
      const snap = useSnapshotStore.getState();
      if (snap.loaded) {
        await snap.update(snap.cashBalance - totalAmount);
      }

      toast.success(`${stockCode} ${stockName} 已新增至庫存`);
      onSuccess();
      onClose();
    } catch (err) {
      toast.error((err as Error).message || '新增失敗，請稍後再試');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="新增持股"
      size="sm"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn-ghost" onClick={onClose}>取消</button>
          <button
            className="btn-ghost"
            style={{ borderColor: 'var(--accent-bd)', color: 'var(--accent)' }}
            disabled={saving || !valid}
            onClick={handleSubmit}
          >
            {saving ? '儲存中…' : '確認新增'}
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* 股票搜尋 */}
        <FormField label="股票代號 / 名稱" required>
          <div style={{ position: 'relative' }}>
            <TextInput
              value={form.stockCode}
              onChange={e => handleCodeInput(e.target.value)}
              placeholder="輸入代號或名稱搜尋"
              style={{ textTransform: 'uppercase' }}
            />
            {showDrop && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                background: 'var(--panel)', border: '1px solid var(--border-hi)',
                borderRadius: 'var(--radius-sm)', maxHeight: 180, overflowY: 'auto',
              }}>
                {searchResult.map(s => (
                  <div
                    key={s.code}
                    style={{
                      padding: '7px 12px', cursor: 'pointer', display: 'flex', gap: 10,
                      borderBottom: '1px solid var(--border)',
                    }}
                    onMouseDown={() => selectStock(s)}
                  >
                    <span className="mono" style={{ color: 'var(--text)', minWidth: 52 }}>{s.code}</span>
                    <span style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>{s.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </FormField>

        {form.stockName && (
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--dim)', marginTop: -8 }}>
            {form.stockName}
          </div>
        )}

        <FormField label="交易日期" required>
          <TextInput
            type="date"
            value={form.date}
            onChange={e => field('date', e.target.value)}
          />
        </FormField>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField label="購入總金額（含手續費）" required>
            <NumberInput
              value={form.totalAmount}
              onChange={v => field('totalAmount', v)}
              min={0}
              step={1}
              placeholder="0"
            />
          </FormField>
          <FormField label="股數（股）" required>
            <NumberInput
              value={form.shares}
              onChange={v => field('shares', v)}
              min={1}
              step={1}
              placeholder="0"
            />
          </FormField>
        </div>

        {Number(form.shares) > 0 && form.totalAmount !== '' && (
          <div style={{
            padding: '9px 12px',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-xs)',
            fontSize: 'var(--text-sm)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--dim)' }}>每股成本（元）</span>
              <span className="mono" style={{ color: 'var(--text-value)' }}>
                {(Number(form.totalAmount) / Number(form.shares)).toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
