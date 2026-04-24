import PanelHeader from '../components/PanelHeader';

export default function ReportPage() {
  return (
    <div style={{ minWidth: 0 }}>
      <PanelHeader />
      <div style={{ padding: '16px 28px 28px' }}>
        <h2 className="ft-section-title" style={{ marginBottom: 20 }}>績效報告</h2>
        {/* P3B-01 ~ P3B-06 將在此組裝：SnapshotSummaryCards / ReturnRateChart / SnapshotTable */}
      </div>
    </div>
  );
}
