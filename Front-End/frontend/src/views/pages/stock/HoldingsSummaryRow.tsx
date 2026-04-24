import type { HoldingsSummary } from '../../../viewmodels/useHoldingsViewModel';

function fmt(n: number, decimals = 0) {
  return n.toLocaleString('zh-TW', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function signClass(n: number) {
  if (n > 0) return 'txt-up';
  if (n < 0) return 'txt-down';
  return 'txt-flat';
}

function signPrefix(n: number) {
  return n > 0 ? '+' : '';
}

interface Props { summary: HoldingsSummary; }

export default function HoldingsSummaryRow({ summary }: Props) {
  const { totalUnrealized, totalReturnPct, totalDailyChange } = summary;

  return (
    <div style={{
      display: 'flex',
      gap: 0,
      padding: '8px 16px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--panel)',
    }}>
      <SummaryItem
        label="未實現損益"
        value={`${signPrefix(totalUnrealized)}${fmt(totalUnrealized)}`}
        cls={signClass(totalUnrealized)}
      />
      <SummaryItem
        label="報酬率"
        value={`${signPrefix(totalReturnPct)}${fmt(totalReturnPct, 2)}%`}
        cls={signClass(totalReturnPct)}
      />
      <SummaryItem
        label="當日變化"
        value={`${signPrefix(totalDailyChange)}${fmt(totalDailyChange)}`}
        cls={signClass(totalDailyChange)}
      />
    </div>
  );
}

function SummaryItem({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      paddingRight: 28,
      marginRight: 28,
      borderRight: '1px solid var(--border)',
    }}
    className="_summary-item"
    >
      <style>{`._summary-item:last-child { border-right: none; padding-right: 0; margin-right: 0; }`}</style>
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)', lineHeight: 1, marginBottom: 3 }}>
        {label}
      </span>
      <span
        className={`mono ${cls}`}
        style={{ fontSize: 'var(--text-xl)', fontWeight: 600, lineHeight: 1 }}
      >
        {value}
      </span>
    </div>
  );
}
