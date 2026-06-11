import { useEffect, useCallback, Fragment, memo } from 'react';
import type { ReactNode } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
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
import StatusBadge from '../../components/StatusBadge';
import type { BadgeVariant } from '../../components/StatusBadge';
import { resolveStrategyStatus } from '../../../utils/tradingStrategy';
import type {
  HoldingDTO, KLineDTO, StockProfileDTO, ChipDTO,
  TagDTO, AddHoldingTagPayload, UpdateHoldingTagPayload,
  OverlappingTagGroup, RebalanceSuggestion, TradingStrategyDTO,
} from '../../../types';

function fmt(n: number, decimals = 0) {
  return n.toLocaleString('zh-TW', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function ValTooltip({ label, value, color, children }: {
  label:    string;
  value:    number;
  color?:   string;
  children: ReactNode;
}) {
  const sign = value > 0 ? '+' : '';
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <span style={{ cursor: 'default' }}>{children}</span>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          sideOffset={6}
          className="ft-tooltip ft-tooltip--nowrap"
          style={{ fontFamily: 'var(--font-mono)', color: color ?? 'var(--text-value)' }}
        >
          <span style={{ color: 'var(--dim)', fontSize: 'var(--text-xs)', marginRight: 6, fontFamily: 'var(--font-sans)' }}>
            {label}
          </span>
          {sign}{fmt(value, 0)}
          <Tooltip.Arrow className="ft-tooltip__arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function StrategyBadge({ strategy, currentPrice, stockName, onClick }: {
  strategy?:    TradingStrategyDTO;
  currentPrice: number;
  stockName:    string;
  onClick:      (e: React.MouseEvent) => void;
}) {
  let label: string;
  let variant: BadgeVariant;

  if (!strategy) {
    label = '無策略'; variant = 'muted';
  } else {
    const status           = resolveStrategyStatus(strategy, currentPrice);
    const isStopLossHit    = strategy.stopLossPrice != null
      && currentPrice > 0
      && currentPrice <= strategy.stopLossPrice;

    if      (status === 'dismissed')                      { label = '忽略';      variant = 'muted';  }
    else if (status === 'expired')                        { label = 'AI 已過期'; variant = 'muted';  }
    else if (isStopLossHit)                               { label = '觸發停損'; variant = 'up';    }
    else if (status === 'triggered')                      { label = 'AI 已觸發'; variant = 'down';   }
    else                                                  { label = 'AI 觀察中'; variant = 'accent'; }
  }

  return (
    <button
      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 0 }}
      onClick={onClick}
      aria-label={`${stockName} 交易策略：${label}`}
    >
      <StatusBadge variant={variant}>{label}</StatusBadge>
    </button>
  );
}

