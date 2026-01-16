// src/components/RegionalMap/RegionStatsModal.jsx
import { useState, useMemo } from 'react';
import { X, MapPin, Grape, TrendingUp, BarChart3, Download } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import './RegionStatsModal.css';

// Color palette for varieties
const VARIETY_COLORS = [
  '#199b49', // Green - typically top variety
  '#65cbf3', // Blue
  '#b37af5', // Purple
  '#e2a73a', // Amber
  '#ef8844', // Red
];

function RegionStatsModal({ region, onClose }) {
  const [activeView, setActiveView] = useState('overview'); // 'overview' | 'varieties' | 'comparison'
  const [chartType, setChartType] = useState('pie'); // 'pie' | 'bar'

  if (!region) return null;

  const stats = region.stats || {};
  const varieties = stats.varieties || [];
  const totalArea = stats.total_planted_ha || 0;

  // Prepare chart data
  const chartData = useMemo(() => {
    if (!varieties.length) return [];
    
    // Get top 5 varieties + "Other"
    const top5 = varieties.slice(0, 5);
    const otherPercentage = varieties.slice(5).reduce((sum, v) => sum + (v.percentage || 0), 0);
    
    const data = top5.map((v, i) => ({
      name: v.name,
      value: v.percentage || 0,
      area: v.area_ha || 0,
      color: VARIETY_COLORS[i % VARIETY_COLORS.length]
    }));

    if (otherPercentage > 0) {
      data.push({
        name: 'Other',
        value: otherPercentage,
        area: totalArea - top5.reduce((sum, v) => sum + (v.area_ha || 0), 0),
        color: '#94a3b8'
      });
    }

    return data;
  }, [varieties, totalArea]);

  // Format numbers
  const formatNumber = (num, decimals = 1) => {
    if (!num && num !== 0) return '—';
    return new Intl.NumberFormat('en-NZ', { 
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals
    }).format(num);
  };

  const formatArea = (ha) => {
    if (!ha) return '—';
    if (ha >= 1000) {
      return `${formatNumber(ha / 1000, 1)}k ha`;
    }
    return `${formatNumber(ha, 1)} ha`;
  };

  // Custom tooltip for charts
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="stats-chart-tooltip">
          <p className="tooltip-name">{data.name}</p>
          <p className="tooltip-value">{formatNumber(data.value)}%</p>
          <p className="tooltip-area">{formatNumber(data.area, 2)} ha</p>
        </div>
      );
    }
    return null;
  };

  // Custom legend
  const renderLegend = (props) => {
    const { payload } = props;
    return (
      <div className="stats-chart-legend">
        {payload.map((entry, index) => (
          <div key={`legend-${index}`} className="legend-item">
            <span 
              className="legend-color" 
              style={{ backgroundColor: entry.color }}
            />
            <span className="legend-label">{entry.value}</span>
            <span className="legend-percent">{formatNumber(entry.payload.value)}%</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="stats-modal-overlay" onClick={onClose}>
      <div className="stats-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="stats-modal-header">
          <div className="stats-modal-title">
            <MapPin size={24} />
            <div>
              <h2>{region.name}</h2>
              <span className="stats-subtitle">Regional Statistics {stats.year || 2024}</span>
            </div>
          </div>
          <button className="stats-modal-close" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="stats-modal-tabs">
          <button 
            className={`stats-tab ${activeView === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveView('overview')}
          >
            <BarChart3 size={16} />
            Overview
          </button>
          <button 
            className={`stats-tab ${activeView === 'varieties' ? 'active' : ''}`}
            onClick={() => setActiveView('varieties')}
          >
            <Grape size={16} />
            All Varieties
          </button>
        </div>

        {/* Content */}
        <div className="stats-modal-content">
          {activeView === 'overview' && (
            <>
              {/* Summary Stats */}
              <div className="stats-summary-grid">
                <div className="summary-card">
                  <div className="summary-icon">
                    <MapPin size={20} />
                  </div>
                  <div className="summary-info">
                    <span className="summary-label">Total Planted Area</span>
                    <span className="summary-value">{formatNumber(totalArea, 2)} ha</span>
                  </div>
                </div>
                
                <div className="summary-card">
                  <div className="summary-icon">
                    <Grape size={20} />
                  </div>
                  <div className="summary-info">
                    <span className="summary-label">Varieties Grown</span>
                    <span className="summary-value">{varieties.length}</span>
                  </div>
                </div>
                
                <div className="summary-card highlight">
                  <div className="summary-icon">
                    <TrendingUp size={20} />
                  </div>
                  <div className="summary-info">
                    <span className="summary-label">Top Variety</span>
                    <span className="summary-value">
                      {varieties[0]?.name || '—'}
                    </span>
                    <span className="summary-detail">
                      {varieties[0] ? `${formatNumber(varieties[0].percentage)}% of region` : ''}
                    </span>
                  </div>
                </div>
              </div>

              {/* Chart Toggle */}
              <div className="chart-section">
                <div className="chart-container">
                  {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={chartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={2}
                            dataKey="value"
                            label={({ name, value }) => `${name}: ${formatNumber(value)}%`}
                            labelLine={false}
                          >
                            {chartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip content={<CustomTooltip />} />
                        </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="no-data">No variety data available</div>
                  )}
                </div>
              </div>
            </>
          )}

          {activeView === 'varieties' && (
            <div className="varieties-table-section">
              <div className="table-header">
                <h3>All Varieties ({varieties.length})</h3>
              </div>
              
              <div className="varieties-table-wrapper">
                <table className="varieties-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Variety</th>
                      <th className="text-right">Area (ha)</th>
                      <th className="text-right">% of Region</th>
                    </tr>
                  </thead>
                  <tbody>
                    {varieties.map((variety, index) => (
                      <tr key={index}>
                        <td className="rank-cell">
                          <span 
                            className="rank-badge"
                            style={{ 
                              backgroundColor: index < 5 ? VARIETY_COLORS[index] : '#94a3b8'
                            }}
                          >
                            {index + 1}
                          </span>
                        </td>
                        <td className="variety-cell">{variety.name}</td>
                        <td className="text-right">{formatNumber(variety.area_ha, 2)}</td>
                        <td className="text-right percent-cell">
                          <div className="percent-bar-container">
                            <div 
                              className="percent-bar"
                              style={{ 
                                width: `${Math.min(variety.percentage, 100)}%`,
                                backgroundColor: index < 5 ? VARIETY_COLORS[index] : '#94a3b8'
                              }}
                            />
                          </div>
                          <span>{formatNumber(variety.percentage)}%</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td></td>
                      <td><strong>Total</strong></td>
                      <td className="text-right"><strong>{formatNumber(totalArea, 2)}</strong></td>
                      <td className="text-right"><strong>100%</strong></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="stats-modal-footer">
          <span className="stats-source">
            Source: {stats.source || 'NZ Winegrowers Annual Report 2024'}
          </span>
        </div>
      </div>
    </div>
  );
}

export default RegionStatsModal;