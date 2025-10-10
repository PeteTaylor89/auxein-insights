import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { 
  Wrench, 
  Package, 
  Calendar, 
  Plus, 
  ArrowRight, 
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Droplet,
  Truck,
  Settings
} from 'lucide-react';
import { assetService, authService } from '@vineyard/shared';
import MobileNavigation from '../components/MobileNavigation';

export default function AssetsDashboard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('equipment'); // equipment, consumables, maintenance

  const StatusBadge = ({ status, type = 'default' }) => {
    const colors = {
      "active": { bg: '#dcfce7', color: '#166534' },
      "maintenance": { bg: '#fed7aa', color: '#9a3412' },
      "retired": { bg: '#e5e7eb', color: '#374151' },
      "disposed": { bg: '#fee2e2', color: '#dc2626' },
      "out_of_stock": { bg: '#fef2f2', color: '#dc2626' },
      "low_stock": { bg: '#fef3c7', color: '#92400e' },
      "adequate": { bg: '#dcfce7', color: '#166534' },
      "scheduled": { bg: '#dbeafe', color: '#1e40af' },
      "in_progress": { bg: '#fef3c7', color: '#92400e' },
      "completed": { bg: '#dcfce7', color: '#166534' },
      "cancelled": { bg: '#fee2e2', color: '#dc2626' }
    };
    
    const style = colors[status?.toLowerCase()] || { bg: '#f3f4f6', color: '#374151' };
    
    return (
      <span style={{
        background: style.bg,
        color: style.color,
        padding: '0.25rem 0.5rem',
        borderRadius: '999px',
        fontSize: '0.75rem',
        fontWeight: '500',
        textTransform: 'capitalize'
      }}>
        {status?.replace('_', ' ')}
      </span>
    );
  };

  // Set body background
  useEffect(() => {
    document.body.classList.add("primary-bg");
    return () => {
      document.body.classList.remove("primary-bg");
    };
  }, []);

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: '#f8fafc',
      paddingTop: '70px',
      paddingBottom: '80px'
    }}>
      <div style={{ 
        maxWidth: '1400px', 
        margin: '0 auto', 
        padding: '1rem' 
      }}>
        
        {/* Dashboard Overview Stats */}
        <DashboardStats />

        {/* Tab Navigation */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '0',
          marginBottom: '1.5rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          overflow: 'hidden'
        }}>
          <div style={{
            display: 'flex',
            borderBottom: '1px solid #f3f4f6'
          }}>
            <TabButton 
              label="Equipment" 
              icon={<Truck size={16} />}
              active={tab === 'equipment'} 
              onClick={() => setTab('equipment')} 
            />
            <TabButton 
              label="Consumables" 
              icon={<Droplet size={16} />}
              active={tab === 'consumables'} 
              onClick={() => setTab('consumables')} 
            />
            <TabButton 
              label="Maintenance" 
              icon={<Calendar size={16} />}
              active={tab === 'maintenance'} 
              onClick={() => setTab('maintenance')} 
            />
          </div>

          <div style={{ padding: '1.25rem' }}>
            {tab === 'equipment' && <EquipmentTab StatusBadge={StatusBadge} />}
            {tab === 'consumables' && <ConsumablesTab StatusBadge={StatusBadge} />}
            {tab === 'maintenance' && <MaintenanceTab StatusBadge={StatusBadge} />}
          </div>
        </div>

      </div>
      <MobileNavigation />
    </div>
  );
}

