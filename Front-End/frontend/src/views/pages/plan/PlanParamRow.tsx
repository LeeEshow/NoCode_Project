import { useState } from 'react';
import Icon from '../../components/Icon';
import type { PlanConfigDTO } from '../../../types';

const K_RISK_OPTIONS = [
  { value: 0.85, label: '藍燈',   color: '#6A8FB5' },
  { value: 0.95, label: '黃藍燈', color: '#6A9AB8' },
  { value: 1.00, label: '綠燈',   color: '#7CA88D' },
  { value: 1.05, label: '黃紅燈', color: '#B8A06A' },
  { value: 1.10, label: '紅燈',   color: '#C96A6A' },
];

const INFLATION_LABELS: Record<PlanConfigDTO['inflation'], string> = {
  low: '低通膨 1.5%', base: '基準 2.0%', high: '高通膨 3.5%',
};

interface Props {
  config:  PlanConfigDTO;
  saving:  boolean;
  onChange: (patch: Partial<PlanConfigDTO>) => void;
  onSave:  (config: PlanConfigDTO) => void;
}

const fmtNum = (n: number) => n.toLocaleString('zh-TW', { maximumFractionDigits: 0 });

export default function PlanParamRow({ config, saving, onChange, onSave }: Props) {
  const [investDraft, setInvestDraft] = useState(fmtNum(config.annualInvest));

  const selectedKRisk = K_RISK_OPTIONS.find(o => o.value === config.kRisk) ?? K_RISK_OPTIONS[2];

  const commitInvest = () => {
    const v = parseFloat(investDraft.replace(/,/g, ''));
    if (!isNaN(v) && v > 0 && v !== config.annualInvest) {
      const next = { ...config, annualInvest: v };
      onChange({ annualInvest: v });
      onSave(next);
      setInvestDraft(fmtNum(v));
    } else {
      setInvestDraft(fmtNum(config.annualInvest));
    }
  };

  const commitRBase = (raw: number) => {
    const v = Math.round(raw * 10) / 10 / 100; // % → decimal, round to 0.1%
    onChange({ rBase: v });
    onSave({ ...config, rBase: v });
  };

  return (
    <div className="plan-param-row">

      {/* 每年投入 */}
      <div className="plan-card" style={{ minWidth: 150, maxWidth: 150 }}>
        <div className="plan-card__label">每年投入</div>
        <input
          className="plan-card-input"
          type="text"
          inputMode="numeric"
          value={investDraft}
          onChange={e => setInvestDraft(e.target.value)}
          onBlur={commitInvest}
          onKeyDown={e => e.key === 'Enter' && commitInvest()}
        />
        <div className="plan-card__sub">元 / 年</div>
      </div>

      {/* 基礎殖利率 */}
      <div className="plan-card" style={{ minWidth: 150, maxWidth: 150 }}>
        <div className="plan-card__label">基礎殖利率 r</div>
        <div className="plan-card__value">{(config.rBase * 100).toFixed(1)} %</div>
        <input
          className="plan-slider"
          type="range"
          min={5} max={15} step={0.5}
          value={config.rBase * 100}
          onChange={e => onChange({ rBase: parseFloat(e.target.value) / 100 })}
          onMouseUp={e => commitRBase(parseFloat((e.target as HTMLInputElement).value))}
          onTouchEnd={e => commitRBase(parseFloat((e.target as HTMLInputElement).value))}
        />
        <div className="plan-card__sub">範圍 5 – 15 %</div>
      </div>

      {/* 通膨情境 */}
      <div className="plan-card" style={{ minWidth: 150, maxWidth: 150 }}>
        <div className="plan-card__label">通膨情境</div>
        <div className="plan-toggle-group">
          {(['low', 'base', 'high'] as const).map(opt => (
            <button
              key={opt}
              className={`plan-toggle-btn${config.inflation === opt ? ' active' : ''}`}
              onClick={() => { onChange({ inflation: opt }); onSave({ ...config, inflation: opt }); }}
            >
              {opt === 'low' ? '低' : opt === 'base' ? '基準' : '高'}
            </button>
          ))}
        </div>
        <div className="plan-card__sub">{INFLATION_LABELS[config.inflation]}</div>
      </div>

      {/* 景氣係數 */}
      <div className="plan-card" style={{ minWidth: 150, maxWidth: 150 }}>
        <div className="plan-card__label">景氣係數 k</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: selectedKRisk.color, flexShrink: 0 }} />
          <span className="plan-card__value" style={{ fontSize: 'var(--text-base)' }}>
            {selectedKRisk.label}
          </span>
        </div>
        <select
          className="plan-select"
          value={config.kRisk}
          onChange={e => {
            const v = parseFloat(e.target.value);
            onChange({ kRisk: v });
            onSave({ ...config, kRisk: v });
          }}
        >
          {K_RISK_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>
              {o.label}（× {o.value}）
            </option>
          ))}
        </select>
      </div>

      {/* 起始年份 + 計畫年數 */}
      <div className="plan-card" style={{ minWidth: 150, maxWidth: 150 }}>
        <div className="plan-card__label">起始年份</div>
        <div className="plan-year-ctrl">
          <button
            className="plan-year-btn"
            onClick={() => {
              const v = config.startYear - 1;
              onChange({ startYear: v });
              onSave({ ...config, startYear: v });
            }}
          >
            <Icon name="chevron_left" size={14} />
          </button>
          <span className="plan-card__value">{config.startYear}</span>
          <button
            className="plan-year-btn"
            onClick={() => {
              const v = config.startYear + 1;
              onChange({ startYear: v });
              onSave({ ...config, startYear: v });
            }}
          >
            <Icon name="chevron_right" size={14} />
          </button>
        </div>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 2 }}>
          <div className="plan-card__label">計畫年數</div>
          <div className="plan-card__value">30 <span className="plan-card__sub">年</span></div>
        </div>
      </div>

    </div>
  );
}
