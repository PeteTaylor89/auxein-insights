// src/pages/Admin.jsx — Standalone system admin page (auxein_admin only)
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@vineyard/shared';
import { Shield, Building2, Users, MapPinned, Wrench, Megaphone } from 'lucide-react';
import CompanyCreationForm from '../components/admin/CompanyCreationForm';
import CompanyManagement from '../components/admin/CompanyManagement';
import UserManagement from '../components/admin/UserManagement';
import PropertyManagement from '../components/admin/PropertyManagement';
import ContractorRegistry from '../components/admin/ContractorRegistry';
import BannerManagement from '../components/admin/BannerManagement';

const TABS = [
  { id: 'companies', label: 'Companies', icon: Building2 },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'properties', label: 'Properties', icon: MapPinned },
  { id: 'contractors', label: 'Contractors', icon: Wrench },
  { id: 'banners', label: 'Banners', icon: Megaphone },
];

function Admin() {
  const { user, userTypeRole } = useAuth();
  const [activeTab, setActiveTab] = useState('companies');
  const [companySubTab, setCompanySubTab] = useState('manage');

  // Guard: auxein_admin only
  if (userTypeRole !== 'auxein_admin') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div className="admin-page-title">
          <Shield size={22} />
          <h1>System Administration</h1>
        </div>
      </div>

      <div className="admin-tab-bar">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              className={`admin-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="admin-tab-content">
        {activeTab === 'companies' && (
          <div>
            <div className="admin-sub-tabs">
              <button
                className={`admin-sub-tab ${companySubTab === 'manage' ? 'active' : ''}`}
                onClick={() => setCompanySubTab('manage')}
              >
                Manage Companies
              </button>
              <button
                className={`admin-sub-tab ${companySubTab === 'create' ? 'active' : ''}`}
                onClick={() => setCompanySubTab('create')}
              >
                Create Company
              </button>
            </div>
            {companySubTab === 'manage' && <CompanyManagement />}
            {companySubTab === 'create' && <CompanyCreationForm />}
          </div>
        )}
        {activeTab === 'users' && <UserManagement />}
        {activeTab === 'properties' && <PropertyManagement />}
        {activeTab === 'contractors' && <ContractorRegistry />}
        {activeTab === 'banners' && <BannerManagement />}
      </div>

      <style>{`
        .admin-page {
          width: 100%;
          max-width: 1200px;
          margin: 0 auto;
          padding: 28px;
        }

        .admin-page-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
          border-bottom: 2px solid #FDF6E3;
          padding-bottom: 8px;
        }

        .admin-page-title {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #2F2F2F;
        }

        .admin-page-title h1 {
          margin: 0;
          font-size: 20pt;
          font-weight: bold;
        }

        .admin-tab-bar {
          display: flex;
          gap: 4px;
          margin-bottom: 20px;
          border-bottom: 2px solid #FDF6E3;
          padding-bottom: 0;
        }

        .admin-tab {
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

        .admin-tab:hover {
          color: #D1583B;
          background: rgba(253, 246, 227, 0.5);
        }

        .admin-tab.active {
          color: #D1583B;
          border-bottom-color: #D1583B;
          font-weight: 600;
        }

        .admin-tab-content {
          background: #FFFFFF;
          border-radius: 12px;
          padding: 20px;
          box-shadow: 0 2px 6px rgba(47, 47, 47, 0.08);
          border: 1px solid rgba(91, 104, 48, 0.2);
          min-height: 400px;
        }

        .admin-sub-tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
        }

        .admin-sub-tab {
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

        .admin-sub-tab:hover {
          background: #F5EBD5;
        }

        .admin-sub-tab.active {
          background: #D1583B;
          color: #FFFFFF;
          border-color: #D1583B;
        }

        @media (max-width: 768px) {
          .admin-page {
            padding: 16px;
          }

          .admin-tab-bar {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }

          .admin-tab {
            white-space: nowrap;
            padding: 8px 12px;
            font-size: 0.85rem;
          }
        }
      `}</style>
    </div>
  );
}

export default Admin;
