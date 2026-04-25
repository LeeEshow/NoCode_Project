import { useState } from 'react';
import PanelHeader from '../components/PanelHeader';
import LoadingPanel from '../components/LoadingPanel';
import { useAssetsViewModel } from '../../viewmodels/useAssetsViewModel';
import ForeignAssetTable from './assets/ForeignAssetTable';
import ForeignAssetModal from './assets/ForeignAssetModal';
import { toast } from '../components/Toast/toastStore';
import type { ForeignAssetDTO, CreateForeignAssetPayload } from '../../types';
import './assets/assets.css';

function fmt(n: number, d = 0) {
  return n.toLocaleString('zh-TW', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export default function AssetsPage() {
  const vm = useAssetsViewModel();

  const [modalOpen, setModalOpen]   = useState(false);
  const [editItem,  setEditItem]    = useState<ForeignAssetDTO | null>(null);

  const openAdd  = () => { setEditItem(null); setModalOpen(true); };
  const openEdit = (item: ForeignAssetDTO) => { setEditItem(item); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setEditItem(null); };

  const handleSubmit = async (payload: CreateForeignAssetPayload, id?: string) => {
    if (id) {
      await vm.editItem(id, payload, () => {
        toast.success('資產已更新');
        closeModal();
      });
    } else {
      await vm.addItem(payload, () => {
        toast.success('資產已新增');
        closeModal();
      });
    }
    if (vm.error) toast.error(vm.error);
  };

  const handlePatch = async (id: string, patch: Partial<CreateForeignAssetPayload>) => {
    await vm.editItem(id, patch);
    if (vm.error) toast.error(vm.error);
  };

  const handleDelete = async (id: string) => {
    await vm.removeItem(id, () => toast.success('資產已移除'));
    if (vm.error) toast.error(vm.error);
  };

  return (
    <div style={{ minWidth: 0 }}>

      {/* ── PanelHeader ── */}
      <PanelHeader>
        <div className="ph-stat">
          <span className="ph-stat__label">外幣資產總計（台幣）</span>
          <span className="ph-stat__value" style={{ color: 'var(--text-value)', fontWeight: 700 }}>
            {fmt(vm.totalTwd)}
          </span>
        </div>
      </PanelHeader>

      <div style={{ padding: '16px 28px 28px' }}>
        <div className="ft-panel">
          <div className="ft-section-header">
            <span className="ft-section-title">外幣資產</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn-ghost" onClick={vm.load}>重新整理</button>
              <button className="btn-ghost" onClick={openAdd}>＋ 新增</button>
            </div>
          </div>

          {vm.loading
            ? <LoadingPanel loading rows={4} />
            : (
              <>
                <ForeignAssetTable
                  items={vm.items}
                  saving={vm.saving}
                  onEdit={openEdit}
                  onPatch={handlePatch}
                  onDelete={handleDelete}
                />
                {vm.items.length > 0 && (
                  <div className="assets-total-bar">
                    <div className="assets-total-item">
                      <span className="assets-total-label">總計台幣</span>
                      <span className="assets-total-value">{fmt(vm.totalTwd)}</span>
                    </div>
                  </div>
                )}
              </>
            )
          }
        </div>
      </div>

      <ForeignAssetModal
        open={modalOpen}
        editItem={editItem}
        saving={vm.saving}
        onClose={closeModal}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
