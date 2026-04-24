import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './views/layout/MainLayout';
import StockOverviewPage from './views/pages/StockOverviewPage';
import PlanPage          from './views/pages/PlanPage';
import AssetsPage        from './views/pages/AssetsPage';
import ReportPage        from './views/pages/ReportPage';
import SettingsPage      from './views/pages/SettingsPage';
import ToastContainer    from './views/components/Toast';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route index element={<StockOverviewPage />} />
          <Route path="plan"     element={<PlanPage />} />
          <Route path="assets"   element={<AssetsPage />} />
          <Route path="report"   element={<ReportPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*"        element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <ToastContainer />
    </BrowserRouter>
  );
}
