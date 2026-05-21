import { useState, useEffect, useMemo } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { useSnapshotStore } from '../../../stores/snapshotStore';
import { usePlanStore } from '../../../stores/planStore';
import './PanelHeader.css';

interface PanelHeaderProps {
  children?: React.ReactNode;
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
  return 0.75; // neutral 或 null
}

export default function PanelHeader({ children }: PanelHeaderProps) {
  const { cashBalance, loaded, load, update, vix, marketStateAuto } = useSnapshotStore();
  const liveStockValue = usePlanStore(s => s.liveStockValue);
  const [draft, setDraft] = useState('');

  const exposureRatio = useMemo(() => {
    const total = liveStockValue + cashBalance;
    if (total <= 0 || liveStockValue <= 0) return null;
    return liveStockValue / total;
  }, [liveStockValue, cashBalance]);

  const exposureThreshold = useMemo(() => getExposureThreshold(marketStateAuto), [marketStateAuto]);

  const exposureColor = useMemo(() => {
    if (exposureRatio === null) return 'var(--muted)';
    return exposureRatio > exposureThreshold ? 'var(--up)' : 'var(--down)';
  }, [exposureRatio, exposureThreshold]);

  const exposureTooltip = useMemo(() => {
    const thresholdPct = Math.round(exposureThreshold * 100);
    const src = marketStateAuto
      ? `依系統建議 ${MARKET_STATE_AUTO_LABEL[marketStateAuto] ?? marketStateAuto}${vix != null ? `（VIX ${vix.toFixed(1)}）` : ''}，門檻 ${thresholdPct}%`
      : `快照無資訊，預設門檻 ${thresholdPct}%`;
    return `曝險比 = 台股市值 ÷ 總資產\n${src}`;
  }, [exposureThreshold, marketStateAuto, vix]);

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
      <div className="panel-header__left">{children}</div>
      <div className="panel-header__sep" />
      <div className="panel-header__right">
        <span className="panel-header__cash-label">流動資金</span>
        <input
          className="panel-header__cash-input"
          type="text"
          inputMode="decimal"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => e.key === 'Enter' && commit()}
          placeholder="0"
        />
        {exposureRatio !== null && (
          <Tooltip.Provider delayDuration={300}>
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <span className="panel-header__exposure-badge" style={{ color: exposureColor }}>
                  曝 {Math.round(exposureRatio * 100)}%
                </span>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  className="panel-header__exposure-tooltip"
                  sideOffset={6}
                  side="bottom"
                >
                  {exposureTooltip.split('\n').map((line, i) => (
                    <span key={i} style={{ display: 'block' }}>{line}</span>
                  ))}
                  <Tooltip.Arrow style={{ fill: 'var(--border)' }} />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </Tooltip.Provider>
        )}
      </div>
    </div>
  );
}
