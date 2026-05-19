import { useState, useEffect } from 'react';
import { useSnapshotStore } from '../../../stores/snapshotStore';
import { useSettingsStore } from '../../../stores/settingsStore';
import { useAiReportViewModel } from '../../../viewmodels/useAiReportViewModel';
import AiReportModal from '../AiReportModal/AiReportModal';
import Icon from '../Icon';
import './PanelHeader.css';

interface PanelHeaderProps {
  children?: React.ReactNode;
}

export default function PanelHeader({ children }: PanelHeaderProps) {
  const { cashBalance, loaded, load, update } = useSnapshotStore();
  const { aiReportEnabled, load: loadSettings } = useSettingsStore();
  const [draft, setDraft] = useState('');
  const [isAiReportOpen, setIsAiReportOpen] = useState(false);

  const aiReport = useAiReportViewModel();

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadSettings(); }, [loadSettings]);

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

  function handleOpenAiReport() {
    setIsAiReportOpen(true);
    if (!aiReport.report && !aiReport.loading) {
      aiReport.loadLatest();
    }
  }

  return (
    <div className="panel-header">
      <div className="panel-header__left">{children}</div>
      <div className="panel-header__sep" />
      <div className="panel-header__right">
        {aiReportEnabled && (
          <button
            className={`btn-icon panel-header__ai-btn${aiReport.hasReport ? ' panel-header__ai-btn--has-report' : ''}`}
            onClick={handleOpenAiReport}
            aria-label="AI 每日早報"
          >
            <Icon name="auto_awesome" size={18} />
          </button>
        )}
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
      {aiReportEnabled && (
        <AiReportModal
          open={isAiReportOpen}
          onClose={() => setIsAiReportOpen(false)}
          report={aiReport.report}
          loading={aiReport.loading}
          error={aiReport.error}
          availableDates={aiReport.availableDates}
          onLoadByDate={aiReport.loadByDate}
        />
      )}
    </div>
  );
}
