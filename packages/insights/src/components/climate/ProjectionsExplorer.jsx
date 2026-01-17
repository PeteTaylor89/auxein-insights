// packages/insights/src/components/climate/ProjectionsExplorer.jsx
/**
 * ProjectionsExplorer Component
 * 
 * Displays climate projections by SSP scenario and time period.
 * Shows projected changes with uncertainty bands and season summaries.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import 'chart.js/auto';
import { ArrowRight, AlertTriangle, Info, TrendingUp } from 'lucide-react';
import { 
  getZoneProjections,
  SSP_SCENARIOS,
  PROJECTION_PERIODS,
  formatMetricValue,
  formatPercentDiff,
  getGrowingSeasonLabels,
} from '../../services/publicClimateService';

const ProjectionsExplorer = ({ zone }) => {
  const [projectionsData, setProjectionsData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Controls
  const [selectedSSP, setSelectedSSP] = useState('SSP245');
  const [selectedPeriod, setSelectedPeriod] = useState('2041_2060');
  const [chartMetric, setChartMetric] = useState('tmean');

  // Load projections when zone changes
  useEffect(() => {
    if (!zone?.slug) {
      setProjectionsData(null);
      return;
    }

    const loadProjections = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getZoneProjections(zone.slug, { ssp: 'all', period: 'all' });
        setProjectionsData(data);
      } catch (err) {
        console.error('Error loading projections:', err);
        setError('Failed to load projection data');
      } finally {
        setLoading(false);
      }
    };

    loadProjections();
  }, [zone?.slug]);

  // Get projection for selected SSP and period
  const selectedProjection = useMemo(() => {
    if (!projectionsData?.projections) return null;
    return projectionsData.projections.find(
      p => p.scenario.code === selectedSSP && p.period.code === selectedPeriod
    );
  }, [projectionsData, selectedSSP, selectedPeriod]);

  // Chart data for monthly projections with SD bands
  const chartData = useMemo(() => {
    if (!selectedProjection?.monthly) return null;

    // Sort by growing season order (Oct-Apr)
    const growingSeasonOrder = [10, 11, 12, 1, 2, 3, 4];
    const sortedMonthly = [...selectedProjection.monthly]
      .filter(m => growingSeasonOrder.includes(m.month))
      .sort((a, b) => {
        const aIdx = growingSeasonOrder.indexOf(a.month);
        const bIdx = growingSeasonOrder.indexOf(b.month);
        return aIdx - bIdx;
      });

    const labels = sortedMonthly.map(m => m.month_name);
    
    const getValue = (m, type) => {
      switch (chartMetric) {
        case 'tmean': return type === 'baseline' ? m.baseline.tmean : m.projected.tmean;
        case 'tmax': return type === 'baseline' ? m.baseline.tmax : m.projected.tmax;
        case 'rain': return type === 'baseline' ? m.baseline.rain : m.projected.rain;
        case 'gdd': return type === 'baseline' ? m.baseline.gdd : m.projected.gdd;
        default: return null;
      }
    };

    const getSD = (m) => {
      switch (chartMetric) {
        case 'tmean': return m.delta_sd?.tmean;
        case 'tmax': return m.delta_sd?.tmax;
        case 'rain': return m.delta_sd?.rain;
        default: return null;
      }
    };

    const baselineData = sortedMonthly.map(m => getValue(m, 'baseline'));
    const projectedData = sortedMonthly.map(m => getValue(m, 'projected'));
    const sdData = sortedMonthly.map(m => getSD(m));

    const sspColor = SSP_SCENARIOS[selectedSSP]?.color || '#3B82F6';

    const datasets = [
      {
        label: 'Baseline (1986-2005)',
        data: baselineData,
        borderColor: '#9CA3AF',
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderDash: [5, 5],
        tension: 0.3,
        pointRadius: 4,
        order: 0,
      },
    ];

    // Add SD bands for projected data (if SD data exists and not rainfall)
    if (chartMetric !== 'rain' && sdData.some(sd => sd != null)) {
      // Upper SD bound
      datasets.push({
        label: 'Upper SD',
        data: projectedData.map((v, i) => v != null && sdData[i] != null ? Number(v) + Number(sdData[i]) : null),
        borderColor: 'transparent',
        backgroundColor: `${sspColor}15`,
        fill: '+1',
        pointRadius: 0,
        tension: 0.3,
        order: 2,
      });
      // Lower SD bound
      datasets.push({
        label: 'Lower SD',
        data: projectedData.map((v, i) => v != null && sdData[i] != null ? Number(v) - Number(sdData[i]) : null),
        borderColor: 'transparent',
        backgroundColor: 'transparent',
        fill: false,
        pointRadius: 0,
        tension: 0.3,
        order: 2,
      });
    }

    // Main projected line
    datasets.push({
      label: `Projected (${PROJECTION_PERIODS[selectedPeriod]?.label})`,
      data: projectedData,
      borderColor: sspColor,
      backgroundColor: chartMetric === 'rain' ? `${sspColor}40` : sspColor,
      fill: false,
      borderWidth: 3,
      tension: 0.3,
      pointRadius: 5,
      order: 1,
    });

    return { labels, datasets };
  }, [selectedProjection, chartMetric, selectedSSP, selectedPeriod]);

  // Chart options
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          usePointStyle: true,
          padding: 20,
          filter: (item) => !item.text.includes('SD'), // Hide SD from legend
        }
      },
      title: {
        display: true,
        text: `${chartMetric === 'tmean' ? 'Mean Temperature' : 
               chartMetric === 'tmax' ? 'Maximum Temperature' :
               chartMetric === 'rain' ? 'Rainfall' : 'GDD'} - Growing Season`,
        font: { size: 16, weight: 'bold' },
        padding: { bottom: 20 },
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        callbacks: {
          label: (context) => {
            if (context.dataset.label?.includes('SD')) return null;
            const value = context.parsed.y;
            return `${context.dataset.label}: ${formatMetricValue(value, chartMetric)}`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: chartMetric === 'rain' || chartMetric === 'gdd',
        title: {
          display: true,
          text: chartMetric === 'tmean' || chartMetric === 'tmax' ? 'Temperature (°C)' :
                chartMetric === 'rain' ? 'Rainfall (mm)' : 'GDD (°C·days)',
        }
      }
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false,
    },
  };

  const isRainfall = chartMetric === 'rain';

  if (!zone) {
    return (
      <div className="projections-explorer">
        <div className="explorer-placeholder">
          <TrendingUp size={48} />
          <p>Select a climate zone to explore future projections</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="projections-explorer">
        <div className="explorer-loading">
          <p>Loading projections for {zone.name}...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="projections-explorer">
        <div className="explorer-error">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!projectionsData) return null;

  return (
    <div className="projections-explorer">
      {/* Header */}
      <div className="explorer-header">
        <h3>Climate Projections: {zone.name}</h3>
      </div>

      {/* SSP Scenario Selector */}
      <div className="ssp-selector">
        <label className="selector-label">Emissions Scenario</label>
        <div className="ssp-tabs">
          {Object.values(SSP_SCENARIOS).map((ssp) => (
            <button
              key={ssp.code}
              className={`ssp-tab ${selectedSSP === ssp.code ? 'active' : ''}`}
              onClick={() => setSelectedSSP(ssp.code)}
              style={{
                '--ssp-color': ssp.color,
                borderColor: selectedSSP === ssp.code ? ssp.color : 'transparent',
              }}
            >
              <span className="ssp-name">{ssp.name}</span>
              <span className="ssp-short">{ssp.shortName}</span>
            </button>
          ))}
        </div>
        <p className="ssp-description">
          <Info size={14} />
          {SSP_SCENARIOS[selectedSSP]?.description}
        </p>
      </div>

      {/* Period Selector */}
      <div className="period-selector">
        <label className="selector-label">Time Period</label>
        <div className="period-buttons">
          {Object.values(PROJECTION_PERIODS).map((period) => (
            <button
              key={period.code}
              className={`period-btn ${selectedPeriod === period.code ? 'active' : ''}`}
              onClick={() => setSelectedPeriod(period.code)}
            >
              <span className="period-name">{period.name}</span>
              <span className="period-years">{period.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Season Summary */}
      {selectedProjection?.season_summary && (
        <div className="projection-summary">
          <h4>Growing Season Changes ({PROJECTION_PERIODS[selectedPeriod]?.label})</h4>
          <div className="summary-grid">
            <div className="summary-card">
              <div className="summary-icon gdd">
                <TrendingUp size={20} />
              </div>
              <div className="summary-content">
                <span className="summary-label">GDD Change</span>
                <span className="summary-value">
                  {formatMetricValue(selectedProjection.season_summary.gdd_projected, 'gdd')}
                </span>
                <span className={`summary-change ${Number(selectedProjection.season_summary.gdd_change_pct) >= 0 ? 'positive' : 'negative'}`}>
                  {formatPercentDiff(selectedProjection.season_summary.gdd_change_pct)} vs baseline
                </span>
              </div>
            </div>

            <div className="summary-card">
              <div className="summary-icon temp">
                <ArrowRight size={20} />
              </div>
              <div className="summary-content">
                <span className="summary-label">Temperature Change</span>
                <span className="summary-value">
                  +{Number(selectedProjection.season_summary.tmean_change).toFixed(1)}°C
                </span>
                <span className="summary-change">
                  Average warming
                </span>
              </div>
            </div>

            <div className="summary-card">
              <div className="summary-icon rain">
                <AlertTriangle size={20} />
              </div>
              <div className="summary-content">
                <span className="summary-label">Rainfall Change</span>
                <span className="summary-value">
                  {formatMetricValue(selectedProjection.season_summary.rain_projected, 'rain')}
                </span>
                <span className={`summary-change ${Number(selectedProjection.season_summary.rain_change_pct) >= 0 ? 'positive' : 'negative'}`}>
                  {formatPercentDiff(selectedProjection.season_summary.rain_change_pct)} vs baseline
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chart Controls */}
      <div className="chart-controls">
        <div className="chart-metric-selector">
          <button
            className={`chart-type-btn ${chartMetric === 'tmean' ? 'active' : ''}`}
            onClick={() => setChartMetric('tmean')}
          >
            Mean Temp
          </button>
          <button
            className={`chart-type-btn ${chartMetric === 'tmax' ? 'active' : ''}`}
            onClick={() => setChartMetric('tmax')}
          >
            Max Temp
          </button>
          <button
            className={`chart-type-btn ${chartMetric === 'rain' ? 'active' : ''}`}
            onClick={() => setChartMetric('rain')}
          >
            Rainfall
          </button>
          <button
            className={`chart-type-btn ${chartMetric === 'gdd' ? 'active' : ''}`}
            onClick={() => setChartMetric('gdd')}
          >
            GDD
          </button>
        </div>
      </div>

      {/* Chart */}
      {chartData && (
        <div className="chart-container">
          {isRainfall ? (
            <Bar data={chartData} options={chartOptions} />
          ) : (
            <Line data={chartData} options={chartOptions} />
          )}
        </div>
      )}

      {/* Monthly Details Table */}
      {selectedProjection?.monthly && (
        <div className="monthly-details">
          <h4>Monthly Breakdown</h4>
          <div className="monthly-table-wrapper">
            <table className="monthly-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Baseline Temp</th>
                  <th>Projected Temp</th>
                  <th>Change</th>
                  <th>Baseline Rain</th>
                  <th>Projected Rain</th>
                </tr>
              </thead>
              <tbody>
                {selectedProjection.monthly
                  .filter(m => [10, 11, 12, 1, 2, 3, 4].includes(m.month))
                  .sort((a, b) => {
                    const order = [10, 11, 12, 1, 2, 3, 4];
                    return order.indexOf(a.month) - order.indexOf(b.month);
                  })
                  .map((m) => (
                    <tr key={m.month}>
                      <td>{m.month_name}</td>
                      <td>{formatMetricValue(m.baseline.tmean, 'tmean')}</td>
                      <td>{formatMetricValue(m.projected.tmean, 'tmean')}</td>
                      <td className={Number(m.delta.tmean) >= 0 ? 'positive' : 'negative'}>
                        +{Number(m.delta.tmean).toFixed(1)}°C
                      </td>
                      <td>{formatMetricValue(m.baseline.rain, 'rain')}</td>
                      <td>{formatMetricValue(m.projected.rain, 'rain')}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectionsExplorer;