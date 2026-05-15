import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout        from './views/layout/MainLayout';
import StockOverviewPage from './views/pages/StockOverviewPage';
import ToastContainer    from './views/components/Toast';

/* 非首頁頁面懶載入：首次造訪才下載對應 chunk，減少初始 bundle */
const PlanPage   = lazy(() => import('./views/pages/PlanPage'));
const AssetsPage = lazy(() => import('./views/pages/AssetsPage'));
const ReportPage = lazy(() => import('./views/pages/ReportPage'));

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route index element={<StockOverviewPage />} />
          <Route path="plan"   element={<Suspense fallback={null}><PlanPage /></Suspense>} />
          <Route path="assets" element={<Suspense fallback={null}><AssetsPage /></Suspense>} />
          <Route path="report" element={<Suspense fallback={null}><ReportPage /></Suspense>} />
          <Route path="*"      element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <ToastContainer />
    </BrowserRouter>
  );
}
