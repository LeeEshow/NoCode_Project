import { useState, Fragment, useEffect, useMemo, memo, ViewTransition, startTransition } from 'react';
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
import { resolveStrategyStatus } from '../../../utils/tradingStrategy';
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
  onReorderWithGroup: (newItems: WatchlistItemDTO[], movedId: string, newGroup: string | undefined) => void;
  onToggleGroup: (groupName: string) => void;
  onRenameGroup: (oldName: string, newName: string) => void;
  onDeleteGroup: (groupName: string) => void;
  collapsedGroups: Set<string>;
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
  const stratStatus = hasStrategy ? resolveStrategyStatus(strategy, item.currentPrice) : null;

  const cls   = item.changePct === 0 ? 'txt-flat' : (item.isUp ? 'txt-up' : 'txt-down');
  const arrow = item.changePct === 0 ? '—' : (item.isUp ? '▲' : '▼');
  const sign  = item.changePct > 0 ? '+' : '';

  const hasBadQuote = item.currentPrice === 0 && item.quoteStatus != null && item.quoteStatus !== 'ok';

  return (
    <tr
      ref={setNodeRef}
      onClick={() => startTransition(() => onToggle(item.stockCode))}
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
            position: 'relative',
          }}
          onClick={e => { e.stopPropagation(); if (hasStrategy) onOpenStrategy?.(item.stockCode); }}
          aria-label={hasStrategy ? `查看 ${item.stockName} AI 交易策略` : undefined}
        >
          {isBuy ? '買進' : '觀望'}
          {hasStrategy && stratStatus !== 'expired' && (
            <span style={{
              position: 'absolute', top: -4, right: -4,
              width: 6, height: 6, borderRadius: '50%',
              background: stratStatus === 'triggered' ? 'var(--up)' : 'var(--accent)',
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
  onEdit, onDelete, onReorder, onReorderWithGroup,
  onToggleGroup, onRenameGroup, onDeleteGroup, collapsedGroups,
  deleting: _,
  strategies, onOpenStrategy,
}: WatchlistTableProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [renamingGroup, setRenamingGroup] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    if (expandedCode) onExpandLoad(expandedCode);
  }, [expandedCode, onExpandLoad]);

  /* 是否啟用分組模式 */
  const hasGroups = useMemo(() => items.some(i => i.group), [items]);

  /* 依分組分段，未分組排最後 */
  const grouped = useMemo(() => {
    if (!hasGroups) return null;
    const map = new Map<string, WatchlistItemDTO[]>();
    for (const item of items) {
      const g = item.group ?? '未分組';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(item);
    }
    const result: Array<{ group: string; items: WatchlistItemDTO[] }> = [];
    for (const [g, its] of map) {
      if (g !== '未分組') result.push({ group: g, items: its });
    }
    if (map.has('未分組')) result.push({ group: '未分組', items: map.get('未分組')! });
    return result;
  }, [items, hasGroups]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeItem = items.find(i => i.id === active.id);
    const overItem   = items.find(i => i.id === over.id);
    if (!activeItem || !overItem) return;
    const oldIndex = items.findIndex(i => i.id === active.id);
    const newIndex = items.findIndex(i => i.id === over.id);
    const newItems = arrayMove(items, oldIndex, newIndex);
    if (activeItem.group !== overItem.group) {
      onReorderWithGroup(newItems, String(active.id), overItem.group);
    } else {
      onReorder(newItems);
    }
  }

  function commitRename() {
    if (!renamingGroup) return;
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== renamingGroup) onRenameGroup(renamingGroup, trimmed);
    setRenamingGroup(null);
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
                {grouped
                  ? grouped.map(({ group: groupName, items: groupItems }) => {
                      const isCollapsed = collapsedGroups.has(groupName);
                      const isUngrouped = groupName === '未分組';
                      return (
                        <Fragment key={groupName}>
                          {/* 分組 header row */}
                          <tr style={{ background: 'var(--surface)', userSelect: 'none' }}>
                            <td colSpan={COL_COUNT} style={{ padding: '4px 8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  {renamingGroup === groupName ? (
                                    <input
                                      autoFocus
                                      value={renameValue}
                                      onChange={e => setRenameValue(e.target.value)}
                                      onBlur={commitRename}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') commitRename();
                                        if (e.key === 'Escape') setRenamingGroup(null);
                                      }}
                                      onClick={e => e.stopPropagation()}
                                      style={{
                                        background: 'var(--panel)', border: '1px solid var(--accent-bd)',
                                        borderRadius: 'var(--radius-sm)', color: 'var(--text)',
                                        padding: '2px 6px', fontSize: 'var(--text-sm)', width: 120,
                                      }}
                                    />
                                  ) : (
                                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--muted)' }}>
                                      {groupName}
                                    </span>
                                  )}
                                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--dim)' }}>
                                    {groupItems.length}
                                  </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                  {!isUngrouped && (
                                    <>
                                      <button
                                        className="btn-icon"
                                        aria-label={`重新命名分組 ${groupName}`}
                                        title="重新命名"
                                        onClick={e => {
                                          e.stopPropagation();
                                          setRenamingGroup(groupName);
                                          setRenameValue(groupName);
                                        }}
                                      >
                                        <Icon name="edit" size={16} />
                                      </button>
                                      <button
                                        className="btn-icon"
                                        aria-label={`刪除分組 ${groupName}`}
                                        title="刪除組別（移至未分組）"
                                        onClick={e => { e.stopPropagation(); onDeleteGroup(groupName); }}
                                      >
                                        <Icon name="delete" size={16} />
                                      </button>
                                    </>
                                  )}
                                  <button
                                    className="btn-icon"
                                    aria-label={isCollapsed ? `展開 ${groupName}` : `收折 ${groupName}`}
                                    aria-expanded={!isCollapsed}
                                    onClick={e => { e.stopPropagation(); onToggleGroup(groupName); }}
                                  >
                                    <Icon name={isCollapsed ? 'expand_more' : 'expand_less'} size={20} />
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                          {/* 分組 item rows */}
                          {!isCollapsed && groupItems.map(item => {
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
                                  <ViewTransition enter="slide-up" default="none">
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
                                  </ViewTransition>
                                )}
                              </Fragment>
                            );
                          })}
                        </Fragment>
                      );
                    })
                  : items.map(item => {
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
                            <ViewTransition enter="slide-up" default="none">
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
                            </ViewTransition>
                          )}
                        </Fragment>
                      );
                    })
                }
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
