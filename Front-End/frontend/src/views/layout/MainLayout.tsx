import { useState, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import SideNav from './SideNav';
import SettingsModal from './SettingsModal';
import './MainLayout.css';

export default function MainLayout() {
  const [expanded, setExpanded] = useState(window.innerWidth >= 1200);
  const [showSettings, setShowSettings] = useState(false);
  const toggle = useCallback(() => setExpanded(e => !e), []);

  return (
    <div className={`main-layout${expanded ? ' main-layout--expanded' : ''}`}>
      <SideNav
        expanded={expanded}
        onToggle={toggle}
        onSettingsOpen={() => setShowSettings(true)}
      />
      <main className="main-content">
        <Outlet />
      </main>
      <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}