function TabButton({ label, icon, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: '1rem',
        border: 'none',
        background: active ? '#f8fafc' : 'white',
        borderBottom: active ? '2px solid #3b82f6' : '2px solid transparent',
        cursor: 'pointer',
        fontSize: '0.875rem',
        fontWeight: '500',
        color: active ? '#3b82f6' : '#6b7280',
        transition: 'all 0.2s ease',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem'
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function DashboardStats() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState({
    compliance: [],
    stock: [],
    maintenance: [],
    calibrations: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const dashboardData = await assetService.dashboard.getDashboardData();
        
        if (!mounted) return;
        
        setStats(dashboardData.stats);
        setAlerts({
          compliance: dashboardData.complianceAlerts || [],
          stock: dashboardData.stockAlerts || [],
          maintenance: dashboardData.maintenanceDue || [],
          calibrations: dashboardData.calibrationsDue || []
        });
      } catch (e) {
        console.error('Failed to load dashboard data:', e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const totalAlerts = 
    alerts.compliance.length + 
    alerts.stock.length + 
    alerts.maintenance.filter(m => m.days_overdue).length + 
    alerts.calibrations.filter(c => c.days_overdue).length;

  return (
    <div style={{
      background: 'white',
      borderRadius: '12px',
      padding: '1.25rem',
      marginBottom: '1.5rem',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1rem',
        paddingBottom: '0.5rem',
        borderBottom: '1px solid #f3f4f6'
      }}>
        <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '600' }}>
          Assets Dashboard
        </h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => navigate('/assets/equipment/new')}
            style={{
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.875rem'
            }}
          >
            <Plus size={16} /> Add Equipment
          </button>
          <button
            onClick={() => navigate('/assets/consumables/new')}
            style={{
              background: '#10b981',
              color: 'white',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.875rem'
            }}
          >
            <Plus size={16} /> Add Consumable
          </button>
        </div>
      </div>
      
      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
          Loading statistics...
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem'
        }}>
          <StatCard 
            label="Equipment" 
            value={stats?.equipment_count || 0}
            color="#8b5cf6"
            icon="🚜"
          />
          <StatCard 
            label="Consumables" 
            value={stats?.consumable_count || 0}
            color="#10b981"
            icon="📦"
          />
          <StatCard 
            label="Maintenance Due" 
            value={stats?.assets_needing_maintenance || 0}
            color="#f59e0b"
            icon="🔧"
          />
          <StatCard 
            label="Calibrations Due" 
            value={stats?.assets_needing_calibration || 0}
            color="#06b6d4"
            icon="⚖️"
          />
          <StatCard 
            label="Low Stock Items" 
            value={stats?.low_stock_consumables || 0}
            color="#ef4444"
            icon="⚠️"
          />
          <StatCard 
            label="Compliance Alerts" 
            value={stats?.compliance_alerts || 0}
            color="#dc2626"
            icon="📋"
          />

        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color, icon }) {
  return (
    <div style={{
      textAlign: 'center',
      padding: '0.75rem',
      background: '#f8fafc',
      borderRadius: '8px',
      border: '1px solid #e5e7eb'
    }}>
      <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>
        {icon}
      </div>
      <div style={{ fontSize: '1.8rem', fontWeight: '700', color }}>
        {value}
      </div>
      <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{label}</div>
    </div>
  );
}

