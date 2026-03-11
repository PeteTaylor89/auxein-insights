// components/AppLayout.jsx — Wraps authenticated pages with header + footer
import { Outlet } from 'react-router-dom';
import SiteHeader from './SiteHeader';
import SiteFooter from './SiteFooter';

function AppLayout() {
  return (
    <div className="app-layout">
      <SiteHeader />
      <main className="app-main">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}

export default AppLayout;
