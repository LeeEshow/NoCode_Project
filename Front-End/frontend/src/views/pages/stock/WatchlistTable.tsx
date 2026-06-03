import { useState, Fragment, useEffect, memo } from 'react';
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
import StockExpandPanel from '../../components/StockExpandPanel';
import ConfirmDialog from '../../components/ConfirmDialog';
import Icon from '../../components/Icon';
import { computeStrategyStatus } from '../../../utils/tradingStrategy';
import type { WatchlistItemDTO, KLineDTO, StockProfileDTO, ChipDTO, TradingStrategyDTO } from '../../../types';

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('zh-TW', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export interface WatchlistTableProps {
  items:        WatchlistItemDTO[];
  sparklines:   Record<string, number[]>;
  klines:       Record<string, KLineDTO[]>;
  profiles:     Record<string, StockProfileDTO>;
  chips:        Record<string, ChipDTO[]>;
  expandedCode: string | null;
  onToggle:     (stockCode: string) => void;
  onExpandLoad: (stockCode: string) => void;
  onEdit:       (item: WatchlistItemDTO) => void;
  onDelete:     (id: string) => void;
  onReorder:    (newItems: WatchlistItemDTO[]) => void;
  deleting:     boolean;
  /* F01 */
  strategies?:     Record<string, TradingStrategyDTO>;
  onOpenStrategy?: (stockCode: string) => void;
}

const WatchlistRow = memo(function WatchlistRow({
  item, sparkline, isExpanded, onToggle, onEdit, onConfirm, strategy, onOpenStrategy,
}: {
  item:            WatchlistItemDTO;
  sparkline:       number[];
  isExpanded:      boolean;
  onToggle:        (stockCode: string) => void;
  onEdit:          (item: WatchlistItemDTO) => void;
  onConfirm:       (id: string) => void;
  strategy?:       TradingStrategyDTO;
  onOpenStrategy?: (stockCode: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const isBuy = item.signal === 'buy';
  const hasStrategy = strategy != null && !strategy.dismissed;
  const isTriggered = hasStrategy && strategy
    ? computeStrategyStatus(strategy, item.currentPrice) === 'triggered'
    : false;

  const cls   = item.changePct === 0 ? 'txt-flat' : (item.isUp ? 'txt-up' : 'txt-down');
  const arrow = item.changePct === 0 ? '—' : (item.isUp ? '▲' : '▼');
  const sign  = item.changePct > 0 ? '+' : '';

  /* QUOTE-F-04：無效報價時顯示 — */
  const hasBadQuote = item.currentPrice === 0 && item.quoteStatus != null && item.quoteStatus !== 'ok';

  return (
    <tr
      ref={setNodeRef}
      onClick={() => onToggle(item.stockCode)}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        background: isExpanded ? 'rgba(255,255,255,0.02)' : undefined,
        cursor: isDragging ? 'grabbing' : undefined,
      }}
    >
      <td style={{ paddingLeft: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span
            {...attributes} {...listeners}
            onClick={e => e.stopPropagation()}
            className="drag-handle"
          >
            <Icon name="drag_indicator" size={24} />
          </span>
          <a
            href={`https://www.wantgoo.com/stock/etf/${item.stockCode}/dividend-policy/ex-dividend`}
            target="_blank"
            rel="noopener noreferrer"
            className="stock-link"
            onClick={e => e.stopPropagation()}
          >
            <div className="stock-code">{item.stockCode}</div>
            <div className="stock-name">{item.stockName.length > 12 ? item.stockName.slice(0, 12) + '...' : item.stockName}</div>
          </a>
        </div>
      </td>
      <td className="right">
        {hasBadQuote
          ? <span className="num-value" style={{ color: 'var(--dim)' }}>—</span>
          : <span className="num-value">{fmt(item.currentPrice)}</span>
        }
      </td>
      <td className="right">
        {hasBadQuote
          ? <span style={{ color: 'var(--dim)', fontSize: 'var(--text-sm)' }}>—</span>
          : <span className={`change-tag ${cls}`}>
              {arrow} {fmt(Math.abs(item.change))}&nbsp;&nbsp;{sign}{fmt(item.changePct)}%
            </span>
        }
      </td>
      <td className="center">
        {sparkline.length > 1
          ? <div style={{ width: 72, height: 24, display: 'inline-block' }}>
              <SparkLine data={sparkline} height={24} />
            </div>
          : <span style={{ fontSize: 'var(--text-sm)', color: 'var(--dim)' }}>—</span>
        }
      </td>
      <td className="right">
        <span className="mono" style={{ color: 'var(--muted)' }}>{fmt(item.targetPrice)}</span>
      </td>
      <td className="center">
        <button
          className="btn-ghost"
          style={{
            background: isBuy ? 'var(--down-bg)' : 'var(--accent-bg)',
            border: `1px solid ${isBuy ? 'var(--down-bd)' : 'var(--accent-bd)'}`,
            color: isBuy ? 'var(--down)' : 'var(--accent)',
            padding: '2px 8px',
            fontSize: 12,
            borderRadius: 4,
            cursor: 'pointer',
            position: 'relative',
          }}
          onClick={e => { e.stopPropagation(); onOpenStrategy?.(item.stockCode); }}
          aria-label={`查看 ${item.stockName} AI 交易策略`}
        >
          {isBuy ? '買進' : '觀望'}
          {hasStrategy && (
            <span style={{
              position: 'absolute', top: -4, right: -4,
              width: 6, height: 6, borderRadius: '50%',
              background: isTriggered ? 'var(--up)' : 'var(--accent)',
            }} />
          )}
        </button>
      </td>
      <td className="center">
        <div style={{ display: 'inline-flex', gap: 5 }}>
          <button className="btn-icon" title="編輯" onClick={e => { e.stopPropagation(); onEdit(item); }}>
            <Icon name="edit" size={24} />
          </button>
          <button className="btn-icon" title="移除" onClick={e => { e.stopPropagation(); onConfirm(item.id); }}>
            <Icon name="delete" size={24} />
          </button>
        </div>
      </td>
    </tr>
  );
});

export default function WatchlistTable({
  items, sparklines, klines, profiles, chips,
  expandedCode, onToggle, onExpandLoad,
  onEdit, onDelete, onReorder, deleting: _,
  strategies, onOpenStrategy,
}: WatchlistTableProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    if (expandedCode) onExpandLoad(expandedCode);
  }, [expandedCode, onExpandLoad]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex(i => i.id === active.id);
    const newIndex = items.findIndex(i => i.id === over.id);
    onReorder(arrayMove(items, oldIndex, newIndex));
  }

  const COL_COUNT = 7;

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
          <div className="ft-table-scroll">
            <table className="ft-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 120 }}>代號 / 名稱</th>
                  <th className="right" style={{ minWidth: 80 }}>即時報價</th>
                  <th className="right" style={{ minWidth: 120 }}>漲跌幅</th>
                  <th className="center" style={{ minWidth: 88 }}>90日走勢</th>
                  <th className="right" style={{ minWidth: 80 }}>目標價</th>
                  <th className="center" style={{ minWidth: 80 }}>判斷</th>
                  <th className="center" style={{ minWidth: 72 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => {
                  const isExpanded = expandedCode === item.stockCode;
                  const loadingExpand = isExpanded
                    && !klines[item.stockCode]
                    && !profiles[item.stockCode]
                    && !chips[item.stockCode];
                  return (
                    <Fragment key={item.id}>
                      <WatchlistRow
                        item={item}
                        sparkline={sparklines[item.stockCode] ?? []}
                        isExpanded={isExpanded}
                        onToggle={onToggle}
                        onEdit={onEdit}
                        onConfirm={setConfirmId}
                        strategy={strategies?.[item.stockCode]}
                        onOpenStrategy={onOpenStrategy}
                      />
                      {isExpanded && (
                        <StockExpandPanel
                          colSpan={COL_COUNT}
                          code={item.stockCode}
                          name={item.stockName}
                          kline={klines[item.stockCode]}
                          profile={profiles[item.stockCode]}
                          chips={chips[item.stockCode]}
                          loadingExpand={loadingExpand}
                          showTxTab={false}
                        />
                      )}
                    </Fragment>
                  );
                })}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={COL_COUNT} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--dim)' }}>
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
        danger
        confirmLabel="移除"
        onConfirm={() => { if (confirmId) { onDelete(confirmId); setConfirmId(null); } }}
        onCancel={() => setConfirmId(null)}
      />
    </>
  );
}
