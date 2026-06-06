import * as Tooltip from '@radix-ui/react-tooltip';
import PanelHeader from '../components/PanelHeader';
import LoadingPanel from '../components/LoadingPanel';
import { usePlanViewModel } from '../../viewmodels/usePlanViewModel';
import PlanParamRow from './plan/PlanParamRow';
import PlanTable from './plan/PlanTable';
import './plan/plan.css';

function fmt(n: number, d = 0) {
  return n.toLocaleString('zh-TW', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtWan(n: number): string {
  const wan = n / 10000;
  return (wan >= 0 ? '+' : '') + wan.toFixed(1) + '萬';
}

function TooltipLine({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <span style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}>
        {value}{sub && <span style={{ color: 'var(--dim)', marginLeft: 4 }}>{sub}</span>}
      </span>
    </span>
  );
}

function TooltipDivider() {
  return <span style={{ display: 'block', borderTop: '1px solid var(--border)', margin: '5px 0' }} />;
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
  const returnColor = hasReturn
    ? (latestRow!.returnValue! >= 0 ? 'var(--up)' : 'var(--down)')
    : 'var(--dim)';

  const goal = vm.goalResult;
  const progressColor =
    goal?.progressStatus === 'ahead'  ? 'var(--accent)' :
    goal?.progressStatus === 'behind' ? 'var(--up)'     : 'var(--muted)';

  return (
    <div style={{ minWidth: 0 }}>
      <PanelHeader exposureMode="investment">
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

            {/* 今年進度 */}
            {goal && (
              <Tooltip.Provider delayDuration={300}>
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <div className="ph-stat" style={{ cursor: 'help' }} tabIndex={0}>
                      <span className="ph-stat__label">今年進度</span>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <span className="ph-stat__value" style={{ color: progressColor }}>
                          {(goal.progressRatio * 100).toFixed(1)}%
                        </span>
                        <span style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 'var(--text-sm)',
                          color: goal.gapAmount >= 0 ? 'var(--accent)' : 'var(--up)',
                        }}>
                          {fmtWan(goal.gapAmount)}
                        </span>
                      </div>
                    </div>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content
                      className="ft-tooltip ft-tooltip--wide"
                      sideOffset={-8}
                      side="bottom"
                      style={{ minWidth: 280 }}
                    >
                      <TooltipLine label="起始值" value={fmt(goal.startValue)} sub="去年實際" />
                      <TooltipLine label="今年目標" value={fmt(goal.yearTarget)} sub="計畫年末" />
                      <TooltipDivider />
                      <TooltipLine label="年度進度" value={`${goal.elapsedDays} 天`} sub={`${goal.elapsedPct}% / 365`} />
                      <TooltipLine label="今日期望" value={fmt(goal.expectedToday)} sub="線性插值" />
                      <TooltipLine label="實際資產" value={fmt(goal.currentValue)} />
                      <TooltipDivider />
                      <TooltipLine
                        label="進度比"
                        value={`${(goal.progressRatio * 100).toFixed(1)}%`}
                        sub={`= 實際 ÷ 今日期望`}
                      />
                      <TooltipLine
                        label="差距"
                        value={fmtWan(goal.gapAmount)}
                        sub={`= 實際 − 今日期望`}
                      />
                      <Tooltip.Arrow style={{ fill: '#1a1d22' }} />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              </Tooltip.Provider>
            )}

            {/* 30年所需報酬 */}
            {goal && goal.yearsRemaining > 0 && (
              <Tooltip.Provider delayDuration={300}>
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <div className="ph-stat" style={{ cursor: 'help' }} tabIndex={0}>
                      <span className="ph-stat__label">30年所需報酬</span>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <span className="ph-stat__value" style={{
                          color: goal.isAchievable ? 'var(--accent)' : 'var(--up)',
                        }}>
                          {(goal.requiredReturn * 100).toFixed(1)}% / 年
                        </span>
                        <span style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 'var(--text-sm)',
                          color: 'var(--dim)',
                        }}>
                          剩 {goal.yearsRemaining} 年
                        </span>
                      </div>
                    </div>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content
                      className="ft-tooltip ft-tooltip--wide"
                      sideOffset={-8}
                      side="bottom"
                      style={{ minWidth: 280 }}
                    >
                      <TooltipLine label="第30年目標" value={fmt(goal.targetValue)} sub="計畫累積" />
                      <TooltipLine label="目前資產" value={fmt(goal.currentValue)} />
                      <TooltipLine label="剩餘年數" value={`${goal.yearsRemaining} 年`} />
                      <TooltipDivider />
                      <TooltipLine
                        label="所需年化"
                        value={`${(goal.requiredReturn * 100).toFixed(1)}%`}
                        sub={`= (目標 ÷ 現值)^(1/${goal.yearsRemaining}) − 1`}
                      />
                      <TooltipLine
                        label="計畫設定"
                        value={`${(goal.rNominal * 100).toFixed(1)}%`}
                        sub="rBase × kRisk"
                      />
                      <Tooltip.Arrow style={{ fill: '#1a1d22' }} />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              </Tooltip.Provider>
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
