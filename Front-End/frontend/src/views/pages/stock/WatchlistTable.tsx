import SparkLine from '../../components/Charts/SparkLine';
import ConfirmDialog from '../../components/ConfirmDialog';
import Icon from '../../components/Icon';
import { useState } from 'react';
import type { WatchlistItemDTO } from '../../../types';

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('zh-TW', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function SignalTag({ signal }: { signal: 'buy' | 'wait' }) {
  const isBuy = signal === 'buy';
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', padding: '2px 10px',
      borderRadius: 'var(--radius-xs)',
      background: isBuy ? 'var(--down-bg)' : 'var(--accent-bg)',
      border: `1px solid ${isBuy ? 'var(--down-bd)' : 'var(--accent-bd)'}`,
      color: isBuy ? 'var(--down)' : 'var(--accent)',
    }}>
      {isBuy ? '買進' : '觀望'}
    </span>
  );
}

export interface WatchlistTableProps {
  items:      WatchlistItemDTO[];
  sparklines: Record<string, number[]>;
  onEdit:     (item: WatchlistItemDTO) => void;
  onDelete:   (id: string) => void;
  deleting:   boolean;
}

export default function WatchlistTable({ items, sparklines, onEdit, onDelete, deleting }: WatchlistTableProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <>
      <table className="ft-table">
        <thead>
          <tr>
            <th>代號 / 名稱</th>
            <th className="right">即時報價</th>
            <th className="right">漲跌幅</th>
            <th className="center">90日走勢</th>
            <th className="right">目標價</th>
            <th className="center">判斷</th>
            <th className="center">操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => {
            const cls = item.changePct === 0 ? 'txt-flat' : (item.isUp ? 'txt-up' : 'txt-down');
            const arrow = item.changePct === 0 ? '—' : (item.isUp ? '▲' : '▼');
            const sign  = item.changePct > 0 ? '+' : '';

            return (
              <tr key={item.id}>
                <td>
                  <div className="stock-code">{item.stockCode}</div>
                  <div className="stock-name">{item.stockName.length > 12 ? item.stockName.slice(0, 12) + '...' : item.stockName}</div>
                </td>
                <td className="right">
                  <span className="num-value">{fmt(item.currentPrice)}</span>
                </td>
                <td className="right">
                  <span className={`change-tag ${cls}`}>
                    {arrow} {fmt(Math.abs(item.change))}&nbsp;{sign}{fmt(item.changePct)}%
                  </span>
                </td>
                <td className="center">
                  {(sparklines[item.stockCode]?.length ?? 0) > 1
                    ? <div style={{ width: 72, height: 24, display: 'inline-block' }}>
                        <SparkLine data={sparklines[item.stockCode]} height={24} />
                      </div>
                    : <span style={{ fontSize: 'var(--text-sm)', color: 'var(--dim)' }}>—</span>
                  }
                </td>
                <td className="right">
                  <span className="mono" style={{ color: 'var(--muted)' }}>{fmt(item.targetPrice)}</span>
                </td>
                <td className="center">
                  <SignalTag signal={item.signal} />
                </td>
                <td className="center">
                  <div style={{ display: 'inline-flex', gap: 5 }}>
                    <button
                      className="btn-icon"
                      title="編輯"
                      onClick={e => { e.stopPropagation(); onEdit(item); }}
                    >
                      <Icon name="edit" size={16} />
                    </button>
                    <button
                      className="btn-icon"
                      title="移除"
                      style={{ color: 'var(--up)' }}
                      onClick={e => { e.stopPropagation(); setConfirmId(item.id); }}
                    >
                      <Icon name="delete" size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
          {items.length === 0 && (
            <tr>
              <td colSpan={7} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--dim)' }}>
                尚無關注清單
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <ConfirmDialog
        open={!!confirmId}
        title="確認移除"
        message="確定從關注清單移除此股票？"
        variant="danger"
        confirmLabel="移除"
        onConfirm={() => { if (confirmId) { onDelete(confirmId); setConfirmId(null); } }}
        onCancel={() => setConfirmId(null)}
      />
    </>
  );
}
