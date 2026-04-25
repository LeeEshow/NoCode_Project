import { useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import LoadingPanel from '../../components/LoadingPanel';
import { useTransactionsViewModel } from '../../../viewmodels/useTransactionsViewModel';
import { toast } from '../../components/Toast/toastStore';
import type { TransactionDTO, CreateTransactionPayload } from '../../../types';

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('zh-TW', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/* ── 單筆編輯 inline form ── */
function InlineEditRow({
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
  const [fee,    setFee]    = useState(String(tx.fee));
  const [date,   setDate]   = useState(tx.date);
  const [note,   setNote]   = useState(tx.note ?? '');

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg)', border: '1px solid var(--border-hi)',
    color: 'var(--text)', borderRadius: 'var(--radius-xs)',
    padding: '2px 6px', fontSize: 'var(--text-md)', fontFamily: 'var(--font-mono)',
    width: '100%',
  };

  return (
    <tr style={{ background: 'rgba(106,143,181,0.05)' }}>
      <td>
        <select
          value={type}
          onChange={e => setType(e.target.value as 'buy' | 'sell')}
          style={{ ...inputStyle, width: 60 }}
        >
          <option value="buy">買</option>
          <option value="sell">賣</option>
        </select>
      </td>
      <td><input value={date}   onChange={e => setDate(e.target.value)}   type="date" style={inputStyle} /></td>
      <td><input value={shares} onChange={e => setShares(e.target.value)} type="number" min="1" style={inputStyle} /></td>
      <td><input value={price}  onChange={e => setPrice(e.target.value)}  type="number" min="0" style={inputStyle} /></td>
      <td><input value={fee}    onChange={e => setFee(e.target.value)}    type="number" min="0" style={inputStyle} /></td>
      <td colSpan={2}>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="備註"
          style={{ ...inputStyle, height: 150, resize: 'vertical' }}
        />
      </td>
      <td>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            className="btn-ghost"
            style={{ padding: '2px 8px', fontSize: 'var(--text-sm)' }}
            disabled={saving}
            onClick={() => onSave({ type, date, shares: Number(shares), price: Number(price), fee: Number(fee), note })}
          >
            儲存
          </button>
          <button
            className="btn-ghost"
            style={{ padding: '2px 8px', fontSize: 'var(--text-sm)', color: 'var(--dim)' }}
            onClick={onCancel}
          >
            取消
          </button>
        </div>
      </td>
    </tr>
  );
}

/* ── 主元件（P2-19）── */
export interface TransactionHistoryModalProps {
  open:      boolean;
  stockCode: string | null;
  stockName: string;
  onClose:   () => void;
  onChanged: () => void;
}

export default function TransactionHistoryModal({
  open, stockCode, stockName, onClose, onChanged,
}: TransactionHistoryModalProps) {
  const vm = useTransactionsViewModel(stockCode);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId,  setDeleteId]  = useState<string | null>(null);

  useEffect(() => {
    if (open && stockCode) vm.load();
  }, [open, stockCode]);  // eslint-disable-line

  const handleSave = async (id: string, payload: Partial<CreateTransactionPayload>) => {
    await vm.updateTx(id, payload, () => {
      toast.success('已更新交易紀錄');
      setEditingId(null);
      onChanged();
    });
    if (vm.error) toast.error(vm.error);
  };

  const handleDelete = async (id: string) => {
    await vm.deleteTx(id, () => {
      toast.success('已刪除交易紀錄');
      setDeleteId(null);
      onChanged();
    });
    if (vm.error) toast.error(vm.error);
  };

  const typeTag = (type: 'buy' | 'sell') => (
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

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={`交易紀錄 — ${stockCode} ${stockName}`}
        size="lg"
      >
        {vm.loading
          ? <LoadingPanel loading rows={3} />
          : (
            <table className="ft-table" style={{ fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr>
                  <th>類型</th>
                  <th>日期</th>
                  <th className="right">股數</th>
                  <th className="right">成交價</th>
                  <th className="right">手續費</th>
                  <th>備註</th>
                  <th className="center">操作</th>
                </tr>
              </thead>
              <tbody>
                {vm.items.map(tx =>
                  editingId === tx.id
                    ? (
                      <InlineEditRow
                        key={tx.id}
                        tx={tx}
                        saving={vm.saving}
                        onSave={p => handleSave(tx.id, p)}
                        onCancel={() => setEditingId(null)}
                      />
                    )
                    : (
                      <tr key={tx.id}>
                        <td>{typeTag(tx.type)}</td>
                        <td className="mono" style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>
                          {tx.date}
                        </td>
                        <td className="right"><span className="num-value">{fmt(tx.shares, 0)}</span></td>
                        <td className="right"><span className="num-value">{fmt(tx.price)}</span></td>
                        <td className="right"><span className="num-value">{fmt(tx.fee)}</span></td>
                        <td style={{ color: 'var(--dim)', fontSize: 'var(--text-sm)' }}>{tx.note ?? '—'}</td>
                        <td className="center">
                          <div style={{ display: 'inline-flex', gap: 4 }}>
                            <button
                              className="btn-icon"
                              title="編輯"
                              onClick={() => setEditingId(tx.id)}
                            >
                              <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                                <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                              </svg>
                            </button>
                            <button
                              className="btn-icon"
                              title="刪除"
                              style={{ color: 'var(--up)', borderColor: 'var(--up-bd)' }}
                              onClick={() => setDeleteId(tx.id)}
                            >
                              <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                                <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                )}
                {vm.items.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '20px 0', color: 'var(--dim)' }}>
                      尚無交易紀錄
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )
        }
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        title="確認刪除"
        message="此交易紀錄將被永久刪除，同時重新計算持倉成本。"
        variant="danger"
        confirmLabel="刪除"
        onConfirm={() => deleteId && handleDelete(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
    </>
  );
}
