import { useState, useEffect, useCallback, useRef } from 'react';
import Modal from '../components/Modal/Modal';
import Icon from '../components/Icon';
import { TextareaInput } from '../components/FormInputs';
import { useStockListViewModel } from '../../viewmodels/useStockListViewModel';
import { fetchSnapshot, triggerSnapshotRecord } from '../../models/snapshotModel';
import { fetchSettings, updateSettings } from '../../models/settingsModel';
import { useSettingsStore } from '../../stores/settingsStore';
import { toast } from '../components/Toast';
import type { DailySnapshotDTO } from '../../types';
import './SettingsModal.css';

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '尚未更新';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function todayStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function StockListSection() {
  const { count, updatedAt, loading, refreshing, refresh } = useStockListViewModel();

  async function handleRefresh() {
    try {
      const meta = await refresh();
      toast.success(`股票清單已更新，共 ${meta.count} 筆`);
    } catch {
      toast.error('更新失敗，請稍後再試');
    }
  }

  return (
    <div className="settings-section">
      <div className="settings-section__label">股票清單</div>
      <div className="settings-row">
        <span className="settings-row__label">上次更新</span>
        <span className="settings-row__value">{loading ? '載入中…' : formatDateTime(updatedAt)}</span>
      </div>
      <div className="settings-row">
        <span className="settings-row__label">總筆數</span>
        <span className="settings-row__value">{loading ? '—' : `${count.toLocaleString()} 筆`}</span>
        <button
          className="btn-ghost settings-row__action"
          onClick={handleRefresh}
          disabled={loading || refreshing}
          style={{ minWidth: 88 }}
        >
          {refreshing
            ? <Icon name="progress_activity" size={15} style={{ animation: 'spin 1s linear infinite' }} />
            : '立即更新'}
        </button>
      </div>
    </div>
  );
}

function SnapshotSection() {
  const [snapshot, setSnapshot]     = useState<DailySnapshotDTO | null>(null);
  const [loading, setLoading]       = useState(true);
  const [recording, setRecording]   = useState(false);

  const loadToday = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSnapshot(todayStr());
      setSnapshot(data);
    } catch {
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadToday(); }, [loadToday]);

  async function handleRecord() {
    setRecording(true);
    try {
      const data = await triggerSnapshotRecord();
      setSnapshot(data);
      const dateLabel = data.recordedAt
        ? formatDateTime(data.recordedAt).slice(0, 10)
        : todayStr();
      toast.success(`今日快照已記錄（${dateLabel}）`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '記錄失敗');
    } finally {
      setRecording(false);
    }
  }

  const recordedAt = snapshot?.recordedAt ?? null;

  return (
    <div className="settings-section">
      <div className="settings-section__label">每日快照</div>
      <div className="settings-row">
        <span className="settings-row__label">今日狀態</span>
        <span className="settings-row__value">
          {loading ? '載入中…' : (recordedAt ? formatDateTime(recordedAt) : '尚未記錄')}
        </span>
        <button
          className="btn-ghost settings-row__action"
          onClick={handleRecord}
          disabled={loading || recording}
          style={{ minWidth: 100 }}
        >
          {recording
            ? <Icon name="progress_activity" size={15} style={{ animation: 'spin 1s linear infinite' }} />
            : '記錄快照'}
        </button>
      </div>
    </div>
  );
}

function AiSystemPromptSection() {
  const { aiReportEnabled, setAiReportEnabled } = useSettingsStore();
  const [prompt, setPrompt]       = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const debounceRef               = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchSettings()
      .then(s => {
        setPrompt(s.aiSystemPrompt ?? '');
        setUpdatedAt(s.aiSystemPromptUpdatedAt ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleBlur = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        const updated = await updateSettings({ aiSystemPrompt: prompt });
        setUpdatedAt(updated.aiSystemPromptUpdatedAt ?? null);
      } catch {
        toast.error('儲存失敗，請稍後再試');
      } finally {
        setSaving(false);
      }
    }, 500);
  }, [prompt]);

  return (
    <div className="settings-section">
      <div className="settings-row">
        <label htmlFor="ai-report-enabled" style={{ flex: 1, fontSize: 'var(--text-sm)', color: 'var(--text)', cursor: 'pointer' }}>
          啟用 AI 每日早報
        </label>
        {saving && (
          <Icon name="progress_activity" size={13} style={{ animation: 'spin 1s linear infinite', color: 'var(--dim)' }} />
        )}
        <label className="ft-toggle">
          <input
            id="ai-report-enabled"
            type="checkbox"
            checked={aiReportEnabled}
            onChange={e => setAiReportEnabled(e.target.checked)}
          />
          <span className="ft-toggle__track" />
        </label>
      </div>

      <div style={{ marginTop: 16 }}>
        <div className="settings-prompt-label">System Prompt</div>
        <TextareaInput
          rows={10}
          value={loading ? '' : prompt}
          disabled={loading || !aiReportEnabled}
          onChange={e => setPrompt(e.target.value)}
          onBlur={handleBlur}
          placeholder="輸入 AI 早報的 System Prompt…"
          aria-label="AI 早報 System Prompt"
        />
        <div className="settings-prompt-meta">
          上次更新：{formatDateTime(updatedAt)}
        </div>
      </div>
    </div>
  );
}

type SettingsTab = 'data' | 'ai';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('data');

  return (
    <Modal open={open} onClose={onClose} title="設定" size="md" className="settings-modal">
      <div role="tablist" aria-label="設定分類" className="settings-tabs">
        <button
          id="tab-data"
          role="tab"
          aria-selected={activeTab === 'data'}
          aria-controls="panel-data"
          className="settings-tab"
          onClick={() => setActiveTab('data')}
        >
          資料管理
        </button>
        <button
          id="tab-ai"
          role="tab"
          aria-selected={activeTab === 'ai'}
          aria-controls="panel-ai"
          className="settings-tab"
          onClick={() => setActiveTab('ai')}
        >
          AI 早報
        </button>
      </div>

      <div
        id="panel-data"
        role="tabpanel"
        aria-labelledby="tab-data"
        hidden={activeTab !== 'data'}
      >
        <StockListSection />
        <SnapshotSection />
      </div>

      <div
        id="panel-ai"
        role="tabpanel"
        aria-labelledby="tab-ai"
        hidden={activeTab !== 'ai'}
      >
        <AiSystemPromptSection />
      </div>
    </Modal>
  );
}