function EquipmentTab({ StatusBadge }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [equipment, setEquipment] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const assets = await assetService.listAssets({ 
          asset_type: 'physical',
          limit: 100
        });
        if (!mounted) return;
        setEquipment(Array.isArray(assets) ? assets : []);
      } catch (e) {
        console.error(e);
        if (mounted) setError('Failed to load equipment');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const filtered = equipment.filter(item => {
    if (searchQuery && !item.name?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (categoryFilter && item.category !== categoryFilter) return false;
    if (statusFilter && item.status !== statusFilter) return false;
    return true;
  });

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
        Loading equipment...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        textAlign: 'center', 
        padding: '2rem', 
        color: '#dc2626',
        background: '#fef2f2',
        borderRadius: '8px'
      }}>
        {error}
      </div>
    );
  }

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1rem',
        paddingBottom: '0.5rem',
        borderBottom: '1px solid #f3f4f6'
      }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: '600', margin: 0 }}>
          Equipment & Vehicles ({filtered.length})
        </h2>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input 
          placeholder="Search equipment..." 
          value={searchQuery} 
          onChange={e => setSearchQuery(e.target.value)} 
          style={{ 
            padding: '0.5rem', 
            borderRadius: 6, 
            border: '1px solid #d1d5db',
            flex: 1, 
            minWidth: 200,
            fontSize: '0.875rem'
          }} 
        />
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          style={{
            padding: '0.5rem',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            fontSize: '0.875rem',
            background: 'white'
          }}
        >
          <option value="">All Categories</option>
          <option value="equipment">Equipment</option>
          <option value="vehicle">Vehicle</option>
          <option value="tool">Tool</option>
          <option value="infrastructure">Infrastructure</option>
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{
            padding: '0.5rem',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            fontSize: '0.875rem',
            background: 'white'
          }}
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="maintenance">In Maintenance</option>
          <option value="retired">Retired</option>
        </select>
      </div>

      {filtered.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ 
            width: '100%', 
            borderCollapse: 'collapse',
            fontSize: '0.875rem'
          }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ padding: 12, textAlign: 'left', fontWeight: '600', color: '#374151' }}>Asset #</th>
                <th style={{ padding: 12, textAlign: 'left', fontWeight: '600', color: '#374151' }}>Name</th>
                <th style={{ padding: 12, textAlign: 'left', fontWeight: '600', color: '#374151' }}>Category</th>
                <th style={{ padding: 12, textAlign: 'left', fontWeight: '600', color: '#374151' }}>Make/Model</th>
                <th style={{ padding: 12, textAlign: 'center', fontWeight: '600', color: '#374151' }}>Status</th>
                <th style={{ padding: 12, textAlign: 'center', fontWeight: '600', color: '#374151' }}>Location</th>
                <th style={{ padding: 12, textAlign: 'right', fontWeight: '600', color: '#374151' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr 
                  key={item.id} 
                  style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
                  onMouseEnter={(e) => e.target.closest('tr').style.background = '#f8fafc'}
                  onMouseLeave={(e) => e.target.closest('tr').style.background = 'transparent'}
                  onClick={() => navigate(`/assets/equipment/${item.id}`)}
                >
                  <td style={{ padding: 12, fontWeight: '500', color: '#3b82f6' }}>
                    {item.asset_number}
                  </td>
                  <td style={{ padding: 12, fontWeight: '500' }}>{item.name}</td>
                  <td style={{ padding: 12, textTransform: 'capitalize' }}>{item.category}</td>
                  <td style={{ padding: 12, color: '#6b7280' }}>
                    {item.make && item.model ? `${item.make} ${item.model}` : item.make || item.model || '—'}
                  </td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    <StatusBadge status={item.status} />
                  </td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    {item.location || '—'}
                  </td>
                  <td style={{ padding: 12 }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/assets/equipment/${item.id}`);
                        }}
                        style={{ 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          gap: 6, 
                          padding: '0.25rem 0.5rem', 
                          borderRadius: 4, 
                          background: '#3b82f6', 
                          color: '#fff',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '0.75rem'
                        }}
                      >
                        View <ArrowRight size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ 
          textAlign: 'center',
          padding: '2rem',
          color: '#6b7280',
          fontStyle: 'italic'
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🚜</div>
          <div>No equipment found</div>
          <div style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
            <button
              onClick={() => navigate('/assets/equipment/new')}
              style={{
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem'
              }}
            >
              Add Your First Equipment
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ConsumablesTab({ StatusBadge }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [consumables, setConsumables] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [certificationFilter, setCertificationFilter] = useState('');
  const [stockFilter, setStockFilter] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const assets = await assetService.listAssets({ 
          asset_type: 'consumable',
          limit: 100
        });
        if (!mounted) return;
        setConsumables(Array.isArray(assets) ? assets : []);
      } catch (e) {
        console.error(e);
        if (mounted) setError('Failed to load consumables');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const filtered = consumables.filter(item => {
    if (searchQuery && !item.name?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (certificationFilter && !assetService.helpers.isCertifiedFor(item, certificationFilter)) return false;
    if (stockFilter === 'low' && item.stock_status !== 'low_stock' && item.stock_status !== 'out_of_stock') return false;
    return true;
  });

  const CertificationBadges = ({ item }) => {
    const certs = assetService.helpers.formatCertifications(item.certified_for);
    if (certs.length === 0) return <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>—</span>;
    
    return (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {certs.map(cert => (
          <span
            key={cert.value}
            style={{
              background: `var(--${cert.color}-50, #f0fdf4)`,
              color: `var(--${cert.color}-700, #15803d)`,
              padding: '0.125rem 0.375rem',
              borderRadius: '4px',
              fontSize: '0.65rem',
              fontWeight: '600'
            }}
            title={cert.description}
          >
            {cert.shortLabel}
          </span>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
        Loading consumables...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        textAlign: 'center', 
        padding: '2rem', 
        color: '#dc2626',
        background: '#fef2f2',
        borderRadius: '8px'
      }}>
        {error}
      </div>
    );
  }

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1rem',
        paddingBottom: '0.5rem',
        borderBottom: '1px solid #f3f4f6'
      }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: '600', margin: 0 }}>
          Consumables ({filtered.length})
        </h2>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input 
          placeholder="Search consumables..." 
          value={searchQuery} 
          onChange={e => setSearchQuery(e.target.value)} 
          style={{ 
            padding: '0.5rem', 
            borderRadius: 6, 
            border: '1px solid #d1d5db',
            flex: 1, 
            minWidth: 200,
            fontSize: '0.875rem'
          }} 
        />
        <select
          value={certificationFilter}
          onChange={e => setCertificationFilter(e.target.value)}
          style={{
            padding: '0.5rem',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            fontSize: '0.875rem',
            background: 'white'
          }}
        >
          <option value="">All Certifications</option>
          <option value="organics">Organic</option>
          <option value="regenerative">Regenerative</option>
          <option value="biodynamic">Biodynamic</option>
          <option value="swnz">SWNZ</option>
        </select>
        <select
          value={stockFilter}
          onChange={e => setStockFilter(e.target.value)}
          style={{
            padding: '0.5rem',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            fontSize: '0.875rem',
            background: 'white'
          }}
        >
          <option value="">All Stock Levels</option>
          <option value="low">Low/Out of Stock</option>
        </select>
      </div>

      {filtered.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ 
            width: '100%', 
            borderCollapse: 'collapse',
            fontSize: '0.875rem'
          }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ padding: 12, textAlign: 'left', fontWeight: '600', color: '#374151' }}>Name</th>
                <th style={{ padding: 12, textAlign: 'left', fontWeight: '600', color: '#374151' }}>Type</th>
                <th style={{ padding: 12, textAlign: 'center', fontWeight: '600', color: '#374151' }}>Stock</th>
                <th style={{ padding: 12, textAlign: 'center', fontWeight: '600', color: '#374151' }}>Min</th>
                <th style={{ padding: 12, textAlign: 'center', fontWeight: '600', color: '#374151' }}>Status</th>
                <th style={{ padding: 12, textAlign: 'left', fontWeight: '600', color: '#374151' }}>Certifications</th>
                <th style={{ padding: 12, textAlign: 'right', fontWeight: '600', color: '#374151' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const stockStatus = assetService.helpers.formatStockStatus(item);
                return (
                  <tr 
                    key={item.id} 
                    style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
                    onMouseEnter={(e) => e.target.closest('tr').style.background = '#f8fafc'}
                    onMouseLeave={(e) => e.target.closest('tr').style.background = 'transparent'}
                    onClick={() => navigate(`/assets/consumables/${item.id}`)}
                  >
                    <td style={{ padding: 12, fontWeight: '500' }}>{item.name}</td>
                    <td style={{ padding: 12, textTransform: 'capitalize', color: '#6b7280' }}>
                      {item.subcategory?.replace('_', ' ') || item.category}
                    </td>
                    <td style={{ padding: 12, textAlign: 'center', fontWeight: '600' }}>
                      {parseFloat(item.current_stock || 0).toFixed(1)} {item.unit_of_measure || 'units'}
                    </td>
                    <td style={{ padding: 12, textAlign: 'center', color: '#6b7280' }}>
                      {item.minimum_stock ? `${parseFloat(item.minimum_stock).toFixed(1)}` : '—'}
                    </td>
                    <td style={{ padding: 12, textAlign: 'center' }}>
                      <span style={{
                        background: stockStatus.color === 'green' ? '#dcfce7' : stockStatus.color === 'orange' ? '#fef3c7' : '#fef2f2',
                        color: stockStatus.color === 'green' ? '#166534' : stockStatus.color === 'orange' ? '#92400e' : '#dc2626',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '999px',
                        fontSize: '0.7rem',
                        fontWeight: '600'
                      }}>
                        {stockStatus.icon} {stockStatus.label}
                      </span>
                    </td>
                    <td style={{ padding: 12 }}>
                      <CertificationBadges item={item} />
                    </td>
                    <td style={{ padding: 12 }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/assets/consumables/${item.id}`);
                          }}
                          style={{ 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: 6, 
                            padding: '0.25rem 0.5rem', 
                            borderRadius: 4, 
                            background: '#10b981', 
                            color: '#fff',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.75rem'
                          }}
                        >
                          View <ArrowRight size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ 
          textAlign: 'center',
          padding: '2rem',
          color: '#6b7280',
          fontStyle: 'italic'
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📦</div>
          <div>No consumables found</div>
          <div style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
            <button
              onClick={() => navigate('/assets/consumables/new')}
              style={{
                background: '#10b981',
                color: 'white',
                border: 'none',
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem'
              }}
            >
              Add Your First Consumable
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MaintenanceTab({ StatusBadge }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [maintenance, setMaintenance] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const [maintenanceData, dueMaintenance] = await Promise.all([
          assetService.maintenance.listMaintenance({ limit: 50 }),
          assetService.maintenance.getMaintenanceDue({ days_ahead: 30 })
        ]);
        
        if (!mounted) return;
        
        // Combine and deduplicate
        const allMaintenance = [...(Array.isArray(maintenanceData) ? maintenanceData : [])];
        setMaintenance(allMaintenance);
      } catch (e) {
        console.error(e);
        if (mounted) setError('Failed to load maintenance records');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const filtered = maintenance.filter(item => {
    if (searchQuery && !item.title?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (statusFilter && item.status !== statusFilter) return false;
    if (typeFilter && item.maintenance_type !== typeFilter) return false;
    return true;
  });

  const PriorityIndicator = ({ maintenance }) => {
    const color = assetService.helpers.getMaintenancePriorityColor(maintenance);
    const isOverdue = assetService.helpers.isMaintenanceOverdue(maintenance);
    const daysInfo = assetService.helpers.calculateDaysUntilDue(maintenance.scheduled_date);
    
    let label = 'Normal';
    let icon = <Clock size={14} />;
    
    if (isOverdue) {
      label = `${daysInfo.days}d Overdue`;
      icon = <AlertTriangle size={14} />;
    } else if (daysInfo.is_due_soon) {
      label = 'Due Soon';
      icon = <Clock size={14} />;
    }
    
    const colorMap = {
      red: { bg: '#fef2f2', color: '#dc2626' },
      orange: { bg: '#fff7ed', color: '#ea580c' },
      yellow: { bg: '#fefce8', color: '#ca8a04' },
      blue: { bg: '#eff6ff', color: '#2563eb' }
    };
    
    const style = colorMap[color] || colorMap.blue;
    
    return (
      <span style={{
        background: style.bg,
        color: style.color,
        padding: '0.25rem 0.5rem',
        borderRadius: '999px',
        fontSize: '0.7rem',
        fontWeight: '600',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem'
      }}>
        {icon} {label}
      </span>
    );
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
        Loading maintenance records...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        textAlign: 'center', 
        padding: '2rem', 
        color: '#dc2626',
        background: '#fef2f2',
        borderRadius: '8px'
      }}>
        {error}
      </div>
    );
  }

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1rem',
        paddingBottom: '0.5rem',
        borderBottom: '1px solid #f3f4f6'
      }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: '600', margin: 0 }}>
          Maintenance Schedule ({filtered.length})
        </h2>
        <button
          onClick={() => navigate('/assets/maintenance/new')}
          style={{
            background: '#8b5cf6',
            color: 'white',
            border: 'none',
            padding: '0.5rem 0.75rem',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.813rem'
          }}
        >
          <Plus size={14} /> Schedule Maintenance
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input 
          placeholder="Search maintenance..." 
          value={searchQuery} 
          onChange={e => setSearchQuery(e.target.value)} 
          style={{ 
            padding: '0.5rem', 
            borderRadius: 6, 
            border: '1px solid #d1d5db',
            flex: 1, 
            minWidth: 200,
            fontSize: '0.875rem'
          }} 
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{
            padding: '0.5rem',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            fontSize: '0.875rem',
            background: 'white'
          }}
        >
          <option value="">All Statuses</option>
          <option value="scheduled">Scheduled</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          style={{
            padding: '0.5rem',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            fontSize: '0.875rem',
            background: 'white'
          }}
        >
          <option value="">All Types</option>
          <option value="scheduled">Scheduled</option>
          <option value="reactive">Reactive</option>
          <option value="emergency">Emergency</option>
          <option value="compliance">Compliance</option>
        </select>
      </div>

      {filtered.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ 
            width: '100%', 
            borderCollapse: 'collapse',
            fontSize: '0.875rem'
          }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ padding: 12, textAlign: 'left', fontWeight: '600', color: '#374151' }}>Title</th>
                <th style={{ padding: 12, textAlign: 'left', fontWeight: '600', color: '#374151' }}>Asset</th>
                <th style={{ padding: 12, textAlign: 'left', fontWeight: '600', color: '#374151' }}>Type</th>
                <th style={{ padding: 12, textAlign: 'center', fontWeight: '600', color: '#374151' }}>Scheduled</th>
                <th style={{ padding: 12, textAlign: 'center', fontWeight: '600', color: '#374151' }}>Priority</th>
                <th style={{ padding: 12, textAlign: 'center', fontWeight: '600', color: '#374151' }}>Status</th>
                <th style={{ padding: 12, textAlign: 'right', fontWeight: '600', color: '#374151' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr 
                  key={item.id} 
                  style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
                  onMouseEnter={(e) => e.target.closest('tr').style.background = '#f8fafc'}
                  onMouseLeave={(e) => e.target.closest('tr').style.background = 'transparent'}
                  onClick={() => navigate(`/assets/maintenance/${item.id}`)}
                >
                  <td style={{ padding: 12, fontWeight: '500' }}>
                    {item.title || `Maintenance #${item.id}`}
                  </td>
                  <td style={{ padding: 12, color: '#6b7280' }}>
                    {item.asset_name || `Asset #${item.asset_id}`}
                  </td>
                  <td style={{ padding: 12, textTransform: 'capitalize' }}>
                    {item.maintenance_type?.replace('_', ' ') || '—'}
                  </td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    {item.scheduled_date ? dayjs(item.scheduled_date).format('MMM D, YYYY') : '—'}
                  </td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    <PriorityIndicator maintenance={item} />
                  </td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    <StatusBadge status={item.status} />
                  </td>
                  <td style={{ padding: 12 }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/assets/maintenance/${item.id}`);
                        }}
                        style={{ 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          gap: 6, 
                          padding: '0.25rem 0.5rem', 
                          borderRadius: 4, 
                          background: '#8b5cf6', 
                          color: '#fff',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '0.75rem'
                        }}
                      >
                        View <ArrowRight size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ 
          textAlign: 'center',
          padding: '2rem',
          color: '#6b7280',
          fontStyle: 'italic'
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔧</div>
          <div>No maintenance records found</div>
          <div style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
            <button
              onClick={() => navigate('/assets/maintenance/new')}
              style={{
                background: '#8b5cf6',
                color: 'white',
                border: 'none',
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem'
              }}
            >
              Schedule First Maintenance
            </button>
          </div>
        </div>
      )}
    </div>
  );
}