import PanelHeader from '../components/PanelHeader';

export default function SettingsPage() {
  return (
    <div style={{ minWidth: 0 }}>
      <PanelHeader />
      <div style={{ padding: '16px 28px 28px' }}>
        <h2 className="ft-section-title" style={{ marginBottom: 20 }}>設定</h2>
        {/* 成本計算方法切換 / 重新計算按鈕 */}
      </div>
    </div>
  );
}