/* ── 主列（可拖拉）── */
const HoldingRow = memo(function HoldingRow({
  h, sparkline, isExpanded, onToggle, strategy, onOpenStrategy,
}: {
  h:               HoldingDTO;
  sparkline:       number[];
  isExpanded:      boolean;
  onToggle:        (code: string) => void;
  strategy?:       TradingStrategyDTO;
  onOpenStrategy?: (stockCode: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: h.stockCode });

  const cls   = h.changePct === 0 ? 'txt-flat' : (h.isUp ? 'txt-up' : 'txt-down');
  const arrow = h.changePct === 0 ? '—' : (h.isUp ? '▲' : '▼');
  const sign  = h.changePct > 0 ? '+' : '';

  /* QUOTE-F-04：無效報價（初始載入無上輪價格）時顯示 — */
  const hasBadQuote = h.currentPrice === 0 && h.quoteStatus != null && h.quoteStatus !== 'ok';

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
            <Icon name="drag_indicator" size={24} />
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
        {hasBadQuote
          ? <span className="num-value" style={{ color: 'var(--dim)' }}>—</span>
          : <ValTooltip label="市值" value={h.currentValue}>
              <span className="num-value">{fmt(h.currentPrice, 2)}</span>
            </ValTooltip>
        }
      </td>
      <td className="right">
        {hasBadQuote
          ? <span style={{ color: 'var(--dim)', fontSize: 'var(--text-sm)' }}>—</span>
          : <ValTooltip
              label="漲跌"
              value={(h.isUp ? 1 : -1) * Math.abs(h.change) * h.shares}
              color={h.changePct === 0 ? 'var(--dim)' : (h.isUp ? 'var(--up)' : 'var(--down)')}
            >
              <span className={`change-tag ${cls}`}>
                {arrow}&nbsp;{fmt(Math.abs(h.change), 2)}&nbsp;&nbsp;{sign}{fmt(h.changePct, 2)}%
              </span>
            </ValTooltip>
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
      <td className="right num-value" style={{ color: 'var(--muted)' }}>
        <ValTooltip label="成本" value={h.totalCost}>
          <span>{fmt(h.costAvg, 2)}</span>
        </ValTooltip>
      </td>
      <td className="right num-value" style={{ color: 'var(--muted)' }}>{fmt(h.shares, 0)}</td>
      <td className="right">
        {hasBadQuote
          ? <span style={{ color: 'var(--dim)', fontSize: 'var(--text-sm)' }}>—</span>
          : <ValTooltip
              label="損益"
              value={h.unrealizedProfit}
              color={h.returnPct === 0 ? undefined : (h.returnPct > 0 ? 'var(--up)' : 'var(--down)')}
            >
              <span className={`mono ${h.returnPct === 0 ? 'txt-flat' : (h.returnPct > 0 ? 'txt-up' : 'txt-down')}`}
                style={{ fontWeight: 600 }}>
                {h.returnPct > 0 ? '+' : ''}{fmt(h.returnPct, 2)}%
              </span>
            </ValTooltip>
        }
      </td>
      <td className="center">
        <StrategyBadge
          strategy={strategy}
          currentPrice={h.currentPrice}
          stockName={h.stockName}
          onClick={e => { e.stopPropagation(); onOpenStrategy?.(h.stockCode); }}
        />
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
  onAddTx:      (code: string, name: string) => void;
  onChanged:    () => void;
  onReorder:    (newItems: HoldingDTO[]) => void;
  allTags:            TagDTO[];
  onAddHoldingTag:    (stockCode: string, payload: AddHoldingTagPayload, onSuccess?: () => void) => void;
  onUpdateHoldingTag: (stockCode: string, id: string, payload: UpdateHoldingTagPayload) => void;
  onRemoveHoldingTag: (stockCode: string, id: string, onSuccess?: () => void) => void;
  overlappingGroups?:  OverlappingTagGroup[];
  concentrationLimit?: number;
  /* Phase 3 */
  rebalanceSuggestions?: Record<string, RebalanceSuggestion>;
  rebalanceTotalAsset?:  number;
  /* F01 */
  strategies?:           Record<string, TradingStrategyDTO>;
  onOpenStrategy?:       (stockCode: string) => void;
}

export default function HoldingsTable({
  items, sparklines, klines, profiles, chips,
  expandedCode, onToggle, onExpandLoad, onAddTx, onChanged, onReorder,
  allTags, onAddHoldingTag, onUpdateHoldingTag, onRemoveHoldingTag,
  overlappingGroups, concentrationLimit,
  rebalanceSuggestions, strategies, onOpenStrategy,
}: HoldingsTableProps) {
  useEffect(() => {
    if (expandedCode) onExpandLoad(expandedCode);
  }, [expandedCode, onExpandLoad]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex(h => h.stockCode === active.id);
    const newIndex = items.findIndex(h => h.stockCode === over.id);
    onReorder(arrayMove(items, oldIndex, newIndex));
  }, [items, onReorder]);

  const COL_COUNT = 8;

  return (
    <Tooltip.Provider delayDuration={400}>
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
              <th className="center" style={{ minWidth: 100 }}>交易策略</th>
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
                    strategy={strategies?.[h.stockCode]}
                    onOpenStrategy={onOpenStrategy}
                  />
                  {isExpanded && (
                    <StockExpandPanel
                      colSpan={COL_COUNT}
                      code={h.stockCode}
                      name={h.stockName}
                      kline={klines[h.stockCode]}
                      profile={profiles[h.stockCode]}
                      chips={chips[h.stockCode]}
                      loadingExpand={loadingExpand}
                      onAddTx={onAddTx}
                      onChanged={onChanged}
                      holdingTags={h.tags}
                      allTags={allTags}
                      onAddHoldingTag={onAddHoldingTag}
                      onUpdateHoldingTag={onUpdateHoldingTag}
                      onRemoveHoldingTag={onRemoveHoldingTag}
                      overlappingGroups={overlappingGroups}
                      concentrationLimit={concentrationLimit}
                      suggestion={rebalanceSuggestions?.[h.stockCode]}
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
    </Tooltip.Provider>
  );
}
