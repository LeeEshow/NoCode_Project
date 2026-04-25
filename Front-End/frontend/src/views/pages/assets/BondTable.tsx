import { useState } from 'react';
import ConfirmDialog from '../../components/ConfirmDialog';
import type { BondDTO } from '../../../types';

function fmt(n: number, d = 2) {
  return n.toLocaleString('zh-TW', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtPct(rate: number) {
  // rate is raw decimal: 0.045 → "4.50%"
  return `${fmt(rate * 100, 2)}%`;
}

export interface BondTableProps {
  items:    BondDTO[];
  onEdit:   (bond: BondDTO) => void;
  onDelete: (id: string) => void;
  saving:   boolean;
}

export default function BondTable({ items, onEdit, onDelete, saving }: BondTableProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <>
      <table className="ft-table">
        <thead>
          <tr>
            <th>名稱</th>
            <th className="right">票面利率</th>
            <th className="right">到期日</th>
            <th className="center">幣別</th>
            <th className="right">持有面額</th>
            <th className="right">台幣估值</th>
            <th>備註</th>
            <th className="center">操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map(bond => (
            <tr key={bond.id}>
              <td>
                <span style={{ color: 'var(--text)', fontWeight: 500 }}>{bond.name}</span>
              </td>
              <td className="right">
                <span className="num-value">{fmtPct(bond.couponRate)}</span>
              </td>
              <td className="right">
                <span className="mono" style={{ color: 'var(--muted)' }}>{bond.maturityDate}</span>
              </td>
              <td className="center">
                <span className="stock-code" style={{ fontSize: 'var(--text-sm)' }}>{bond.currency}</span>
              </td>
              <td className="right">
                <span className="num-value">{fmt(bond.faceValue, 0)}</span>
              </td>
              <td className="right">
                <span className="num-value">{fmt(bond.twdEstimate, 0)}</span>
              </td>
              <td>
                <span style={{ color: 'var(--dim)', fontSize: 'var(--text-sm)' }}>
                  {bond.note ?? '—'}
                </span>
              </td>
              <td className="center">
                <div style={{ display: 'inline-flex', gap: 5 }}>
                  <button
                    className="btn-icon"
                    title="編輯"
                    onClick={() => onEdit(bond)}
                    disabled={saving}
                  >
                    <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                      <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                    </svg>
                  </button>
                  <button
                    className="btn-icon"
                    title="移除"
                    style={{ color: 'var(--up)', borderColor: 'var(--up-bd)' }}
                    onClick={() => setConfirmId(bond.id)}
                    disabled={saving}
                  >
                    <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                      <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={8} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--dim)' }}>
                尚無債券紀錄
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <ConfirmDialog
        open={!!confirmId}
        title="確認移除"
        message="確定移除此債券紀錄？"
        variant="danger"
        confirmLabel="移除"
        onConfirm={() => { if (confirmId) { onDelete(confirmId); setConfirmId(null); } }}
        onCancel={() => setConfirmId(null)}
      />
    </>
  );
}
