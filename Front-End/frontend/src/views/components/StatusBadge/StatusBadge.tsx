import './StatusBadge.css';

export type BadgeVariant = 'up' | 'down' | 'flat' | 'accent' | 'muted';

export interface StatusBadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
}

export default function StatusBadge({ variant, children }: StatusBadgeProps) {
  return (
    <span className={`ft-badge ft-badge--${variant}`}>{children}</span>
  );
}
