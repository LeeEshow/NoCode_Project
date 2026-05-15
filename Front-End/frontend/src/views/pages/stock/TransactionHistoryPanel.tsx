import { useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import LoadingPanel from '../../components/LoadingPanel';
import Icon from '../../components/Icon';
import { FormField, TextInput, NumberInput, RadioGroup, TextareaInput } from '../../components/FormInputs';
import { useTransactionsViewModel } from '../../../viewmodels/useTransactionsViewModel';
import { toast } from '../../components/Toast';
import type { TransactionDTO, CreateTransactionPayload } from '../../../types';

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('zh-TW', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function TypeTag({ type }: { type: 'buy' | 'sell' }) {
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', padding: '1px 8px',
      borderRadius: 'var(--radius-xs)',
      background: type === 'buy' ? 'var(--up-bg)' : 'var(--down-bg)',
      border: `1px solid ${type === 'buy' ? 'var(--up-bd)' : 'var(--down-bd)'}`,
      color: type === 'buy' ? 'var(--up)' : 'var(--down)',
    }}>
      {type === 'buy' ? '買進' : '賣出'}
    </span>
  );
}

function EditTransactionModal({
  tx, saving, onSave, onCancel,
}: {
  tx: TransactionDTO;
  saving: boolean;
  onSave: (payload: Partial<CreateTransactionPayload>) => void;
  onCancel: () => void;
}) {
  const [type,   setType]   = useState<'buy' | 'sell'>(tx.type);
  const [shares, setShares] = useState(String(tx.shares));
  const [price,  setPrice]  = useState(String(tx.price));
  const [date,   setDate]   = useState(tx.date);
  const [note,   setNote]   = useState(tx.note ?? '');

  return (
    <Modal
      open
      onClose={onCancel}
      title="編輯交易紀錄"
      size="sm"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn-ghost" onClick={onCancel}>取消</button>
          <button
            className="btn-ghost"
            style={{ borderColor: 'var(--accent-bd)', color: 'var(--accent)' }}
            disabled={saving}
            onClick={() => onSave({ type, date, shares: Number(shares), price: Number(price), fee: 0, note })}
          >
            {saving ? '儲存中…' : '確認儲存'}
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <FormField label="交易類型" required>
          <RadioGroup
            name="edit-tx-type"
            value={type}
            onChange={v => setType(v as 'buy' | 'sell')}
            options={[{ value: 'buy', label: '買進' }, { value: 'sell', label: '賣出' }]}
          />
        </FormField>
        <FormField label="交易日期" required>
          <TextInput type="date" value={date} onChange={e => setDate(e.target.value)} />
        </FormField>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField label="交易總金額（含手續費）" required>
            <NumberInput
              value={String(Number(price) * Number(shares) || '')}
              onChange={v => { if (Number(shares) > 0) setPrice(String(Number(v) / Number(shares))); }}
              min={0} step={1} placeholder="0"
            />
          </FormField>
          <FormField label="股數（股）" required>
            <NumberInput value={shares} onChange={v => setShares(v)} min={1} step={1} placeholder="0" />
          </FormField>
        </div>
        <FormField label="備註">
          <TextareaInput value={note} onChange={e => setNote(e.target.value)} placeholder="選填" />
        </FormField>
        {Number(shares) > 0 && Number(price) > 0 && (
          <div style={{
            padding: '10px 12px',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-xs)',
            fontSize: 'var(--text-sm)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--dim)' }}>每股成本（元）</span>
              <span className="mono" style={{ color: 'var(--text-value)' }}>{fmt(Number(price))}</span>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ── 主元件（展開列 Tab 用，不包 Modal）── */

interface Props {
  stockCode:  string;
  stockName:  string;
  onAddTx?:  (code: string, name: string) => void;
  onChanged?: () => void;
}

export default function TransactionHistoryPanel({ stockCode, stockName, onAddTx, onChanged }: Props) {
  const vm = useTransactionsViewModel(stockCode);
  const [editingTx, setEditingTx] = useState<TransactionDTO | null>(null);
  const [deleteId,  setDeleteId]  = useState<string | null>(null);

  useEffect(() => { vm.load(); }, []); // eslint-disable-line

  const handleSave = async (id: string, payload: Partial<CreateTransactionPayload>) => {
    await vm.updateTx(id, payload, () => {
      toast.success('已更新交易紀錄');
      setEditingTx(null);
      onChanged?.();
    });
    if (vm.error) toast.error(vm.error);
  };

  const handleDelete = async (id: string) => {
    await vm.deleteTx(id, () => {
      toast.success('已刪除交易紀錄');
      setDeleteId(null);
      onChanged?.();
    });
    if (vm.error) toast.error(vm.error);
  };

  return (
    <>
      {/* Tab 標題列 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
      }}>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>
          {stockCode} {stockName}
        </span>
        {onAddTx && (
          <button
            className="btn-ghost"
            style={{ fontSize: 'var(--text-sm)', padding: '3px 10px' }}
            onClick={() => onAddTx(stockCode, stockName)}
          >
            ＋ 新增交易
          </button>
        )}
      </div>

      {/* 交易紀錄表格 */}
      {vm.loading ? (
        <LoadingPanel loading rows={3} />
      ) : (
        <div className="ft-table-scroll">
          <table className="ft-table" style={{ fontSize: 'var(--text-sm)' }}>
            <thead>
              <tr>
                <th>類型</th>
                <th>日期</th>
                <th className="right">股數</th>
                <th className="right">成交價</th>
                <th>備註</th>
                <th className="center">操作</th>
              </tr>
            </thead>
            <tbody>
              {vm.items.map(tx => (
                <tr key={tx.id}>
                  <td><TypeTag type={tx.type} /></td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>{tx.date}</td>
                  <td className="right"><span className="num-value">{fmt(tx.shares, 0)}</span></td>
                  <td className="right"><span className="num-value">{fmt(tx.price)}</span></td>
                  <td style={{ color: 'var(--dim)' }}>{tx.note ?? '—'}</td>
                  <td className="center">
                    <div style={{ display: 'inline-flex', gap: 5 }}>
                      <button className="btn-icon" aria-label="編輯" onClick={() => setEditingTx(tx)}>
                        <Icon name="edit" size={18} />
                      </button>
                      <button
                        className="btn-icon"
                        aria-label="刪除"
                        style={{ color: 'var(--up)' }}
                        onClick={() => setDeleteId(tx.id)}
                      >
                        <Icon name="delete" size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {vm.items.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '20px 0', color: 'var(--dim)' }}>
                    尚無交易紀錄
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editingTx && (
        <EditTransactionModal
          tx={editingTx}
          saving={vm.saving}
          onSave={p => handleSave(editingTx.id, p)}
          onCancel={() => setEditingTx(null)}
        />
      )}

      <ConfirmDialog
        open={!!deleteId}
        title="確認刪除"
        message="此交易紀錄將被永久刪除，同時重新計算持倉成本。"
        danger
        confirmLabel="刪除"
        onConfirm={() => deleteId && handleDelete(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
    </>
  );
}
