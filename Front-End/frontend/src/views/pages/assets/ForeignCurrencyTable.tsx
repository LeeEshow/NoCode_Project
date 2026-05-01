import { useState, useEffect } from 'react';
import ConfirmDialog from '../../components/ConfirmDialog';
import type { ForeignCurrencyDTO, CurrencyCode, UpdateForeignCurrencyPayload } from '../../../types';

const CURRENCY_NAMES: Record<string, string> = {
  USD: '美元', JPY: '日圓', EUR: '歐元', CNY: '人民幣',
  HKD: '港元', GBP: '英鎊', AUD: '澳幣', SGD: '新幣',
};

function fmt(n: number, d = 2) {
  return n.toLocaleString('zh-TW', { minimumFractionDigits: d, maximumFractionDigits: d });
}

/* ── 單列 ── */
interface RowProps {
  item:     ForeignCurrencyDTO;
  onUpdate: (code: CurrencyCode, payload: UpdateForeignCurrencyPayload) => void;
  onDelete: (code: CurrencyCode) => void;
  saving:   boolean;
}

function CurrencyRow({ item, onUpdate, onDelete, saving }: RowProps) {
  const [amountStr,     setAmountStr]     = useState(String(item.amount));
  const [manualRateStr, setManualRateStr] = useState(String(item.manualRate || ''));

  useEffect(() => { setAmountStr(String(item.amount)); },     [item.amount]);
  useEffect(() => { setManualRateStr(String(item.manualRate)); }, [item.manualRate]);

  const save = (patch: Partial<UpdateForeignCurrencyPayload>) => {
    onUpdate(item.currencyCode, {
      amount:        Number(amountStr)     || item.amount,
      useManualRate: item.useManualRate,
      manualRate:    Number(manualRateStr) || item.manualRate,
      ...patch,
    });
  };

  const handleAmountBlur = () => {
    const v = Number(amountStr);
    if (v > 0 && v !== item.amount) save({ amount: v });
    else setAmountStr(String(item.amount));
  };

  const handleToggleMode = (useManual: boolean) => {
    save({ useManualRate: useManual });
  };

  const handleManualRateBlur = () => {
    const v = Number(manualRateStr);
    if (v > 0 && v !== item.manualRate) save({ useManualRate: true, manualRate: v });
    else setManualRateStr(String(item.manualRate));
  };

  const activeRate = item.useManualRate ? item.manualRate : (item.liveRate ?? 0);

  return (
    <tr>
      {/* 幣別 */}
      <td>
        <div className="stock-code">{item.currencyCode}</div>
        <div className="stock-name">{CURRENCY_NAMES[item.currencyCode] ?? item.currencyCode}</div>
      </td>

      {/* 持有金額 — 行內編輯 */}
      <td className="right">
        <input
          className="assets-inline-input mono"
          value={amountStr}
          onChange={e => setAmountStr(e.target.value)}
          onBlur={handleAmountBlur}
          onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          disabled={saving}
          style={{ textAlign: 'right' }}
        />
      </td>

      {/* 匯率（上下兩列） */}
      <td>
        <div className="assets-rate-cell">
          {/* 即時 */}
          <label className={`assets-rate-row${!item.useManualRate ? ' active' : ''}`}>
            <input
              type="radio"
              name={`rate-${item.currencyCode}`}
              checked={!item.useManualRate}
              onChange={() => handleToggleMode(false)}
              disabled={saving}
            />
            <span className="assets-rate-label">即時</span>
            <span className="mono assets-rate-value">
              {item.liveRate != null ? fmt(item.liveRate, 4) : '—'}
            </span>
          </label>

          {/* 手動 */}
          <label className={`assets-rate-row${item.useManualRate ? ' active' : ''}`}>
            <input
              type="radio"
              name={`rate-${item.currencyCode}`}
              checked={item.useManualRate}
              onChange={() => handleToggleMode(true)}
              disabled={saving}
            />
            <span className="assets-rate-label">手動</span>
            <input
              className="assets-rate-input mono"
              value={manualRateStr}
              onChange={e => setManualRateStr(e.target.value)}
              onBlur={handleManualRateBlur}
              onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              disabled={!item.useManualRate || saving}
              placeholder="0.0000"
            />
          </label>
        </div>
      </td>

      {/* 台幣換算 */}
      <td className="right">
        <span className="num-value">{fmt(item.twdValue)}</span>
      </td>

      {/* 操作 */}
      <td className="center">
        <button
          className="btn-icon"
          title="移除"
          style={{ color: 'var(--up)', borderColor: 'var(--up-bd)' }}
          onClick={() => onDelete(item.currencyCode)}
          disabled={saving}
        >
          <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
        </button>
      </td>
    </tr>
  );
}

/* ── Table ── */
export interface ForeignCurrencyTableProps {
  items:    ForeignCurrencyDTO[];
  onUpdate: (code: CurrencyCode, payload: UpdateForeignCurrencyPayload) => void;
  onDelete: (code: CurrencyCode) => void;
  saving:   boolean;
}

export default function ForeignCurrencyTable({ items, onUpdate, onDelete, saving }: ForeignCurrencyTableProps) {
  const [confirmCode, setConfirmCode] = useState<CurrencyCode | null>(null);

  return (
    <>
      <table className="ft-table">
        <thead>
          <tr>
            <th>幣別</th>
            <th className="right">持有金額</th>
            <th>匯率</th>
            <th className="right">台幣換算</th>
            <th className="center">操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <CurrencyRow
              key={item.currencyCode}
              item={item}
              onUpdate={onUpdate}
              onDelete={code => setConfirmCode(code)}
              saving={saving}
            />
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={5} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--dim)' }}>
                尚無外幣持倉
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <ConfirmDialog
        open={!!confirmCode}
        title="確認移除"
        message={`確定移除 ${confirmCode} 外幣持倉？`}
        danger
        confirmLabel="移除"
        onConfirm={() => { if (confirmCode) { onDelete(confirmCode); setConfirmCode(null); } }}
        onCancel={() => setConfirmCode(null)}
      />
    </>
  );
}
