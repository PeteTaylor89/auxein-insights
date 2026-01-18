// src/pages/StationDetail.jsx - Weather Station Detail View
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { 
  Cloud, CloudOff, AlertTriangle, Check, MapPin, Database, Clock, Activity,
  RefreshCw, Thermometer, Droplets, Wind, Sun, ChevronDown, ChevronUp
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import adminService from '../services/adminService';
import './admin.css';

// Status Badge
const StatusBadge = ({ status, size = 'md' }) => {
  const config = {
    healthy: { icon: Check, label: 'Healthy' },
    stale: { icon: AlertTriangle, label: 'Stale' },
    offline: { icon: CloudOff, label: 'Offline' },
  };
  const { icon: Icon, label } = config[status] || config.offline;
  return (
    <span className={`status-badge status-${status}`}>
      <Icon size={size === 'lg' ? 16 : 12} /> {label}
    </span>
  );
};

// Metric Card
const MetricCard = ({ label, value, unit, icon: Icon, color = 'blue' }) => (
  <div className={`metric-card ${color}`}>
    <div className="metric-card-label"><Icon size={16} />{label}</div>
    <p className="metric-card-value">{value}{unit && <span className="metric-card-unit">{unit}</span>}</p>
  </div>
);

// Variable Coverage Table
const VariableCoverageTable = ({ coverage }) => {
  if (!coverage?.length) return <p className="text-muted">No coverage data.</p>;
  
  const getColor = (pct) => pct >= 95 ? 'green' : pct >= 80 ? 'yellow' : 'red';
  
  return (
    <div className="table-container">
      <table className="admin-table">
        <thead>
          <tr><th>Variable</th><th>Records (7d)</th><th>Expected</th><th>Coverage</th></tr>
        </thead>
        <tbody>
          {coverage.map((v) => (
            <tr key={v.variable}>
              <td className="font-medium">{v.variable}</td>
              <td>{v.record_count.toLocaleString()}</td>
              <td className="text-muted">{v.expected_count.toLocaleString()}</td>
              <td>
                <div className="progress-with-label">
                  <div className="progress-bar">
                    <div className={`progress-bar-fill ${getColor(v.coverage_pct)}`} style={{ width: `${Math.min(100, v.coverage_pct)}%` }} />
                  </div>
                  <span className={`progress-label ${getColor(v.coverage_pct)}`}>{v.coverage_pct}%</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// Recent Data Table
const RecentDataTable = ({ data }) => {
  const [expanded, setExpanded] = useState(false);
  if (!data?.length) return <p className="text-muted">No recent data.</p>;

  const displayData = expanded ? data : data.slice(0, 20);
  const getIcon = (v) => {
    const lower = v.toLowerCase();
    if (lower.includes('temp')) return Thermometer;
    if (lower.includes('rain') || lower.includes('humid')) return Droplets;
    if (lower.includes('wind')) return Wind;
    if (lower.includes('solar')) return Sun;
    return Activity;
  };

  return (
    <div>
      <div className="scrollable-table">
        <table className="admin-table">
          <thead>
            <tr><th>Time</th><th>Variable</th><th>Value</th><th>Quality</th></tr>
          </thead>
          <tbody>
            {displayData.map((r, i) => {
              const Icon = getIcon(r.variable);
              return (
                <tr key={i}>
                  <td className="text-muted">{new Date(r.timestamp).toLocaleString('en-NZ', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                  <td><Icon size={12} /> {r.variable}</td>
                  <td className="font-medium">{r.value !== null ? r.value.toFixed(2) : '-'}{r.unit && <span className="text-muted"> {r.unit}</span>}</td>
                  <td>{r.quality ? <span className={`badge ${r.quality === 'good' ? 'badge-green' : 'badge-yellow'}`}>{r.quality}</span> : '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {data.length > 20 && (
        <button onClick={() => setExpanded(!expanded)} className={`show-more-btn ${expanded ? 'expanded' : ''}`}>
          {expanded ? 'Show less' : `Show all ${data.length} records`}
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      )}
    </div>
  );
};

const StationDetail = () => {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [station, setStation] = useState(null);

  const fetchStation = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminService.weather.getStation(id);
      setStation(data);
    } catch (err) {
      setError('Failed to load station details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStation(); }, [id]);

  const formatHours = (h) => {
    if (h === null || h === undefined) return 'Never';
    if (h < 1) return `${Math.round(h * 60)} min ago`;
    if (h < 24) return `${Math.round(h)} hrs ago`;
    if (h < 48) return 'Yesterday';
    return `${Math.round(h / 24)} days ago`;
  };

  const getColor = (pct) => pct >= 95 ? 'green' : pct >= 80 ? 'yellow' : 'red';

  if (loading) {
    return (
      <AdminLayout backLink="/admin/weather" backText="Back to weather">
        <div className="loading-container"><div className="loading-spinner"><RefreshCw size={32} /></div></div>
      </AdminLayout>
    );
  }

  if (error && !station) {
    return (
      <AdminLayout backLink="/admin/weather" backText="Back to weather">
        <div className="error-container"><p className="error-text">{error}</p></div>
      </AdminLayout>
    );
  }

  const { health } = station;

  return (
    <AdminLayout backLink="/admin/weather" backText="Back to weather">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>{station.station_name || station.station_code}</h1>
          <p className="text-muted">
            <span className="font-mono">{station.station_code}</span> • {station.data_source}
            {station.region && <> • <MapPin size={14} /> {station.region}</>}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <StatusBadge status={health.status} size="lg" />
          <button onClick={fetchStation} className="btn btn-icon btn-secondary"><RefreshCw size={20} /></button>
        </div>
      </div>

      {/* Health Metrics */}
      <div className="stats-grid mb-6">
        <MetricCard label="Last Data" value={formatHours(health.hours_since_last_data)} icon={Clock} color={health.hours_since_last_data < 2 ? 'green' : health.hours_since_last_data < 24 ? 'yellow' : 'red'} />
        <MetricCard label="24h Records" value={health.records_last_24h.toLocaleString()} unit={`/ ${health.expected_records_24h}`} icon={Database} color={getColor(health.completeness_24h_pct)} />
        <MetricCard label="24h Complete" value={health.completeness_24h_pct} unit="%" icon={Activity} color={getColor(health.completeness_24h_pct)} />
        <MetricCard label="7d Complete" value={health.completeness_7d_pct} unit="%" icon={Activity} color={getColor(health.completeness_7d_pct)} />
      </div>

      <div className="two-column-grid">
        {/* Station Info */}
        <div className="card">
          <div className="card-header"><h2>Station Info</h2></div>
          <div className="card-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div><p className="text-muted text-sm">Station ID</p><p className="font-mono">{station.station_id}</p></div>
              {station.source_id && <div><p className="text-muted text-sm">Source ID</p><p className="font-mono">{station.source_id}</p></div>}
              <div><p className="text-muted text-sm">Data Source</p><p>{station.data_source}</p></div>
              {station.latitude && station.longitude && (
                <div><p className="text-muted text-sm">Location</p><p>{parseFloat(station.latitude).toFixed(4)}, {parseFloat(station.longitude).toFixed(4)}</p></div>
              )}
              {station.elevation && <div><p className="text-muted text-sm">Elevation</p><p>{station.elevation}m</p></div>}
              <div><p className="text-muted text-sm">Status</p><p className={station.is_active ? 'text-green' : 'text-red'}>{station.is_active ? 'Active' : 'Inactive'}</p></div>
              <div><p className="text-muted text-sm">Created</p><p>{new Date(station.created_at).toLocaleDateString('en-NZ')}</p></div>
            </div>

            {station.variables_available?.length > 0 && (
              <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #e5e7eb' }}>
                <p className="text-muted text-sm mb-2">Available Variables</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {station.variables_available.map((v) => <span key={v} className="badge badge-gray">{v}</span>)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Coverage & Data */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="card">
            <div className="card-header"><h2>Variable Coverage (7 Days)</h2></div>
            <div className="card-body"><VariableCoverageTable coverage={station.variable_coverage} /></div>
          </div>

          <div className="card">
            <div className="card-header"><h2>Recent Data</h2></div>
            <div className="card-body"><RecentDataTable data={station.recent_data} /></div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default StationDetail;