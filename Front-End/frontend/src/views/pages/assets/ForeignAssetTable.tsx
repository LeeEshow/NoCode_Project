import { useState } from 'react';
import Icon from '../../components/Icon';
import type { ForeignAssetDTO, CreateForeignAssetPayload } from '../../../types';

/* ── 工具函式 ── */

function fmt(n: number, d = 2) {
  return n.toLocaleString('zh-TW', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function yearsTo(maturityDate: string | null): number {
  if (!maturityDate) return 0;
  const ms = new Date(maturityDate).getTime() - Date.now();
  return Math.max(0, ms / (365.25 * 24 * 3600 * 1000));
}

function maturityValue(item: ForeignAssetDTO): number | null {
  if (!item.maturityDate) return null; // 活存：不顯示
  const years = yearsTo(item.maturityDate);
  return item.amount * (1 + item.interestRate * years);
}

/* ── Type Badge ── */

const TYPE_COLOR: Record<string, string> = {
  '活存': 'var(--accent)',
  '定存': '#f59e0b',
  '債券': '#a78bfa',
};

function TypeBadge({ type }: { type: string }) {
  return (
    <span className="fa-type-badge" style={{ '--badge-color': TYPE_COLOR[type] ?? 'var(--dim)' } as React.CSSProperties}>
      {type}
    </span>
  );
}

/* ── RateCell（匯率選擇） ── */

interface RateCellProps {
  item:    ForeignAssetDTO;
  saving:  boolean;
  onSave:  (patch: Partial<CreateForeignAssetPayload>) => void;
}

function RateCell({ item, saving, onSave }: RateCellProps) {
  const [manualDraft, setManualDraft] = useState(
    item.manualRate > 0 ? String(item.manualRate) : (item.liveRate != null ? String(item.liveRate) : ''),
  );

  if (item.currency === 'TWD') return <span className="fa-dim">—</span>;

  return (
    <div className="assets-rate-cell">
      {/* 即時匯率 */}
      <label className={`assets-rate-row${!item.useManualRate ? ' active' : ''}`}>
        <input
          type="radio"
          checked={!item.useManualRate}
          disabled={saving}
          onChange={() => onSave({ useManualRate: false })}
        />
        <span className="assets-rate-label">即時</span>
        <span className="assets-rate-value">
          {item.liveRate != null ? fmt(item.liveRate, 4) : '—'}
        </span>
      </label>

      {/* 手動匯率 */}
      <label className={`assets-rate-row${item.useManualRate ? ' active' : ''}`}>
        <input
          type="radio"
          checked={item.useManualRate}
          disabled={saving}
          onChange={() => {
            const rate = item.manualRate > 0 ? item.manualRate : (item.liveRate ?? 0);
            setManualDraft(String(rate));
            onSave({ useManualRate: true, manualRate: rate });
          }}
        />
        <span className="assets-rate-label">手動</span>
        <input
          className="assets-rate-input"
          type="number"
          min={0}
          step={0.001}
          value={manualDraft}
          disabled={saving || !item.useManualRate}
          onChange={e => setManualDraft(e.target.value)}
          onBlur={() => {
            const v = parseFloat(manualDraft);
            if (!isNaN(v) && v > 0 && v !== item.manualRate) {
              onSave({ useManualRate: true, manualRate: v });
            }
          }}
          onClick={e => e.stopPropagation()}
        />
      </label>
    </div>
  );
}

/* ── Props ── */

export interface ForeignAssetTableProps {
  items:   ForeignAssetDTO[];
  saving:  boolean;
  onEdit:  (item: ForeignAssetDTO) => void;
  onPatch: (id: string, patch: Partial<CreateForeignAssetPayload>) => void;
  onDelete:(id: string) => void;
}

/* ── Table ── */

export default function ForeignAssetTable({
  items, saving, onEdit, onPatch, onDelete,
}: ForeignAssetTableProps) {
  if (items.length === 0) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--dim)', fontSize: 'var(--text-sm)' }}>
        尚無外幣資產，點擊「＋ 新增」加入
      </div>
    );
  }

  return (
    <div className="ft-table-wrap">
      <table className="ft-table">
        <thead>
          <tr>
            <th>類型</th>
            <th>幣別 / 名稱</th>
            <th style={{ textAlign: 'right' }}>持有金額</th>
            <th style={{ textAlign: 'right' }}>年利率</th>
            <th>到期日</th>
            <th>匯率</th>
            <th style={{ textAlign: 'right' }}>到期估值</th>
            <th style={{ textAlign: 'right' }}>台幣換算</th>
            <th style={{ width: 72 }}></th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => {
            const effectiveRate = item.currency === 'TWD' ? 1
              : (item.useManualRate ? item.manualRate : (item.liveRate ?? 0));
            const twdValue  = item.amount * effectiveRate;
            const matVal    = maturityValue(item);

            return (
              <tr key={item.id}>
                {/* 類型 */}
                <td><TypeBadge type={item.type} /></td>

                {/* 幣別 / 名稱 */}
                <td>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{item.currency}</span>
                    {item.name && (
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--dim)' }}>{item.name}</span>
                    )}
                  </div>
                </td>

                {/* 持有金額（行內輸入） */}
                <td style={{ textAlign: 'right' }}>
                  <AmountInput
                    value={item.amount}
                    saving={saving}
                    onSave={amount => onPatch(item.id, { amount })}
                  />
                </td>

                {/* 年利率 */}
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-value)' }}>
                  {item.interestRate > 0 ? `${fmt(item.interestRate * 100, 2)}%` : <span className="fa-dim">—</span>}
                </td>

                {/* 到期日 */}
                <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-value)' }}>
                  {item.maturityDate ?? <span className="fa-dim">活存</span>}
                </td>

                {/* 匯率 */}
                <td>
                  <RateCell
                    item={item}
                    saving={saving}
                    onSave={patch => onPatch(item.id, patch)}
                  />
                </td>

                {/* 到期估值（原幣） */}
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-value)' }}>
                  {matVal != null
                    ? <>{fmt(matVal, 0)} <span style={{ fontSize: 'var(--text-xs)', color: 'var(--dim)' }}>{item.currency}</span></>
                    : <span className="fa-dim">—</span>
                  }
                </td>

                {/* 台幣換算 */}
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-value)', fontWeight: 600 }}>
                  {fmt(twdValue, 0)}
                </td>

                {/* 操作 */}
                <td>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    <button
                      className="btn-icon"
                      title="編輯"
                      disabled={saving}
                      onClick={() => onEdit(item)}
                    >
                      <Icon name="edit" size={21} />
                    </button>
                    <button
                      className="btn-icon"
                      title="刪除"
                      disabled={saving}
                      onClick={() => onDelete(item.id)}
                    >
                      <Icon name="delete" size={21} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── 行內金額輸入 ── */

function AmountInput({ value, saving, onSave }: {
  value:  number;
  saving: boolean;
  onSave: (v: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  return (
    <input
      className="assets-inline-input"
      style={{ textAlign: 'right' }}
      type="number"
      min={0}
      value={draft}
      disabled={saving}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => {
        const v = parseFloat(draft);
        if (!isNaN(v) && v >= 0 && v !== value) onSave(v);
        else setDraft(String(value));
      }}
    />
  );
}

