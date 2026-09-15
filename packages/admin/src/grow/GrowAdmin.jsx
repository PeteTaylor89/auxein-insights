// src/grow/GrowAdmin.jsx — the GROW half of the admin surface.
//
// Moved from packages/web/src/pages/Admin.jsx. Two changes from the original:
//
//  1. The `userTypeRole !== 'auxein_admin'` guard is gone. AdminRoute already
//     requires BOTH admin flags before anything on this origin renders, and a
//     second, weaker guard here would only be a place for the two to disagree.
//
//  2. Its CSS classes are namespaced `grow-admin-*`. The original defined a bare
//     global `.grow-admin-page` in an inline <style>, which collides head-on with the
//     `.grow-admin-page` that Insights' admin.css gives AdminLayout — a global style
//     tag, live for as long as this component is mounted.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';


import { Building2, Users, MapPinned, Wrench, Megaphone } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import './grow-admin.css';
import CompanyCreationForm from './CompanyCreationForm';
import CompanyManagement from './CompanyManagement';
import GrowUserManagement from './GrowUserManagement';
import PropertyManagement from './PropertyManagement';
import ContractorRegistry from './ContractorRegistry';
import GrowBannerManagement from './GrowBannerManagement';

const TABS = [
  { id: 'companies', label: 'Companies', icon: Building2 },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'properties', label: 'Properties', icon: MapPinned },
  { id: 'contractors', label: 'Contractors', icon: Wrench },
  { id: 'banners', label: 'Banners', icon: Megaphone },
];

// The tab lives in the URL, not in component state. The unified nav links
// straight to /grow/properties, so a tab that existed only in useState would
// mean every Grow nav entry landed on Companies. It also makes these screens
// linkable and back-button-correct, which they were not in Grow.
function GrowAdmin() {
  const { tab } = useParams();
  const activeTab = TABS.some((t) => t.id === tab) ? tab : 'companies';
  const [companySubTab, setCompanySubTab] = useState('manage');

  return (
    <AdminLayout
      title="Grow administration"
      subtitle="Companies, Grow users, properties, contractors and Grow banners."
    >
      <div className="grow-admin-page">

      {/* Kept alongside the nav dropdown: the tabs are the fastest way to move
          between the five Grow screens once you are already in here. */}
      <div className="grow-admin-tab-bar">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.id}
              to={`/grow/${t.id}`}
              className={`grow-admin-tab ${activeTab === t.id ? 'active' : ''}`}
            >
              <Icon size={16} />
              {t.label}
            </Link>
          );
        })}
      </div>

      <div className="grow-admin-tab-content">
        {activeTab === 'companies' && (
          <div>
            <div className="grow-admin-sub-tabs">
              <button
                className={`grow-admin-sub-tab ${companySubTab === 'manage' ? 'active' : ''}`}
                onClick={() => setCompanySubTab('manage')}
              >
                Manage Companies
              </button>
              <button
                className={`grow-admin-sub-tab ${companySubTab === 'create' ? 'active' : ''}`}
                onClick={() => setCompanySubTab('create')}
              >
                Create Company
              </button>
            </div>
            {companySubTab === 'manage' && <CompanyManagement />}
            {companySubTab === 'create' && <CompanyCreationForm />}
          </div>
        )}
        {activeTab === 'users' && <GrowUserManagement />}
        {activeTab === 'properties' && <PropertyManagement />}
        {activeTab === 'contractors' && <ContractorRegistry />}
        {activeTab === 'banners' && <GrowBannerManagement />}
      </div>

      <style>{`
        /* AdminLayout's .admin-container already supplies the max-width
           and gutter; this used to be the outermost element on the page. */
        .grow-admin-page {
          width: 100%;
        }

        .grow-admin-page-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
          border-bottom: 2px solid #FDF6E3;
          padding-bottom: 8px;
        }

        .grow-admin-page-title {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #2F2F2F;
        }

        .grow-admin-page-title h1 {
          margin: 0;
          font-size: 20pt;
          font-weight: bold;
        }

        .grow-admin-tab-bar {
          display: flex;
          gap: 4px;
          margin-bottom: 20px;
          border-bottom: 2px solid #FDF6E3;
          padding-bottom: 0;
        }

        .grow-admin-tab {
          text-decoration: none;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 10px 18px;
          border: none;
          border-bottom: 3px solid transparent;
          background: none;
          color: #5B6830;
          font-weight: 500;
          font-size: 0.95rem;
          cursor: pointer;
          transition: all 0.2s ease;
          margin-bottom: -2px;
        }

        .grow-admin-tab:hover {
          color: #D1583B;
          background: rgba(253, 246, 227, 0.5);
        }

        .grow-admin-tab.active {
          color: #D1583B;
          border-bottom-color: #D1583B;
          font-weight: 600;
        }

        .grow-admin-tab-content {
          background: #FFFFFF;
          border-radius: 12px;
          padding: 20px;
          box-shadow: 0 2px 6px rgba(47, 47, 47, 0.08);
          border: 1px solid rgba(91, 104, 48, 0.2);
          min-height: 400px;
        }

        .grow-admin-sub-tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
        }

        .grow-admin-sub-tab {
          padding: 6px 14px;
          border-radius: 8px;
          border: 1px solid transparent;
          background: #FDF6E3;
          color: #5B6830;
          cursor: pointer;
          font-weight: 500;
          font-size: 0.9rem;
          transition: all 0.2s ease;
        }

        .grow-admin-sub-tab:hover {
          background: #F5EBD5;
        }

        .grow-admin-sub-tab.active {
          background: #D1583B;
          color: #FFFFFF;
          border-color: #D1583B;
        }

        @media (max-width: 768px) {
          .grow-admin-page {
            padding: 0;
          }

          .grow-admin-tab-bar {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }

          .grow-admin-tab-bar {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
          }

          .grow-admin-tab-bar::-webkit-scrollbar { display: none; }

          .grow-admin-tab {
            white-space: nowrap;
            padding: 8px 12px;
            font-size: 0.85rem;
          }
        }
      `}</style>
      </div>
    </AdminLayout>
  );
}

export default GrowAdmin;
