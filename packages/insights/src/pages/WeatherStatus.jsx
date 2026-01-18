// src/pages/WeatherStatus.jsx - Weather Infrastructure Monitoring
import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { 
  Cloud, 
  CloudOff, 
  AlertTriangle,
  Activity,
  RefreshCw,
  Database,
  Clock,
  MapPin,
  ChevronRight,
  Check
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import adminService from '../services/adminService';
import './admin.css';

// Status Badge Component
const StatusBadge = ({ status, size = 'md' }) => {
  const config = {
    healthy: { icon: Check, label: 'Healthy' },
    stale: { icon: AlertTriangle, label: 'Stale' },
    offline: { icon: CloudOff, label: 'Offline' },
  };
  
  const { icon: Icon, label } = config[status] || config.offline;
  
  return (
    <span className={`status-badge status-${status}`}>
      <Icon size={size === 'lg' ? 16 : 12} />
      {label}
    </span>
  );
};

// Station Card Component
const StationCard = ({ station }) => {
  const { health } = station;
  
  const formatHours = (hours) => {
    if (hours === null || hours === undefined) return 'Never';
    if (hours < 1) return `${Math.round(hours * 60)}m ago`;
    if (hours < 24) return `${Math.round(hours)}h ago`;
    return `${Math.round(hours / 24)}d ago`;
  };

  const getCompletionColor = (pct) => {
    if (pct >= 95) return 'green';
    if (pct >= 80) return 'yellow';
    return 'red';
  };

  return (
    <Link to={`/admin/weather/${station.station_id}`} className="station-card">
      <div className="station-card-header">
        <div>
          <h3 className="station-card-title">{station.station_name || station.station_code}</h3>
          <p className="station-card-subtitle">{station.station_code}</p>
        </div>
        <StatusBadge status={health.status} />
      </div>
      
      <div className="station-card-stats">
        <div className="station-card-stat">
          <span className="station-card-stat-label">
            <Database size={16} /> Source
          </span>
          <span className="station-card-stat-value">{station.data_source}</span>
        </div>
        
        {station.region && (
          <div className="station-card-stat">
            <span className="station-card-stat-label">
              <MapPin size={16} /> Region
            </span>
            <span className="station-card-stat-value">{station.region}</span>
          </div>
        )}
        
        <div className="station-card-stat">
          <span className="station-card-stat-label">
            <Clock size={16} /> Last Data
          </span>
          <span className="station-card-stat-value">{formatHours(health.hours_since_last_data)}</span>
        </div>
        
        <div className="station-card-stat">
          <span className="station-card-stat-label">
            <Activity size={16} /> 24h Complete
          </span>
          <span className={`station-card-stat-value ${getCompletionColor(health.completeness_24h_pct)}`}>
            {health.completeness_24h_pct}%
          </span>
        </div>
      </div>
      
      {station.variables_available && station.variables_available.length > 0 && (
        <div className="station-card-variables">
          {station.variables_available.slice(0, 4).map((v) => (
            <span key={v} className="station-card-variable">{v}</span>
          ))}
          {station.variables_available.length > 4 && (
            <span className="station-card-variable">+{station.variables_available.length - 4}</span>
          )}
        </div>
      )}
      
      <div className="station-card-footer">
        View details <ChevronRight size={16} />
      </div>
    </Link>
  );
};

// Ingestion Logs Panel Component
const IngestionLogsPanel = ({ logs, summary }) => {
  if (!logs || logs.length === 0) {
    return (
      <div className="card">
        <div className="card-header">
          <h3>Recent Ingestion Runs</h3>
        </div>
        <div className="card-body">
          <p className="text-muted">No ingestion logs found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3>Recent Ingestion Runs</h3>
        {summary && (
          <p>{summary.overall_success_rate_pct}% success rate over {summary.period_days} days</p>
        )}
      </div>
      
      <div style={{ maxHeight: '24rem', overflowY: 'auto' }}>
        {logs.slice(0, 20).map((log) => (
          <div key={log.log_id} className="ingestion-log-item">
            <div className="ingestion-log-header">
              <div className="ingestion-log-source">
                <span className={`ingestion-log-dot ${log.status === 'success' ? 'success' : log.status === 'failed' ? 'failed' : 'pending'}`} />
                <span className="ingestion-log-name">{log.data_source}</span>
                {log.station_code && (
                  <span className="ingestion-log-station">({log.station_code})</span>
                )}
              </div>
              <span className={`badge ${log.status === 'success' ? 'badge-green' : log.status === 'failed' ? 'badge-red' : 'badge-gray'}`}>
                {log.status}
              </span>
            </div>
            
            <div className="ingestion-log-meta">
              <span>{new Date(log.start_time).toLocaleString()}</span>
              {log.duration_seconds && <span>{Math.round(log.duration_seconds)}s</span>}
              {log.records_inserted !== null && <span>{log.records_inserted} records</span>}
            </div>
            
            {log.error_msg && (
              <p className="ingestion-log-error">{log.error_msg}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// Main Component
const WeatherStatus = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stations, setStations] = useState([]);
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState(null);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [variableFilter, setVariableFilter] = useState('');

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const [stationsRes, logsRes, summaryRes] = await Promise.all([
        adminService.weather.listStations({
          status: statusFilter || undefined,
          data_source: sourceFilter || undefined,
          region: regionFilter || undefined,
        }),
        adminService.weather.getIngestionLogs({ days: 7, page_size: 50 }),
        adminService.weather.getIngestionSummary(7),
      ]);
      
      setStations(stationsRes.stations);
      setStats(stationsRes.summary);
      setLogs(logsRes.logs);
      setSummary(summaryRes);
    } catch (err) {
      console.error('Failed to fetch weather data:', err);
      setError('Failed to load weather infrastructure data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [statusFilter, sourceFilter, regionFilter]);

  // Derive filter options from stats/stations
  const sources = stats?.by_source ? Object.keys(stats.by_source) : [];
  const regions = stats?.by_region ? Object.keys(stats.by_region).filter(r => r !== 'unspecified') : [];
  
  // Get all unique variables across stations
  const allVariables = useMemo(() => {
    const vars = new Set();
    stations.forEach(station => {
      (station.variables_available || []).forEach(v => vars.add(v));
    });
    return Array.from(vars).sort();
  }, [stations]);

  // Apply client-side variable filter (since API doesn't support it)
  const filteredStations = useMemo(() => {
    if (!variableFilter) return stations;
    return stations.filter(station => 
      (station.variables_available || []).includes(variableFilter)
    );
  }, [stations, variableFilter]);

  // Clear all filters
  const clearFilters = () => {
    setStatusFilter('');
    setSourceFilter('');
    setRegionFilter('');
    setVariableFilter('');
  };

  const hasActiveFilters = statusFilter || sourceFilter || regionFilter || variableFilter;

  return (
    <AdminLayout 
      title="Weather Infrastructure" 
      subtitle={`${stats?.active_stations || 0} active stations across ${sources.length} sources`}
    >
      {/* Refresh Button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <button onClick={fetchData} className="btn btn-secondary">
          <RefreshCw size={16} className={loading ? 'loading-spinner' : ''} />
          Refresh
        </button>
      </div>

      {/* Summary Stats */}
      {stats && (
        <div className="stats-grid mb-6">
          <div className="stats-card green">
            <div className="stats-card-content">
              <div>
                <p className="stats-card-title">Healthy</p>
                <p className="stats-card-value">{stats.healthy_stations}</p>
              </div>
              <div className="stats-card-icon"><Check size={24} /></div>
            </div>
          </div>
          <div className="stats-card yellow">
            <div className="stats-card-content">
              <div>
                <p className="stats-card-title">Stale</p>
                <p className="stats-card-value">{stats.stale_stations}</p>
              </div>
              <div className="stats-card-icon"><AlertTriangle size={24} /></div>
            </div>
          </div>
          <div className="stats-card red">
            <div className="stats-card-content">
              <div>
                <p className="stats-card-title">Offline</p>
                <p className="stats-card-value">{stats.offline_stations}</p>
              </div>
              <div className="stats-card-icon"><CloudOff size={24} /></div>
            </div>
          </div>
          <div className="stats-card blue">
            <div className="stats-card-content">
              <div>
                <p className="stats-card-title">Records (7d)</p>
                <p className="stats-card-value">{stats.records_last_7d?.toLocaleString()}</p>
              </div>
              <div className="stats-card-icon"><Database size={24} /></div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem', alignItems: 'center' }}>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="form-select"
          style={{ width: 'auto' }}
        >
          <option value="">All Status</option>
          <option value="healthy">Healthy</option>
          <option value="stale">Stale</option>
          <option value="offline">Offline</option>
        </select>
        
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="form-select"
          style={{ width: 'auto' }}
        >
          <option value="">All Sources</option>
          {sources.map((source) => (
            <option key={source} value={source}>{source}</option>
          ))}
        </select>

        <select
          value={regionFilter}
          onChange={(e) => setRegionFilter(e.target.value)}
          className="form-select"
          style={{ width: 'auto' }}
        >
          <option value="">All Regions</option>
          {regions.map((region) => (
            <option key={region} value={region}>{region}</option>
          ))}
        </select>

        <select
          value={variableFilter}
          onChange={(e) => setVariableFilter(e.target.value)}
          className="form-select"
          style={{ width: 'auto' }}
        >
          <option value="">All Variables</option>
          {allVariables.map((variable) => (
            <option key={variable} value={variable}>{variable}</option>
          ))}
        </select>

        {hasActiveFilters && (
          <button onClick={clearFilters} className="btn btn-secondary" style={{ marginLeft: 'auto' }}>
            Clear Filters
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="error-container">
          <p className="error-text">{error}</p>
        </div>
      )}

      {/* Main Content */}
      {loading ? (
        <div className="loading-container">
          <div className="loading-spinner"><RefreshCw size={32} /></div>
        </div>
      ) : (
        <div className="two-column-grid">
          {/* Stations Grid */}
          <div>
            <h2 className="section-title mb-4">Weather Stations ({filteredStations.length})</h2>
            
            {filteredStations.length === 0 ? (
              <div className="card">
                <div className="empty-state">
                  <div className="empty-state-icon"><Cloud size={48} /></div>
                  <p className="empty-state-text">No stations found matching filters.</p>
                </div>
              </div>
            ) : (
              <div className="stations-grid">
                {filteredStations.map((station) => (
                  <StationCard key={station.station_id} station={station} />
                ))}
              </div>
            )}
          </div>
          
          {/* Ingestion Logs */}
          <div>
            <h2 className="section-title mb-4">Ingestion Activity</h2>
            <IngestionLogsPanel logs={logs} summary={summary} />
            
            {/* Source Summary */}
            {summary?.by_source && summary.by_source.length > 0 && (
              <div className="card mt-4">
                <div className="card-header">
                  <h3>Success by Source</h3>
                </div>
                <div className="card-body">
                  {summary.by_source.map((src) => (
                    <div key={src.data_source} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span className="text-sm">{src.data_source}</span>
                      <div className="progress-with-label">
                        <div className="progress-bar">
                          <div 
                            className={`progress-bar-fill ${src.success_rate_pct >= 95 ? 'green' : src.success_rate_pct >= 80 ? 'yellow' : 'red'}`}
                            style={{ width: `${src.success_rate_pct}%` }}
                          />
                        </div>
                        <span className={`progress-label ${src.success_rate_pct >= 95 ? 'green' : src.success_rate_pct >= 80 ? 'yellow' : 'red'}`}>
                          {src.success_rate_pct}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default WeatherStatus;