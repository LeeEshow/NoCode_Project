import { useState } from 'react';
import './PanelHeader.css';

interface PanelHeaderProps {
  children?: React.ReactNode;
}

export default function PanelHeader({ children }: PanelHeaderProps) {
  const [cash, setCash] = useState('');

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
          value={cash}
          onChange={e => setCash(e.target.value)}
          placeholder="0"
        />
      </div>
    </div>
  );
}
