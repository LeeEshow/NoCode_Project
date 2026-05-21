import { useState, useEffect, useCallback } from 'react';
import Modal from '../components/Modal/Modal';
import Icon from '../components/Icon';
import { useStockListViewModel } from '../../viewmodels/useStockListViewModel';
import { fetchSnapshot, triggerSnapshotRecord } from '../../models/snapshotModel';
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
  const [snapshot, setSnapshot]   = useState<DailySnapshotDTO | null>(null);
  const [loading, setLoading]     = useState(true);
  const [recording, setRecording] = useState(false);

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

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="設定" size="md" className="settings-modal">
      <StockListSection />
      <SnapshotSection />
    </Modal>
  );
}
