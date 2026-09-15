// src/components/AdminLayout.jsx — page chrome for every admin screen.
//
// The nav itself moved to AdminNav (Phase 4). What is left here is the page
// frame: back link, title block, content well. Every moved Insights page already
// calls <AdminLayout title=... backLink=...>, so that contract is unchanged.
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import AdminNav from './AdminNav';
import '../pages/admin.css';
import './admin-layout.css';

const AdminLayout = ({ children, title, subtitle, backLink, backText }) => (
  <div className="admin-page">
    <AdminNav />

    <main className="admin-main">
      <div className="admin-container">
        {backLink && (
          <Link to={backLink} className="back-link">
            <ArrowLeft size={16} />
            {backText || 'Back'}
          </Link>
        )}

        {title && (
          <div className="admin-header">
            <div>
              <h1>{title}</h1>
              {subtitle && <p>{subtitle}</p>}
            </div>
          </div>
        )}

        {children}
      </div>
    </main>
  </div>
);

export default AdminLayout;
