import { useState, useEffect } from 'react';
import { useSnapshotStore } from '../../../stores/snapshotStore';
import './PanelHeader.css';

interface PanelHeaderProps {
  children?: React.ReactNode;
}

export default function PanelHeader({ children }: PanelHeaderProps) {
  const { cashBalance, loaded, load, update } = useSnapshotStore();
  const [draft, setDraft] = useState('');

  useEffect(() => { load(); }, [load]);
  const fmtNum = (n: number) => n > 0 ? n.toLocaleString('zh-TW', { maximumFractionDigits: 0 }) : '';

  useEffect(() => {
    if (loaded) setDraft(fmtNum(cashBalance));
  }, [cashBalance, loaded]);

  const commit = () => {
    const v = parseFloat(draft.replace(/,/g, ''));
    if (!isNaN(v) && v >= 0) {
      update(v);
      setDraft(fmtNum(v));
    } else {
      setDraft(fmtNum(cashBalance));
    }
  };

  return (
    <div className="panel-header">
      <div className="panel-header__left">{children}</div>
      <div className="panel-header__sep" />
      <div className="panel-header__right">
        <span className="panel-header__cash-label">流動資金</span>
        <input
          className="panel-header__cash-input"
          type="text"
          inputMode="decimal"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => e.key === 'Enter' && commit()}
          placeholder="0"
        />
      </div>
    </div>
  );
}
