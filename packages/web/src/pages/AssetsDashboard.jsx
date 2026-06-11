import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  Settings,
  TrendingUp,
  Sliders,
} from 'lucide-react';
import { assetService, authService } from '@vineyard/shared';
import MobileNavigation from '../components/MobileNavigation';
import HelpTip from '../components/HelpTip';
import QuickStockAdjustment from '../components/QuickStockAdjustment';
import CalibrationsTab from './Calibrations';
import './AssetsDashboard.css';

const VALID_TABS = new Set(['equipment', 'consumables', 'maintenance', 'calibrations']);

export default function AssetsDashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');
  const tab = VALID_TABS.has(urlTab) ? urlTab : 'equipment';
  const setTab = (next) => {
    if (next === 'equipment') {
      // Drop the query param for the default tab so /assets stays the clean URL.
      const sp = new URLSearchParams(searchParams);
      sp.delete('tab');
      setSearchParams(sp, { replace: false });
    } else {
      setSearchParams({ ...Object.fromEntries(searchParams), tab: next }, { replace: false });
    }
  };
  const [showQuickAdjustment, setShowQuickAdjustment] = useState(false);
  const [selectedConsumableId, setSelectedConsumableId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const StatusBadge = ({ status }) => {
    const cls = `ad-badge ad-badge--${status?.toLowerCase() || 'default'}`;
    return <span className={cls}>{status?.replace('_', ' ')}</span>;
  };

  useEffect(() => {
    document.body.classList.add("primary-bg");
    return () => document.body.classList.remove("primary-bg");
  }, []);

  return (
    <div className="page-container">
        <DashboardStats key={`stats-${refreshKey}`} />

        <div className="ad-tab-card">
          <div className="ad-tab-bar">
            <button className={`ad-tab ${tab === 'equipment' ? 'active' : ''}`} onClick={() => setTab('equipment')}>
              <Truck size={16} /> Equipment
            </button>
            <button className={`ad-tab ${tab === 'consumables' ? 'active' : ''}`} onClick={() => setTab('consumables')}>
              <Droplet size={16} /> Consumables
            </button>
            <button className={`ad-tab ${tab === 'maintenance' ? 'active' : ''}`} onClick={() => setTab('maintenance')}>
              <Calendar size={16} /> Maintenance
            </button>
            <button className={`ad-tab ${tab === 'calibrations' ? 'active' : ''}`} onClick={() => setTab('calibrations')}>
              <Sliders size={16} /> Calibrations
            </button>
          </div>

          <div className="ad-tab-content">
            {tab === 'equipment' && <EquipmentTab StatusBadge={StatusBadge} />}
            {tab === 'consumables' && (
              <ConsumablesTab
                StatusBadge={StatusBadge}
                onQuickAdjust={(consumableId) => {
                  setSelectedConsumableId(consumableId);
                  setShowQuickAdjustment(true);
                }}
                key={`consumables-${refreshKey}`}
              />
            )}
            {tab === 'maintenance' && <MaintenanceTab StatusBadge={StatusBadge} />}
            {tab === 'calibrations' && <CalibrationsTab />}
          </div>
        </div>

      <QuickStockAdjustment
        isOpen={showQuickAdjustment}
        initialAssetId={selectedConsumableId}
        onClose={() => {
          setShowQuickAdjustment(false);
          setSelectedConsumableId(null);
        }}
        onSuccess={() => {
          setRefreshKey(prev => prev + 1);
          setShowQuickAdjustment(false);
          setSelectedConsumableId(null);
        }}
      />
      <MobileNavigation />
    </div>
  );
}

