import PanelHeader from '../components/PanelHeader';

export default function AssetsPage() {
  return (
    <div style={{ minWidth: 0 }}>
      <PanelHeader />
      <div style={{ padding: '16px 28px 28px' }}>
        <h2 className="ft-section-title" style={{ marginBottom: 20 }}>外幣 &amp; 債券</h2>
        {/* P3A-01 ~ P3A-08 將在此組裝：ForexSection / BondSection / AssetsTotalFooter */}
      </div>
    </div>
  );
}
