import { Outlet } from 'react-router-dom';
import SideNav from './SideNav';
import './MainLayout.css';

export default function MainLayout() {
  return (
    <div className="main-layout">
      <SideNav />
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
