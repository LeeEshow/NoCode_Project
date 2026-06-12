import './WatchlistCardGrid.css';
import { resolveStrategyStatus } from '../../../utils/tradingStrategy';
import type { WatchlistItemDTO, TradingStrategyDTO } from '../../../types';

function fmt(n: number) {
  return n.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface WatchlistCardGridProps {
  items:            WatchlistItemDTO[];
  groupOrder:       string[];
  collapsedGroups:  Set<string>;
  strategies?:      Record<string, TradingStrategyDTO>;
  onOpenStrategy?:  (stockCode: string) => void;
}

export default function WatchlistCardGrid({ items, groupOrder, collapsedGroups, strategies, onOpenStrategy }: WatchlistCardGridProps) {
  const hasGroups = items.some(i => i.group);

  if (!hasGroups) {
    return (
      <div className="wl-card-area">
        <div className="wl-card-grid">
          {items.map(item => (
            <WatchlistCard
              key={item.id}
              item={item}
              strategy={strategies?.[item.stockCode]}
              onOpenStrategy={onOpenStrategy}
            />
          ))}
        </div>
      </div>
    );
  }

  /* 依 groupOrder 分段，未分組歸入最後的 '未分組' bucket */
  const buckets = new Map<string, WatchlistItemDTO[]>();
  for (const g of groupOrder) buckets.set(g, []);
  for (const item of items) {
    const g = item.group ?? '未分組';
    if (!buckets.has(g)) buckets.set(g, []);
    buckets.get(g)!.push(item);
  }

  return (
    <div className="wl-card-area">
      {[...buckets.entries()].map(([groupName, groupItems]) => {
        if (groupItems.length === 0) return null;
        if (collapsedGroups.has(groupName)) return null;
        const isUngrouped = groupName === '未分組';
        return (
          <div key={groupName} className="wl-card-section">
            {!isUngrouped && (
              <div className="wl-card-group-label">{groupName}</div>
            )}
            <div className="wl-card-grid">
              {groupItems.map(item => (
                <WatchlistCard
                  key={item.id}
                  item={item}
                  strategy={strategies?.[item.stockCode]}
                  onOpenStrategy={onOpenStrategy}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WatchlistCard({
  item, strategy, onOpenStrategy,
}: {
  item:            WatchlistItemDTO;
  strategy?:       TradingStrategyDTO;
  onOpenStrategy?: (stockCode: string) => void;
}) {
  const cls   = item.changePct === 0 ? 'txt-flat' : (item.isUp ? 'txt-up' : 'txt-down');
  const arrow = item.changePct === 0 ? '—' : (item.isUp ? '▲' : '▼');
  const sign  = item.changePct > 0 ? '+' : '';
  const hasBadQuote = item.currentPrice === 0 && item.quoteStatus != null && item.quoteStatus !== 'ok';

  const hasStrategy = strategy != null && !strategy.dismissed;
  const stratStatus = hasStrategy ? resolveStrategyStatus(strategy, item.currentPrice) : null;
  const showDot     = hasStrategy && stratStatus !== 'expired';
  const dotColor    = stratStatus === 'triggered' ? 'var(--up)' : 'var(--accent)';

  function handleClick() {
    if (hasStrategy) onOpenStrategy?.(item.stockCode);
  }

  return (
    <div
      className="wl-card"
      onClick={handleClick}
      style={{ cursor: hasStrategy ? 'pointer' : 'default' }}
    >
      {showDot && (
        <span
          className="wl-card-dot"
          style={{ background: dotColor }}
          aria-label="有 AI 交易策略"
        />
      )}
      <div className="wl-card-header">
        <span className="wl-card-code">{item.stockCode}</span>
        <span className="wl-card-name">{item.stockName}</span>
      </div>
      <div className="wl-card-price">
        {hasBadQuote
          ? <span style={{ color: 'var(--dim)' }}>—</span>
          : fmt(item.currentPrice)
        }
      </div>
      <div className={`wl-card-change ${hasBadQuote ? '' : cls}`}>
        {hasBadQuote
          ? <span style={{ color: 'var(--dim)' }}>—</span>
          : <>{arrow} {fmt(Math.abs(item.change))}&nbsp;&nbsp;{sign}{fmt(item.changePct)}%</>
        }
      </div>
    </div>
  );
}
