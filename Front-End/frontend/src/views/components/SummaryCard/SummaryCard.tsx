import React from 'react';
import './SummaryCard.css';

export interface SummaryCardProps {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  valueClass?: string;
}

export default function SummaryCard({ label, value, sub, valueClass }: SummaryCardProps) {
  return (
    <div className="sc-card ft-panel">
      <div className="sc-label">{label}</div>
      <div className={`sc-value${valueClass ? ' ' + valueClass : ''}`}>{value}</div>
      {sub && <div className="sc-sub">{sub}</div>}
    </div>
  );
}
