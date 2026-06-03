import { useState, useEffect, useMemo, useRef } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { useSnapshotStore } from '../../../stores/snapshotStore';
import { usePlanStore } from '../../../stores/planStore';
import Icon from '../Icon';
import './PanelHeader.css';

interface PanelHeaderProps {
  children?: React.ReactNode;
  exposureMode?: 'stock' | 'forex' | 'investment';
  foreignAssetTwd?: number;  // override planStore.forexValue（AssetsPage 傳入 vm.totalTwd）
}

const MARKET_STATE_AUTO_LABEL: Record<string, string> = {
  'risk-on':       'Risk-On',
  'risk-off':      'Risk-Off',
  'neutral':       '中性',
  'liquidity-dry': '流動性枯竭',
};

function getExposureThreshold(marketStateAuto: string | null): number {
  if (marketStateAuto === 'risk-on')  return 0.85;
  if (marketStateAuto === 'risk-off' || marketStateAuto === 'liquidity-dry') return 0.55;
  return 0.75;
}

function fmtPct(ratio: number) {
  return (ratio * 100).toFixed(1) + '%';
}

export default function PanelHeader({
  children,
  exposureMode = 'stock',
  foreignAssetTwd,
}: PanelHeaderProps) {
  const { cashBalance, loaded, load, update, vix, marketStateAuto } = useSnapshotStore();
  const liveStockValue = usePlanStore(s => s.liveStockValue);
  const forexValue     = usePlanStore(s => s.forexValue);
  const [draft, setDraft] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, startX: 0, scrollLeft: 0 });

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    drag.current = { active: true, startX: e.pageX, scrollLeft: el.scrollLeft };
    el.style.cursor = 'grabbing';
    el.style.userSelect = 'none';
  };

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!drag.current.active) return;
    const dx = e.pageX - drag.current.startX;
    if (scrollRef.current) scrollRef.current.scrollLeft = drag.current.scrollLeft - dx;
  };

  const stopDrag = () => {
    if (!drag.current.active) return;
    drag.current.active = false;
    if (scrollRef.current) {
      scrollRef.current.style.cursor = '';
      scrollRef.current.style.userSelect = '';
    }
  };

  /* 外幣台幣值：優先用 prop，fallback planStore.forexValue */
  const resolvedForeignTwd = foreignAssetTwd ?? forexValue;

  const totalAssets = liveStockValue + resolvedForeignTwd + cashBalance;

  /* 各曝險指標 */
  const { stockRatio, forexRatio, investRatio, cashRatio } = useMemo(() => {
    if (totalAssets <= 0) return { stockRatio: 0, forexRatio: 0, investRatio: 0, cashRatio: 0 };
    return {
      stockRatio:  liveStockValue / totalAssets,
      forexRatio:  resolvedForeignTwd / totalAssets,
      investRatio: (liveStockValue + resolvedForeignTwd) / totalAssets,
      cashRatio:   cashBalance / totalAssets,
    };
  }, [liveStockValue, resolvedForeignTwd, cashBalance, totalAssets]);

  /* 徽章主指標 */
  const primaryRatio = useMemo(() => {
    if (totalAssets <= 0) return null;
    if (exposureMode === 'forex')      return forexRatio;
    if (exposureMode === 'investment') return investRatio;
    return stockRatio;
  }, [exposureMode, stockRatio, forexRatio, investRatio, totalAssets]);

  const exposureThreshold = getExposureThreshold(marketStateAuto);

  const exposureColor = primaryRatio === null ? 'var(--muted)'
    : primaryRatio > exposureThreshold ? 'var(--up)' : 'var(--down)';

  const exposureTooltip = useMemo(() => {
    const thresholdPct = Math.round(exposureThreshold * 100);
    const stateSrc = marketStateAuto
      ? `${MARKET_STATE_AUTO_LABEL[marketStateAuto] ?? marketStateAuto}${vix != null ? `（VIX ${vix.toFixed(1)}）` : ''}`
      : '快照無市場狀態資訊';
    const fmtN = (n: number) => n.toLocaleString('zh-TW', { maximumFractionDigits: 0 });
    return [
      `股票曝險   ${fmtPct(stockRatio)}（台股市值 ÷ 總資產）`,
      `外幣曝險   ${fmtPct(forexRatio)}（外幣資產 ÷ 總資產）`,
      `投資曝險   ${fmtPct(investRatio)}（（台股+外幣）÷ 總資產）`,
      `現金比     ${fmtPct(cashRatio)}（現金 ÷ 總資產）`,
      `─────────────────────`,
      `總資產     NT$${fmtN(totalAssets)}`,
      `警戒門檻   ${thresholdPct}%（${stateSrc}）`,
    ];
  }, [stockRatio, forexRatio, investRatio, cashRatio, totalAssets, exposureThreshold, marketStateAuto, vix]);

  useEffect(() => { load(); }, [load]);

  const fmtNum = (n: number) => n > 0 ? n.toLocaleString('zh-TW', { maximumFractionDigits: 0 }) : '';

  useEffect(() => {
    if (loaded) setDraft(fmtNum(cashBalance));
  }, [cashBalance, loaded]);

  const commit = () => {
    const v = parseFloat(draft.replace(/,/g, ''));
    if (!isNaN(v) && v >= 0) {
      update(v);
      setDraft(fmtNum(v));
    } else {
      setDraft(fmtNum(cashBalance));
    }
  };

  return (
    <div className="panel-header">
      <div
        className="panel-header__left"
        ref={scrollRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
      >{children}</div>
      <div className="panel-header__sep" />
      <div className="panel-header__right">
        <input
          id="panel-cash-input"
          className="panel-header__cash-input"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          name="cash-balance"
          aria-label="流動部位"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => e.key === 'Enter' && commit()}
          placeholder="流動部位"
        />
        {primaryRatio !== null && (
          <Tooltip.Provider delayDuration={300}>
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <span
                  className="panel-header__exposure-badge"
                  style={{ color: exposureColor, display: 'flex', alignItems: 'center', gap: 3 }}
                  tabIndex={0}
                  aria-label={`曝險比 ${Math.round(primaryRatio * 100)}%`}
                >
                  <Icon name="speed" size={14} aria-hidden="true" />
                  {Math.round(primaryRatio * 100)}%
                </span>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  className="panel-header__exposure-tooltip"
                  sideOffset={4}
                  side="bottom"
                >
                  {exposureTooltip.map((line, i) => (
                    <span key={i} style={{ display: 'block' }}>{line}</span>
                  ))}
                  <Tooltip.Arrow style={{ fill: '#232b36' }} />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </Tooltip.Provider>
        )}
      </div>
    </div>
  );
}
