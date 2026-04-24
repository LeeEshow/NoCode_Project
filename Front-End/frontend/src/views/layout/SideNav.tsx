import { NavLink, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import './SideNav.css';

/* ── Icon components ────────────────────────────────────────── */

const IconChart = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);
const IconCoin = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </svg>
);
const IconPlan = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M12 20V10M18 20V4M6 20v-4" />
  </svg>
);
const IconReport = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M21 21H4.6A1.6 1.6 0 013 19.4V3" />
    <path d="M7 16l4-4 4 4 4-7" />
  </svg>
);
const IconSettings = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
);
const IconMenuOpen = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <line x1="3" y1="6"  x2="21" y2="6"  />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

/* ── Types ──────────────────────────────────────────────────── */

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  expanded: boolean;
}

function NavItem({ to, icon, label, expanded }: NavItemProps) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) => `nav-item${isActive ? ' nav-item--active' : ''}`}
      title={!expanded ? label : undefined}
    >
      <span className="nav-item__icon">{icon}</span>
      {expanded && <span className="nav-item__label">{label}</span>}
    </NavLink>
  );
}

function NavDivider({ expanded, label }: { expanded: boolean; label?: string }) {
  return (
    <div className="nav-divider">
      {expanded && label && <span className="nav-divider__label">{label}</span>}
      {!label && <div className="nav-divider__line" />}
    </div>
  );
}

/* ── SideNav ────────────────────────────────────────────────── */

export default function SideNav() {
  const [expanded, setExpanded] = useState(window.innerWidth >= 1200);
  const location = useLocation();

  useEffect(() => {
    const handleResize = () => setExpanded(window.innerWidth >= 1200);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  /* 窄螢幕點選頁面後自動收合 */
  useEffect(() => {
    if (window.innerWidth < 1200) setExpanded(false);
  }, [location.pathname]);

  return (
    <nav className={`sidenav${expanded ? ' sidenav--expanded' : ''}`}>

      {/* Logo + 展開切換 */}
      <div className="sidenav__top">
        <button
          className="sidenav__toggle"
          onClick={() => setExpanded(e => !e)}
          title={expanded ? '收合選單' : '展開選單'}
        >
          <IconMenuOpen />
        </button>
        {expanded && <span className="sidenav__logo">FinTrack</span>}
      </div>

      {/* 主要導覽 */}
      <div className="sidenav__body">
        <NavDivider expanded={expanded} />
        <NavItem to="/"       icon={<IconChart />}    label="台股總覽"  expanded={expanded} />

        <NavDivider expanded={expanded} />
        <NavItem to="/assets" icon={<IconCoin />}     label="外幣 & 債券" expanded={expanded} />

        <NavDivider expanded={expanded} label={expanded ? '資產規劃' : undefined} />
        <NavItem to="/plan"   icon={<IconPlan />}     label="投報計畫"  expanded={expanded} />
        <NavItem to="/report" icon={<IconReport />}   label="績效報告"  expanded={expanded} />

        <NavDivider expanded={expanded} />
      </div>

      {/* 底部設定 */}
      <div className="sidenav__foot">
        <NavItem to="/settings" icon={<IconSettings />} label="設定" expanded={expanded} />
      </div>
    </nav>
  );
}
