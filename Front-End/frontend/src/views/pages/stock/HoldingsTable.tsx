import { useEffect, Fragment, memo } from 'react';
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
import Icon from '../../components/Icon';
import type { HoldingDTO, KLineDTO, StockProfileDTO, ChipDTO } from '../../../types';

function fmt(n: number, decimals = 0) {
  return n.toLocaleString('zh-TW', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/* ── 操作按鈕 ── */
function OpBtn({
  title, accent, onClick, children,
}: { title: string; accent?: boolean; onClick: (e: React.MouseEvent) => void; children: React.ReactNode }) {
  return (
    <button
      className={`btn-icon${accent ? ' accent' : ''}`}
      title={title}
      onClick={e => { e.stopPropagation(); onClick(e); }}
    >
      {children}
    </button>
  );
}

/* ── 主列（可拖拉）── */
const HoldingRow = memo(function HoldingRow({
  h, sparkline, isExpanded,
  onToggle, onHistory, onAddTx,
}: {
  h:          HoldingDTO;
  sparkline:  number[];
  isExpanded: boolean;
  onToggle:   (code: string) => void;
  onHistory:  (code: string, name: string) => void;
  onAddTx:    (code: string, name: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: h.stockCode });

  const cls = h.changePct === 0 ? 'txt-flat' : (h.isUp ? 'txt-up' : 'txt-down');
  const arrow = h.changePct === 0 ? '—' : (h.isUp ? '▲' : '▼');
  const sign  = h.changePct > 0 ? '+' : '';

  return (
    <tr
      ref={setNodeRef}
      onClick={() => onToggle(h.stockCode)}
      style={{
        background: isExpanded ? 'rgba(255,255,255,0.02)' : undefined,
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
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
            <Icon name="drag_indicator" size={18} />
          </span>
          <a
            href={`https://www.wantgoo.com/stock/etf/${h.stockCode}/dividend-policy/ex-dividend`}
            target="_blank"
            rel="noopener noreferrer"
            className="stock-link"
            onClick={e => e.stopPropagation()}
          >
            <div className="stock-code">{h.stockCode}</div>
            <div className="stock-name">{h.stockName.length > 12 ? h.stockName.slice(0, 12) + '...' : h.stockName}</div>
          </a>
        </div>
      </td>
      <td className="right">
        <span className="num-value">{fmt(h.currentPrice, 2)}</span>
      </td>
      <td className="right">
        <span className={`change-tag ${cls}`}>
          {arrow}&nbsp;{fmt(Math.abs(h.change), 2)}&nbsp;&nbsp;{sign}{fmt(h.changePct, 2)}%
        </span>
      </td>
      <td className="center">
        {sparkline.length > 1
          ? <div style={{ width: 72, height: 24, display: 'inline-block' }}>
              <SparkLine data={sparkline} height={24} />
            </div>
          : <span style={{ fontSize: 'var(--text-sm)', color: 'var(--dim)' }}>—</span>
        }
      </td>
      <td className="right num-value" style={{ color: 'var(--muted)' }}>{fmt(h.costAvg, 2)}</td>
      <td className="right num-value" style={{ color: 'var(--muted)' }}>{fmt(h.shares, 0)}</td>
      <td className="right">
        <span className={`mono ${h.returnPct === 0 ? 'txt-flat' : (h.returnPct > 0 ? 'txt-up' : 'txt-down')}`}
          style={{ fontWeight: 600 }}>
          {h.returnPct > 0 ? '+' : ''}{fmt(h.returnPct, 2)}%
        </span>
      </td>
      <td className="center">
        <div style={{ display: 'inline-flex', gap: 5 }}>
          <OpBtn title="交易紀錄" onClick={() => onHistory(h.stockCode, h.stockName)}>
            <Icon name="history" size={21} />
          </OpBtn>
          <OpBtn title="新增交易" accent onClick={() => onAddTx(h.stockCode, h.stockName)}>
            <Icon name="add" size={21} />
          </OpBtn>
        </div>
      </td>
    </tr>
  );
});

/* ── 主元件 ── */
export interface HoldingsTableProps {
  items:        HoldingDTO[];
  sparklines:   Record<string, number[]>;
  klines:       Record<string, KLineDTO[]>;
  profiles:     Record<string, StockProfileDTO>;
  chips:        Record<string, ChipDTO[]>;
  expandedCode: string | null;
  onToggle:     (code: string) => void;
  onExpandLoad: (code: string) => void;
  onHistory:    (code: string, name: string) => void;
  onAddTx:      (code: string, name: string) => void;
  onReorder:    (newItems: HoldingDTO[]) => void;
}

export default function HoldingsTable({
  items, sparklines, klines, profiles, chips,
  expandedCode, onToggle, onExpandLoad, onHistory, onAddTx, onReorder,
}: HoldingsTableProps) {
  useEffect(() => {
    if (expandedCode) onExpandLoad(expandedCode);
  }, [expandedCode, onExpandLoad]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex(h => h.stockCode === active.id);
    const newIndex = items.findIndex(h => h.stockCode === over.id);
    onReorder(arrayMove(items, oldIndex, newIndex));
  }

  const COL_COUNT = 8;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map(h => h.stockCode)} strategy={verticalListSortingStrategy}>
        <div className="ft-table-scroll">
        <table className="ft-table">
          <thead>
            <tr>
              <th>代號 / 名稱</th>
              <th className="right">即時報價</th>
              <th className="right">漲跌幅</th>
              <th className="center">90日走勢</th>
              <th className="right">成本均價</th>
              <th className="right">持有（股）</th>
              <th className="right">損益 %</th>
              <th className="center">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map(h => {
              const isExpanded = expandedCode === h.stockCode;
              const loadingExpand = isExpanded
                && !klines[h.stockCode]
                && !profiles[h.stockCode]
                && !chips[h.stockCode];
              return (
                <Fragment key={h.stockCode}>
                  <HoldingRow
                    h={h}
                    sparkline={sparklines[h.stockCode] ?? []}
                    isExpanded={isExpanded}
                    onToggle={onToggle}
                    onHistory={onHistory}
                    onAddTx={onAddTx}
                  />
                  {isExpanded && (
                    <StockExpandPanel
                      colSpan={COL_COUNT}
                      code={h.stockCode}
                      kline={klines[h.stockCode]}
                      profile={profiles[h.stockCode]}
                      chips={chips[h.stockCode]}
                      loadingExpand={loadingExpand}
                    />
                  )}
                </Fragment>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={COL_COUNT} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--dim)' }}>
                  尚無持股資料
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </SortableContext>
    </DndContext>
  );
}
