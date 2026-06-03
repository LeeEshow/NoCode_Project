import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, startTransition } from 'react';
import Icon from '../components/Icon';
import './SideNav.css';

/* ── Types ──────────────────────────────────────────────────── */

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  expanded: boolean;
}

function NavItem({ to, icon, label, expanded }: NavItemProps) {
  const navigate = useNavigate();
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) => `nav-item${isActive ? ' nav-item--active' : ''}`}
      title={!expanded ? label : undefined}
      onClick={e => { e.preventDefault(); startTransition(() => navigate(to)); }}
    >
      <span className="nav-item__icon">{icon}</span>
      {expanded && <span className="nav-item__label">{label}</span>}
    </NavLink>
  );
}

function NavDivider({ expanded, label }: { expanded: boolean; label?: string }) {
  return (
    <div className="nav-divider">
      <div className="nav-divider__line" />
      {expanded && label && <span className="nav-divider__label">{label}</span>}
    </div>
  );
}

/* ── SideNav ────────────────────────────────────────────────── */

export interface SideNavProps {
  expanded: boolean;
  onToggle: () => void;
  onSettingsOpen: () => void;
}

export default function SideNav({ expanded, onToggle, onSettingsOpen }: SideNavProps) {
  const location = useLocation();

  /* 視窗寬度改變時自動同步展開狀態 */
  useEffect(() => {
    const handleResize = () => {
      const shouldExpand = window.innerWidth >= 1200;
      if (shouldExpand !== expanded) onToggle();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [expanded, onToggle]);

  /* 窄螢幕點選頁面後自動收合 */
  useEffect(() => {
    if (window.innerWidth < 1200 && expanded) onToggle();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  return (
    <nav className={`sidenav${expanded ? ' sidenav--expanded' : ''}`} style={{ viewTransitionName: 'site-nav' }}>

      {/* FIX-06：展開時 Logo 靠左、‹ 靠右；收折時 › 置中 */}
      <div className="sidenav__top">
        {expanded && <span className="sidenav__logo">FinTrack</span>}
        <button
          className="sidenav__toggle"
          onClick={onToggle}
          title={expanded ? '收合選單' : '展開選單'}
        >
          {expanded ? <Icon name="chevron_left" size={24} /> : <Icon name="chevron_right" size={24} />}
        </button>
      </div>

      {/* 主要導覽 */}
      <div className="sidenav__body">
        <NavItem to="/"       icon={<Icon name="trending_up" size={24} />} label="台股總覽" expanded={expanded} />
        <NavItem to="/assets" icon={<Icon name="account_balance_wallet" size={24} />} label="外幣資產" expanded={expanded} />

        <NavDivider expanded={expanded} label={expanded ? '資產規劃' : undefined} />
        <NavItem to="/plan"   icon={<Icon name="savings"     size={24} />} label="投報計畫" expanded={expanded} />
        <NavItem to="/report" icon={<Icon name="analytics"   size={24} />} label="績效報告" expanded={expanded} />

        <NavDivider expanded={expanded} />
      </div>

      {/* 底部設定 */}
      <div className="sidenav__foot">
        <button
          className="nav-item nav-item--button"
          onClick={onSettingsOpen}
          title={!expanded ? '設定' : undefined}
        >
          <span className="nav-item__icon"><Icon name="settings" size={24} /></span>
          {expanded && <span className="nav-item__label">設定</span>}
        </button>
      </div>
    </nav>
  );
}
