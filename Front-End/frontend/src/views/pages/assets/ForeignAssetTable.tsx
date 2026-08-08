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
  if (!item.maturityDate) return null;
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
    <span
      className="fa-type-badge"
      style={{ '--badge-color': TYPE_COLOR[type] ?? 'var(--dim)' } as React.CSSProperties}
    >
      {type}
    </span>
  );
}

/* ── RateCell：單列，匯率值 + 模式 badge ── */

interface RateCellProps {
  item:   ForeignAssetDTO;
  saving: boolean;
  onSave: (patch: Partial<CreateForeignAssetPayload>) => void;
}

function RateCell({ item, saving, onSave }: RateCellProps) {
  const [manualDraft, setManualDraft] = useState(
    item.manualRate > 0 ? String(item.manualRate) : (item.liveRate != null ? String(item.liveRate) : ''),
  );

  if (item.currency === 'TWD') return <span className="fa-dim">—</span>;

  const liveDisplay = item.liveRate != null ? fmt(item.liveRate, 4) : null;

  return (
    <div className="assets-rate-inline">
      {item.useManualRate ? (
        <>
          <input
            className="assets-rate-input"
            type="number"
            min={0}
            step={0.001}
            value={manualDraft}
            disabled={saving}
            onChange={e => setManualDraft(e.target.value)}
            onBlur={() => {
              const v = parseFloat(manualDraft);
              if (!isNaN(v) && v > 0 && v !== item.manualRate) {
                onSave({ useManualRate: true, manualRate: v });
              }
            }}
            onClick={e => e.stopPropagation()}
          />
          <button
            className="assets-rate-badge assets-rate-badge--manual"
            disabled={saving}
            onClick={() => onSave({ useManualRate: false })}
            title={liveDisplay ? `即時匯率 ${liveDisplay}，點擊切換` : '點擊切換為即時匯率'}
          >
            手動
          </button>
        </>
      ) : (
        <>
          <span className="assets-rate-live-value">
            {liveDisplay ?? <span className="fa-dim">—</span>}
          </span>
          <button
            className="assets-rate-badge assets-rate-badge--live"
            disabled={saving}
            onClick={() => {
              const rate = item.manualRate > 0 ? item.manualRate : (item.liveRate ?? 0);
              setManualDraft(String(rate));
              onSave({ useManualRate: true, manualRate: rate });
            }}
            title="點擊切換為手動匯率"
          >
            即時
          </button>
        </>
      )}
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
        尚無固定收益資產，點擊右上方的「新增」加入
      </div>
    );
  }

  return (
    <div className="ft-table-scroll">
      <table className="ft-table" style={{ width: '100%', minWidth: 860 }}>
        <thead>
          <tr>
            <th style={{ width: 64, whiteSpace: 'nowrap' }}>類別</th>
            <th style={{ width: 180, whiteSpace: 'nowrap' }}>標題</th>
            <th style={{ textAlign: 'right', width: 130, whiteSpace: 'nowrap' }}>持有金額</th>
            <th style={{ textAlign: 'right', width: 80, whiteSpace: 'nowrap' }}>年利率</th>
            <th style={{ width: 150, whiteSpace: 'nowrap' }}>匯率</th>
            <th style={{ textAlign: 'right', width: 110, whiteSpace: 'nowrap' }}>台幣換算</th>
            <th style={{ textAlign: 'right', width: 130, whiteSpace: 'nowrap' }}>到期估值</th>
            <th style={{ whiteSpace: 'nowrap' }}>備註</th>
            <th style={{ width: 72 }}></th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => {
            const effectiveRate = item.currency === 'TWD' ? 1
              : (item.useManualRate ? item.manualRate : (item.liveRate ?? 0));
            const twdValue = item.amount * effectiveRate;
            const matVal   = maturityValue(item);

            return (
              <tr key={item.id}>
                {/* 類別 */}
                <td><TypeBadge type={item.type} /></td>

                {/* 標題 */}
                <td>
                  <span style={{ fontWeight: 500 }}>{item.title}</span>
                </td>

                {/* 持有金額（行內輸入 + 幣別單位） */}
                <td style={{ textAlign: 'right' }}>
                  <AmountInput
                    value={item.amount}
                    currency={item.currency}
                    saving={saving}
                    onSave={amount => onPatch(item.id, { amount })}
                  />
                </td>

                {/* 年利率 */}
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-value)' }}>
                  {item.interestRate > 0
                    ? `${fmt(item.interestRate * 100, 2)}%`
                    : <span className="fa-dim">—</span>}
                </td>

                {/* 匯率（單列） */}
                <td>
                  <RateCell
                    item={item}
                    saving={saving}
                    onSave={patch => onPatch(item.id, patch)}
                  />
                </td>

                {/* 台幣換算 */}
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-value)', fontWeight: 600 }}>
                  <span>{fmt(twdValue, 0)}</span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--dim)', marginLeft: 3 }}>NT</span>
                </td>

                {/* 到期估值 */}
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-value)' }}>
                  {matVal != null
                    ? <>
                        {fmt(matVal, 0)}
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--dim)', marginLeft: 3 }}>{item.currency}</span>
                      </>
                    : <span className="fa-dim">—</span>}
                </td>

                {/* 備註（過長截斷，hover 顯示全文） */}
                <td>
                  {item.notes
                    ? (
                      <span
                        className="fa-notes-cell"
                        title={item.notes}
                      >
                        {item.notes}
                      </span>
                    )
                    : <span className="fa-dim">—</span>}
                </td>

                {/* 操作 */}
                <td>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    <button
                      className="btn-icon"
                      aria-label="編輯"
                      disabled={saving}
                      onClick={() => onEdit(item)}
                    >
                      <Icon name="edit" size={24} />
                    </button>
                    <button
                      className="btn-icon"
                      aria-label="刪除"
                      disabled={saving}
                      onClick={() => onDelete(item.id)}
                    >
                      <Icon name="delete" size={24} />
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

/* ── 行內金額輸入（帶幣別單位） ── */

function AmountInput({ value, currency, saving, onSave }: {
  value:    number;
  currency: string;
  saving:   boolean;
  onSave:   (v: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end' }}>
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
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--dim)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
        {currency}
      </span>
    </div>
  );
}
