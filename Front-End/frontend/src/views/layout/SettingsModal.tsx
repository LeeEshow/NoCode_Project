import { useState, useEffect, useCallback } from 'react';
import Modal from '../components/Modal/Modal';
import Icon from '../components/Icon';
import { useStockListViewModel } from '../../viewmodels/useStockListViewModel';
import { fetchSnapshot, triggerSnapshotRecord } from '../../models/snapshotModel';
import { toast } from '../components/Toast';
import type { DailySnapshotDTO } from '../../types';

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
    <section className="ft-panel" style={{ marginBottom: 16 }}>
      <div className="ft-section-header">
        <span className="ft-section-title">股票清單</span>
      </div>
      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 24 }}>
        <div style={{ flex: 1 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 4 }}>上次更新</div>
          <div className="num-value" style={{ fontSize: 14 }}>
            {loading ? '載入中…' : formatDateTime(updatedAt)}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 4 }}>總筆數</div>
          <div className="num-value" style={{ fontSize: 14 }}>
            {loading ? '—' : `${count.toLocaleString()} 筆`}
          </div>
        </div>
        <button
          className="btn-ghost"
          onClick={handleRefresh}
          disabled={loading || refreshing}
          style={{ minWidth: 100 }}
        >
          {refreshing
            ? <Icon name="progress_activity" size={16} style={{ animation: 'spin 1s linear infinite' }} />
            : '立即更新'}
        </button>
      </div>
    </section>
  );
}

function SnapshotSection() {
  const [snapshot, setSnapshot] = useState<DailySnapshotDTO | null>(null);
  const [loading, setLoading]   = useState(true);
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
      const msg = err instanceof Error ? err.message : '記錄失敗';
      toast.error(msg);
    } finally {
      setRecording(false);
    }
  }

  const recordedAt = snapshot?.recordedAt ?? null;

  return (
    <section className="ft-panel">
      <div className="ft-section-header">
        <span className="ft-section-title">每日快照</span>
      </div>
      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 24 }}>
        <div style={{ flex: 1 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 4 }}>今日記錄狀態</div>
          <div className="num-value" style={{ fontSize: 14 }}>
            {loading ? '載入中…' : (recordedAt ? formatDateTime(recordedAt) : '尚未記錄')}
          </div>
        </div>
        <button
          className="btn-ghost"
          onClick={handleRecord}
          disabled={loading || recording}
          style={{ minWidth: 120 }}
        >
          {recording
            ? <Icon name="progress_activity" size={16} style={{ animation: 'spin 1s linear infinite' }} />
            : '記錄今日快照'}
        </button>
      </div>
    </section>
  );
}

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="設定" size="md">
      <StockListSection />
      <SnapshotSection />
    </Modal>
  );
}
