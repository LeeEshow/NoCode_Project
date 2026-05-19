import PanelHeader from '../components/PanelHeader';
import LoadingPanel from '../components/LoadingPanel';
import Icon from '../components/Icon';
import { usePlanViewModel } from '../../viewmodels/usePlanViewModel';
import PlanParamRow from './plan/PlanParamRow';
import PlanTable from './plan/PlanTable';
import './plan/plan.css';

function fmt(n: number, d = 0) {
  return n.toLocaleString('zh-TW', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export default function PlanPage() {
  const vm = usePlanViewModel();

  const handleInvestOverride = (yearIndex: number, amount: number) => {
    vm.setYearOverride(yearIndex, amount);
    if (vm.config) vm.saveConfig({ ...vm.config, overrides: { ...vm.config.overrides, [String(yearIndex)]: amount } });
  };

  const handleReinvestChange = (amount: number) => {
    vm.setCurrentYearReinvest(amount);
    if (vm.config) vm.saveConfig({ ...vm.config, currentYearReinvest: amount });
  };

  /* 取最新有執行資料的年度（current 或最後一筆 past） */
  const latestRow = vm.rows.find(r => r.status === 'current')
    ?? [...vm.rows].reverse().find(r => r.status === 'past' && r.returnValue != null);

  const hasReturn  = latestRow != null && latestRow.returnValue != null;
  const isOnTarget = hasReturn && latestRow!.returnValue! >= latestRow!.expectedProfit;
  const returnColor = hasReturn
    ? (latestRow!.returnValue! >= 0 ? 'var(--up)' : 'var(--down)')
    : 'var(--dim)';

  return (
    <div style={{ minWidth: 0 }}>
      <PanelHeader>
        {latestRow && (
          <>
            {/* 年度 */}
            <div className="ph-stat" style={{ minWidth: 80 }}>
              <span className="ph-stat__label">執行年度</span>
              <span className="ph-stat__value">{latestRow.calendarYear}</span>
            </div>

            {/* 報酬率 */}
            <div className="ph-stat">
              <span className="ph-stat__label">年度報酬率</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span className="ph-stat__value" style={{ color: returnColor }}>
                  {hasReturn
                    ? `${latestRow!.returnValue! >= 0 ? '+' : ''}${fmt(latestRow!.returnValue!)}`
                    : '—'}
                </span>
                {hasReturn && latestRow!.returnPct != null && (
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-sm)',
                    color: returnColor,
                  }}>
                    {latestRow!.returnPct >= 0 ? '+' : ''}{(latestRow!.returnPct * 100).toFixed(2)}%
                  </span>
                )}
              </div>
            </div>

            {/* 達標指示 */}
            {hasReturn && (
              <div className="ph-stat" style={{ minWidth: 80 }}>
                <span className="ph-stat__label">計畫達標</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Icon
                    name={isOnTarget ? 'check_circle' : 'cancel'}
                    size={22}
                    style={{ color: isOnTarget ? 'var(--accent)' : 'var(--up)' }}
                  />
                  <span className="ph-stat__value" style={{
                    fontSize: 'var(--text-base)',
                    color: isOnTarget ? 'var(--accent)' : 'var(--up)',
                  }}>
                    {isOnTarget ? '達標' : '未達標'}
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </PanelHeader>

      <div style={{ padding: '16px 28px 28px' }}>
        {vm.config && (
          <PlanParamRow
            config={vm.config}
            saving={vm.saving}
            onChange={vm.updateConfig}
            onSave={vm.saveConfig}
          />
        )}

        <div className="ft-panel">
          {vm.loading
            ? <LoadingPanel loading rows={8} />
            : (
              <PlanTable
                rows={vm.rows}
                saving={vm.saving}
                startYear={vm.config?.startYear ?? new Date().getFullYear()}
                onInvestOverride={handleInvestOverride}
                onReinvestChange={handleReinvestChange}
              />
            )
          }
        </div>
      </div>
    </div>
  );
}
