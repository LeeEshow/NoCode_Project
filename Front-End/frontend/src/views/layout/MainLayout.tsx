import { useState, useCallback, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import SideNav from './SideNav';
import SettingsModal from './SettingsModal';
import ECGLoader from '../components/ECGLoader/ECGLoader';
import './MainLayout.css';

export default function MainLayout() {
  const [expanded, setExpanded] = useState(window.innerWidth >= 1200);
  const [showSettings, setShowSettings] = useState(false);
  const toggle = useCallback(() => setExpanded(e => !e), []);

  const location = useLocation();
  const [overlay, setOverlay] = useState<'hidden' | 'solid' | 'fading'>('hidden');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setOverlay('solid');
    timerRef.current = setTimeout(() => {
      setOverlay('fading');
      timerRef.current = setTimeout(() => setOverlay('hidden'), 300);
    }, 700);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [location.pathname]);

  return (
    <div className={`main-layout${expanded ? ' main-layout--expanded' : ''}`}>
      {overlay !== 'hidden' && (
        <div style={{
          position: 'fixed', inset: 0, background: 'var(--bg)',
          zIndex: 9998, pointerEvents: 'none',
          opacity: overlay === 'fading' ? 0 : 1,
          transition: overlay === 'fading' ? 'opacity 0.3s ease' : 'none',
        }} />
      )}
      <ECGLoader />
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
