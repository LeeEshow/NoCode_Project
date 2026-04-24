import './LoadingPanel.css';

export interface LoadingPanelProps {
  loading: boolean;
  rows?: number;
  type?: 'skeleton' | 'spinner';
}

export default function LoadingPanel({ loading, rows = 5, type = 'skeleton' }: LoadingPanelProps) {
  if (!loading) return null;

  if (type === 'spinner') {
    return (
      <div className="lp-spinner-wrap">
        <span className="lp-spinner" />
      </div>
    );
  }

  return (
    <div className="lp-skeleton-wrap">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="lp-skeleton-row">
          <div className="lp-skeleton-cell lp-skeleton-cell--wide" />
          <div className="lp-skeleton-cell" />
          <div className="lp-skeleton-cell" />
          <div className="lp-skeleton-cell lp-skeleton-cell--narrow" />
        </div>
      ))}
    </div>
  );
}
