import { useState } from 'react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import SparkLine from '../../components/Charts/SparkLine';
import ConfirmDialog from '../../components/ConfirmDialog';
import Icon from '../../components/Icon';
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
  onReorder:  (newItems: WatchlistItemDTO[]) => void;
  deleting:   boolean;
}

function WatchlistRow({ item, sparklines, onEdit, onConfirm }: {
  item: WatchlistItemDTO;
  sparklines: Record<string, number[]>;
  onEdit: (item: WatchlistItemDTO) => void;
  onConfirm: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const cls   = item.changePct === 0 ? 'txt-flat' : (item.isUp ? 'txt-up' : 'txt-down');
  const arrow = item.changePct === 0 ? '—' : (item.isUp ? '▲' : '▼');
  const sign  = item.changePct > 0 ? '+' : '';

  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
    >
      <td style={{ paddingLeft: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span {...attributes} {...listeners} className="drag-handle">
            <Icon name="drag_indicator" size={18} />
          </span>
          <div>
            <div className="stock-code">{item.stockCode}</div>
            <div className="stock-name">{item.stockName.length > 12 ? item.stockName.slice(0, 12) + '...' : item.stockName}</div>
          </div>
        </div>
      </td>
      <td className="right"><span className="num-value">{fmt(item.currentPrice)}</span></td>
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
          <button className="btn-icon" title="編輯" onClick={e => { e.stopPropagation(); onEdit(item); }}>
            <Icon name="edit" size={21} />
          </button>
          <button className="btn-icon" title="移除" style={{ color: 'var(--up)' }} onClick={e => { e.stopPropagation(); onConfirm(item.id); }}>
            <Icon name="delete" size={21} />
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function WatchlistTable({ items, sparklines, onEdit, onDelete, onReorder, deleting: _ }: WatchlistTableProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex(i => i.id === active.id);
    const newIndex = items.findIndex(i => i.id === over.id);
    onReorder(arrayMove(items, oldIndex, newIndex));
  }

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
          <div className="ft-table-scroll">
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
                {items.map(item => (
                  <WatchlistRow
                    key={item.id}
                    item={item}
                    sparklines={sparklines}
                    onEdit={onEdit}
                    onConfirm={setConfirmId}
                  />
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--dim)' }}>
                      尚無關注清單
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </SortableContext>
      </DndContext>

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
