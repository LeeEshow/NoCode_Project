import PanelHeader from '../components/PanelHeader';

export default function PlanPage() {
  return (
    <div style={{ minWidth: 0 }}>
      <PanelHeader />
      <div style={{ padding: '16px 28px 28px' }}>
        <h2 className="ft-section-title" style={{ marginBottom: 20 }}>投報計畫</h2>
        {/* P3-01 ~ P3-07 將在此組裝：PlanParamsForm / MARCTable / YearlyRecordsTable */}
      </div>
    </div>
  );
}
