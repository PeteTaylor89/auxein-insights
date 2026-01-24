// packages/insights/src/components/climate/DiseasePressureExplorer.jsx
/**
 * DiseasePressureExplorer Component
 * 
 * Displays disease pressure indicators for vineyard regions including:
 * - Current risk levels for downy mildew, powdery mildew, botrytis
 * - Risk scores and contributing factors
 * - Recent trend chart
 * - Spray recommendations
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import 'chart.js/auto';
import { 
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Calendar,
  Clock,
  Target,
  AlertCircle,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Droplets,
  Thermometer,
  Wind,
  Info
} from 'lucide-react';
import {
  getDiseasePressure,
  formatDate,
  formatShortDate,
  RISK_LEVELS,
  DISEASE_NAMES,
} from '../../services/realtimeClimateService';

// Chart colors for each disease
const DISEASE_COLORS = {
  downy_mildew: { main: '#3B82F6', light: '#93C5FD', fill: 'rgba(59, 130, 246, 0.15)' },
  powdery_mildew: { main: '#F59E0B', light: '#FCD34D', fill: 'rgba(245, 158, 11, 0.15)' },
  botrytis: { main: '#8B5CF6', light: '#C4B5FD', fill: 'rgba(139, 92, 246, 0.15)' },
};

// Risk level icons
const RiskIcon = ({ level, size = 24 }) => {
  switch (level) {
    case 'low':
      return <ShieldCheck size={size} className="risk-icon low" />;
    case 'moderate':
      return <ShieldAlert size={size} className="risk-icon moderate" />;
    case 'high':
      return <ShieldX size={size} className="risk-icon high" />;
    case 'extreme':
      return <AlertTriangle size={size} className="risk-icon extreme" />;
    default:
      return <ShieldCheck size={size} className="risk-icon unknown" />;
  }
};

const DiseasePressureExplorer = ({ zone }) => {
  const [pressureData, setPressureData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedDisease, setExpandedDisease] = useState(null);
  const [recentDays, setRecentDays] = useState(14);

  // Load data when zone changes
  useEffect(() => {
    if (!zone?.slug) {
      setPressureData(null);
      return;
    }

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        const data = await getDiseasePressure(zone.slug, { recent_days: recentDays });
        setPressureData(data);

        // Auto-expand the highest risk disease
        if (data.current_pressure?.diseases?.length > 0) {
          const riskOrder = { extreme: 4, high: 3, moderate: 2, low: 1 };
          const highestRisk = data.current_pressure.diseases.reduce((prev, curr) => 
            (riskOrder[curr.risk_level] || 0) > (riskOrder[prev.risk_level] || 0) ? curr : prev
          );
          setExpandedDisease(highestRisk.disease);
        }
      } catch (err) {
        console.error('Error loading disease pressure:', err);
        setError('Failed to load disease pressure data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [zone?.slug, recentDays]);

  // Toggle disease expansion
  const toggleDisease = (diseaseKey) => {
    setExpandedDisease(expandedDisease === diseaseKey ? null : diseaseKey);
  };

  // Chart data
  const chartData = useMemo(() => {
    if (!pressureData?.chart_data?.daily) return null;

    const data = pressureData.chart_data.daily;

    return {
      labels: data.map(d => formatShortDate(d.date)),
      datasets: [
        {
          label: 'Downy Mildew',
          data: data.map(d => d.downy_mildew),
          borderColor: DISEASE_COLORS.downy_mildew.main,
          backgroundColor: DISEASE_COLORS.downy_mildew.fill,
          fill: false,
          tension: 0.3,
          pointRadius: 2,
          pointHoverRadius: 5,
        },
        {
          label: 'Powdery Mildew',
          data: data.map(d => d.powdery_mildew),
          borderColor: DISEASE_COLORS.powdery_mildew.main,
          backgroundColor: DISEASE_COLORS.powdery_mildew.fill,
          fill: false,
          tension: 0.3,
          pointRadius: 2,
          pointHoverRadius: 5,
        },
        {
          label: 'Botrytis',
          data: data.map(d => d.botrytis),
          borderColor: DISEASE_COLORS.botrytis.main,
          backgroundColor: DISEASE_COLORS.botrytis.fill,
          fill: false,
          tension: 0.3,
          pointRadius: 2,
          pointHoverRadius: 5,
        },
      ],
    };
  }, [pressureData]);

  // Chart options
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: { usePointStyle: true, padding: 15 },
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        callbacks: {
          label: (context) => {
            const value = context.raw;
            if (value === null || value === undefined) return `${context.dataset.label}: N/A`;
            return `${context.dataset.label}: ${value.toFixed(1)}`;
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        title: {
          display: true,
          text: 'Risk Score',
        },
        ticks: {
          callback: (value) => `${value}`,
        },
      },
      x: {
        ticks: {
          maxTicksLimit: 10,
        },
      },
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false,
    },
  };

  // Get risk level info
  const getRiskInfo = (level) => {
    return RISK_LEVELS[level] || RISK_LEVELS.unknown;
  };

  // No zone selected
  if (!zone) {
    return (
      <div className="disease-pressure-explorer">
        <div className="no-zone-message">
          <ShieldCheck size={48} />
          <h3>Select a Climate Zone</h3>
          <p>Choose a wine region above to view disease pressure indicators</p>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="disease-pressure-explorer">
        <div className="loading-state">
          <RefreshCw size={32} className="spinning" />
          <p>Loading disease pressure data...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="disease-pressure-explorer">
        <div className="error-state">
          <AlertCircle size={32} />
          <p>{error}</p>
        </div>
      </div>
    );
  }

  // No data
  if (!pressureData || !pressureData.current_pressure) {
    return (
      <div className="disease-pressure-explorer">
        <div className="no-data-message">
          <ShieldCheck size={48} />
          <h3>No Disease Pressure Data</h3>
          <p>Disease pressure data for {zone.name} is not yet available</p>
        </div>
      </div>
    );
  }

  const { current_pressure } = pressureData;
  const overallRiskInfo = getRiskInfo(current_pressure.overall_risk);

  return (
    <div className="disease-pressure-explorer">
      {/* Header */}
      <div className="disease-header">
        <div className="header-title">
          <h3>{zone.name}</h3>
          <div 
            className="overall-risk-badge"
            style={{ 
              backgroundColor: overallRiskInfo.bgColor,
              color: overallRiskInfo.color,
            }}
          >
            <RiskIcon level={current_pressure.overall_risk} size={16} />
            <span>{overallRiskInfo.name} Risk</span>
          </div>
        </div>
        <div className="header-meta">
          <span className="data-date">
            <Clock size={14} />
            Updated {formatDate(pressureData.latest_date)}
          </span>
        </div>
      </div>

      {/* Disease Cards */}
      <div className="disease-cards">
        {current_pressure.diseases?.map(disease => {
          const riskInfo = getRiskInfo(disease.risk_level);
          const isExpanded = expandedDisease === disease.disease;
          const diseaseColor = DISEASE_COLORS[disease.disease]?.main || '#6B7280';
          const diseaseName = DISEASE_NAMES[disease.disease] || disease.disease;

          return (
            <div 
              key={disease.disease}
              className={`disease-card ${isExpanded ? 'expanded' : ''}`}
              style={{ borderLeftColor: diseaseColor }}
            >
              {/* Card Header */}
              <div 
                className="disease-card-header"
                onClick={() => toggleDisease(disease.disease)}
              >
                <div className="disease-info">
                  <RiskIcon level={disease.risk_level} size={28} />
                  <div className="disease-name-wrapper">
                    <span className="disease-name">{diseaseName}</span>
                    <span 
                      className="risk-label"
                      style={{ color: riskInfo.color }}
                    >
                      {riskInfo.name}
                    </span>
                  </div>
                </div>

                {disease.score !== null && disease.score !== undefined && (
                  <div className="disease-score">
                    <span className="score-value">{Number(disease.score).toFixed(0)}</span>
                    <span className="score-label">/ 100</span>
                  </div>
                )}

                <div className="expand-icon">
                  {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                </div>
              </div>

              {/* Risk Bar */}
              <div className="risk-bar-container">
                <div 
                  className="risk-bar"
                  style={{ 
                    width: `${Math.min(100, disease.score || 0)}%`,
                    backgroundColor: riskInfo.color,
                  }}
                />
                <div className="risk-thresholds">
                  <span className="threshold" style={{ left: '25%' }}>25</span>
                  <span className="threshold" style={{ left: '50%' }}>50</span>
                  <span className="threshold" style={{ left: '75%' }}>75</span>
                </div>
              </div>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="disease-card-expanded">
                  {/* Description */}
                  {disease.description && (
                    <div className="disease-description">
                      <Info size={16} />
                      <p>{disease.description}</p>
                    </div>
                  )}

                  {/* Contributing Factors */}
                  {disease.contributing_factors && Object.keys(disease.contributing_factors).length > 0 && (
                    <div className="contributing-factors">
                      <h4>Contributing Factors</h4>
                      <div className="factors-grid">
                        {disease.contributing_factors.temp_favorable !== undefined && (
                          <div className="factor-item">
                            <Thermometer size={16} />
                            <span className="factor-label">Temperature</span>
                            <span className={`factor-value ${disease.contributing_factors.temp_favorable ? 'favorable' : ''}`}>
                              {disease.contributing_factors.temp_favorable ? 'Favorable' : 'Unfavorable'}
                            </span>
                          </div>
                        )}
                        {disease.contributing_factors.humidity_favorable !== undefined && (
                          <div className="factor-item">
                            <Droplets size={16} />
                            <span className="factor-label">Humidity</span>
                            <span className={`factor-value ${disease.contributing_factors.humidity_favorable ? 'favorable' : ''}`}>
                              {disease.contributing_factors.humidity_favorable ? 'Favorable' : 'Unfavorable'}
                            </span>
                          </div>
                        )}
                        {disease.contributing_factors.wet_hours !== undefined && (
                          <div className="factor-item">
                            <Droplets size={16} />
                            <span className="factor-label">Wet Hours</span>
                            <span className="factor-value">{disease.contributing_factors.wet_hours}h</span>
                          </div>
                        )}
                        {disease.contributing_factors.consecutive_wet_days !== undefined && (
                          <div className="factor-item">
                            <Calendar size={16} />
                            <span className="factor-label">Wet Days</span>
                            <span className="factor-value">{disease.contributing_factors.consecutive_wet_days} days</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Spray Recommendation */}
                  {disease.spray_recommendation && (
                    <div className="spray-recommendation">
                      <h4>Recommendation</h4>
                      <p>{disease.spray_recommendation}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Chart Section */}
      <div className="chart-section">
        <div className="chart-header">
          <h4>Risk Trend</h4>
          <div className="days-selector">
            <span>Show:</span>
            {[7, 14, 30].map(days => (
              <button
                key={days}
                className={`days-btn ${recentDays === days ? 'active' : ''}`}
                onClick={() => setRecentDays(days)}
              >
                {days}d
              </button>
            ))}
          </div>
        </div>

        <div className="chart-container">
          {chartData && (
            <Line data={chartData} options={chartOptions} />
          )}
        </div>
      </div>

      {/* General Recommendations */}
      {current_pressure.recommendations && (
        <div className="general-recommendations">
          <h4>General Recommendations</h4>
          {Array.isArray(current_pressure.recommendations) ? (
            <ul>
              {current_pressure.recommendations.map((rec, idx) => (
                <li key={idx}>{rec}</li>
              ))}
            </ul>
          ) : (
            <p>{current_pressure.recommendations}</p>
          )}
        </div>
      )}

      {/* Data Quality Note */}
      {!current_pressure.humidity_available && (
        <div className="data-quality-note">
          <AlertCircle size={14} />
          <span>
            Humidity data not available for this zone. Disease pressure estimates may be less accurate.
          </span>
        </div>
      )}

    </div>
  );
};

export default DiseasePressureExplorer;