function DashboardStats() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState({ compliance: [], stock: [], maintenance: [], calibrations: [] });
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

  return (
    <div className="ad-stats-card">
      <div className="ad-stats-header">
        <h1>Asset Management Dashboard</h1>
        <div className="ad-stats-actions">
          <button className="ad-btn-primary" onClick={() => navigate('/assets/equipment/new')}>
            <Plus size={16} /> Register Asset / Equipment
          </button>
          <button className="ad-btn-success" onClick={() => navigate('/assets/consumables/new')}>
            <Plus size={16} /> Register Stock / Consumable
          </button>
        </div>
      </div>

      {loading ? (
        <div className="ad-loading">Loading statistics...</div>
      ) : (
        <div className="ad-stats-grid">
          <StatCard label="Equipment" value={stats?.equipment_count || 0} color="var(--color-primary)" icon="🚜" />
          <StatCard label="Consumables" value={stats?.consumable_count || 0} color="var(--color-success)" icon="📦" />
          <StatCard label="Maintenance Due" value={stats?.assets_needing_maintenance || 0} color="var(--color-warning)" icon="🔧" />
          <StatCard label="Calibrations Due" value={stats?.assets_needing_calibration || 0} color="var(--color-info)" icon="⚖️" />
          <StatCard label="Low Stock Items" value={stats?.low_stock_consumables || 0} color="var(--color-danger)" icon="⚠️" />
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color, icon }) {
  return (
    <div className="ad-stat">
      <div className="ad-stat-icon">{icon}</div>
      <div className="ad-stat-value" style={{ color }}>{value}</div>
      <div className="ad-stat-label">{label}</div>
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
        const assets = await assetService.listAssets({ asset_type: 'physical', limit: 100 });
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

  if (loading) return <div className="ad-loading">Loading equipment...</div>;
  if (error) return <div className="ad-error">{error}</div>;

  return (
    <div>
      <div className="ad-section-header">
        <span className="help-tip-head"><h2>Equipment & Vehicles ({filtered.length})</h2><HelpTip topic="assets.equipment" /></span>
        <button className="ad-btn-primary" onClick={() => navigate('/assets/equipment/new')}>
          <Plus size={14} /> Register Equipment
        </button>
      </div>

      <div className="ad-filters">
        <input className="ad-search" placeholder="Search equipment..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        <select className="ad-filter-select" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
          <option value="">All Categories</option>
          <option value="equipment">Equipment</option>
          <option value="vehicle">Vehicle</option>
          <option value="tool">Tool</option>
          <option value="infrastructure">Infrastructure</option>
        </select>
        <select className="ad-filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="maintenance">In Maintenance</option>
          <option value="retired">Retired</option>
        </select>
      </div>

      {filtered.length > 0 ? (
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead>
              <tr>
                <th>Asset #</th>
                <th>Name</th>
                <th>Category</th>
                <th>Make/Model</th>
                <th className="center">Status</th>
                <th className="center">Location</th>
                <th className="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr key={item.id} onClick={() => navigate(`/assets/equipment/${item.id}/edit`)}>
                  <td className="link">{item.asset_number}</td>
                  <td className="bold">{item.name}</td>
                  <td className="capitalize">{item.category}</td>
                  <td className="muted">
                    {item.make && item.model ? `${item.make} ${item.model}` : item.make || item.model || '—'}
                  </td>
                  <td className="center"><StatusBadge status={item.status} /></td>
                  <td className="center">{item.location_label || '—'}</td>
                  <td className="right">
                    <div className="ad-actions-cell">
                      <button className="ad-btn-primary ad-btn-sm" onClick={(e) => { e.stopPropagation(); navigate(`/assets/equipment/${item.id}/edit`); }}>
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
        <div className="ad-empty">
          <div className="ad-empty-icon">🚜</div>
          <div>No equipment found</div>
          <div className="ad-empty-cta">
            <button className="ad-btn-primary" onClick={() => navigate('/assets/equipment/new')}>Add Your First Equipment</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ConsumablesTab({ StatusBadge, onQuickAdjust }) {
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
        const assets = await assetService.listAssets({ asset_type: 'consumable', limit: 100 });
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
    if (certs.length === 0) return <span className="ad-stat-label">—</span>;
    return (
      <div className="ad-cert-badges">
        {certs.map(cert => (
          <span key={cert.value} className="ad-cert-badge" title={cert.description}>{cert.shortLabel}</span>
        ))}
      </div>
    );
  };

  if (loading) return <div className="ad-loading">Loading consumables...</div>;
  if (error) return <div className="ad-error">{error}</div>;

  return (
    <div>
      <div className="ad-section-header">
        <span className="help-tip-head"><h2>Consumables ({filtered.length})</h2><HelpTip topic="assets.consumables" /></span>
        <button className="ad-btn-primary" onClick={() => navigate('/assets/consumables/new')}>
          <Plus size={14} /> Register Consumable
        </button>
      </div>

      <div className="ad-filters">
        <input className="ad-search" placeholder="Search consumables..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        <select className="ad-filter-select" value={certificationFilter} onChange={e => setCertificationFilter(e.target.value)}>
          <option value="">All Certifications</option>
          <option value="organics">Organic</option>
          <option value="regenerative">Regenerative</option>
          <option value="biodynamic">Biodynamic</option>
          <option value="swnz">SWNZ</option>
        </select>
        <select className="ad-filter-select" value={stockFilter} onChange={e => setStockFilter(e.target.value)}>
          <option value="">All Stock Levels</option>
          <option value="low">Low/Out of Stock</option>
        </select>
      </div>

      {filtered.length > 0 ? (
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th className="center">Stock</th>
                <th className="center">Min</th>
                <th className="center">Status</th>
                <th>Certifications</th>
                <th className="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const stockStatus = assetService.helpers.formatStockStatus(item);
                const stockColorCls = stockStatus.color === 'green' ? 'ad-stock-badge--green' : stockStatus.color === 'orange' ? 'ad-stock-badge--orange' : 'ad-stock-badge--red';
                return (
                  <tr key={item.id} onClick={() => navigate(`/assets/consumables/${item.id}/edit`)}>
                    <td className="bold">{item.name}</td>
                    <td className="capitalize muted">{item.subcategory?.replace('_', ' ') || item.category}</td>
                    <td className="center bold">{parseFloat(item.current_stock || 0).toFixed(1)} {item.unit_of_measure || 'units'}</td>
                    <td className="center muted">{item.minimum_stock ? `${parseFloat(item.minimum_stock).toFixed(1)}` : '—'}</td>
                    <td className="center">
                      <span className={`ad-stock-badge ${stockColorCls}`}>{stockStatus.icon} {stockStatus.label}</span>
                    </td>
                    <td><CertificationBadges item={item} /></td>
                    <td className="right">
                      <div className="ad-actions-cell">
                        <button className="ad-btn-primary ad-btn-sm" onClick={(e) => { e.stopPropagation(); onQuickAdjust(item.id); }}>
                          <TrendingUp size={14} /> Adjust
                        </button>
                        <button className="ad-btn-primary ad-btn-sm" onClick={(e) => { e.stopPropagation(); navigate(`/assets/consumables/${item.id}/edit`); }}>
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
        <div className="ad-empty">
          <div className="ad-empty-icon">📦</div>
          <div>No consumables found</div>
          <div className="ad-empty-cta">
            <button className="ad-btn-primary" onClick={() => navigate('/assets/consumables/new')}>Add Your First Consumable</button>
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

    return (
      <span className={`ad-priority ad-priority--${color || 'blue'}`}>
        {icon} {label}
      </span>
    );
  };

  if (loading) return <div className="ad-loading">Loading maintenance records...</div>;
  if (error) return <div className="ad-error">{error}</div>;

  return (
    <div>
      <div className="ad-section-header">
        <span className="help-tip-head"><h2>Maintenance Schedule ({filtered.length})</h2><HelpTip topic="assets.maintenance" /></span>
        <button className="ad-btn-primary" onClick={() => navigate('/assets/maintenance/new')}>
          <Plus size={14} /> Schedule Maintenance
        </button>
      </div>

      <div className="ad-filters">
        <input className="ad-search" placeholder="Search maintenance..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        <select className="ad-filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="scheduled">Scheduled</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select className="ad-filter-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">All Types</option>
          <option value="scheduled">Scheduled</option>
          <option value="reactive">Reactive</option>
          <option value="emergency">Emergency</option>
          <option value="compliance">Compliance</option>
        </select>
      </div>

      {filtered.length > 0 ? (
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Asset</th>
                <th>Type</th>
                <th className="center">Scheduled</th>
                <th className="center">Priority</th>
                <th className="center">Status</th>
                <th className="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr key={item.id} onClick={() => navigate(`/assets/equipment/${item.asset_id}/edit`)}>
                  <td className="bold">{item.title || `Maintenance #${item.id}`}</td>
                  <td className="muted">{item.asset_name || `Asset #${item.asset_id}`}</td>
                  <td className="capitalize">{item.maintenance_type?.replace('_', ' ') || '—'}</td>
                  <td className="center">{item.scheduled_date ? dayjs(item.scheduled_date).format('MMM D, YYYY') : '—'}</td>
                  <td className="center"><PriorityIndicator maintenance={item} /></td>
                  <td className="center"><StatusBadge status={item.status} /></td>
                  <td className="right">
                    <div className="ad-actions-cell">
                      <button className="ad-btn-primary ad-btn-sm" onClick={(e) => { e.stopPropagation(); navigate(`/assets/equipment/${item.asset_id}/edit`); }}>
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
        <div className="ad-empty">
          <div className="ad-empty-icon">🔧</div>
          <div>No maintenance records found</div>
          <div className="ad-empty-cta">
            <button className="ad-btn-primary" onClick={() => navigate('/assets/maintenance/new')}>Schedule First Maintenance</button>
          </div>
        </div>
      )}
    </div>
  );
}
