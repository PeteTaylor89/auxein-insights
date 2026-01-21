// packages/insights/src/components/climate/CurrentSeasonExplorer.jsx
/**
 * CurrentSeasonExplorer Component
 * 
 * Displays current growing season climate data including:
 * - Season summary with GDD, rainfall, temperature totals
 * - GDD progress chart vs baseline
 * - Recent daily climate data
 * - Baseline comparisons
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import 'chart.js/auto';
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Calendar, 
  Droplets, 
  Thermometer, 
  Sun,
  Clock,
  Target,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import {
  getCurrentSeason,
  getGddProgress,
  formatGdd,
  formatTemp,
  formatRainfall,
  formatPercent,
  formatDate,
  formatShortDate,
  getStatusColor,
} from '../../services/realtimeClimateService';

// Chart colors
const CHART_COLORS = {
  primary: { main: '#3B82F6', light: '#93C5FD', fill: 'rgba(59, 130, 246, 0.15)' },
  baseline: { main: '#6B7280', light: '#9CA3AF', fill: 'rgba(107, 114, 128, 0.1)' },
  rainfall: { main: '#0EA5E9', light: '#7DD3FC', fill: 'rgba(14, 165, 233, 0.3)' },
  temp: { main: '#F59E0B', light: '#FCD34D', fill: 'rgba(245, 158, 11, 0.15)' },
};

const CurrentSeasonExplorer = ({ zone }) => {
  const [seasonData, setSeasonData] = useState(null);
  const [progressData, setProgressData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeChart, setActiveChart] = useState('gdd'); // 'gdd', 'temperature', 'rainfall'

  // Load data when zone changes
  useEffect(() => {
    if (!zone?.slug) {
      setSeasonData(null);
      setProgressData(null);
      return;
    }

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [season, progress] = await Promise.all([
          getCurrentSeason(zone.slug, { recent_days: 30 }),
          getGddProgress(zone.slug),
        ]);

        setSeasonData(season);
        setProgressData(progress);
      } catch (err) {
        console.error('Error loading current season:', err);
        setError('Failed to load current season data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [zone?.slug]);

  // Trend icon component
  const TrendIcon = ({ value, inverted = false }) => {
    if (value === null || value === undefined || Math.abs(value) < 0.5) {
      return <Minus size={16} className="trend-icon neutral" />;
    }
    const isPositive = inverted ? value < 0 : value > 0;
    return isPositive
      ? <TrendingUp size={16} className="trend-icon positive" />
      : <TrendingDown size={16} className="trend-icon negative" />;
  };

  // GDD Progress Chart
  const gddChartData = useMemo(() => {
    if (!progressData?.daily_data) return null;

    const data = progressData.daily_data;
    
    return {
      labels: data.map(d => formatShortDate(d.date)),
      datasets: [
        {
          label: 'Actual GDD0',
          data: data.map(d => d.gdd_actual),
          borderColor: CHART_COLORS.primary.main,
          backgroundColor: CHART_COLORS.primary.fill,
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 4,
        },
        {
          label: 'Baseline GDD0 (1986-2005)',
          data: data.map(d => d.gdd_baseline),
          borderColor: CHART_COLORS.baseline.main,
          borderDash: [5, 5],
          backgroundColor: 'transparent',
          fill: false,
          tension: 0.3,
          pointRadius: 0,
        },
      ],
    };
  }, [progressData]);

  // Temperature Chart
  const tempChartData = useMemo(() => {
    if (!seasonData?.chart_data?.daily) return null;

    const data = seasonData.chart_data.daily;

    return {
      labels: data.map(d => formatShortDate(d.date)),
      datasets: [
        {
          label: 'Max Temp',
          data: data.map(d => d.temp_max),
          borderColor: '#EF4444',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          fill: false,
          tension: 0.3,
          pointRadius: 2,
        },
        {
          label: 'Mean Temp',
          data: data.map(d => d.temp_mean),
          borderColor: CHART_COLORS.temp.main,
          backgroundColor: CHART_COLORS.temp.fill,
          fill: true,
          tension: 0.3,
          pointRadius: 2,
        },
        {
          label: 'Min Temp',
          data: data.map(d => d.temp_min),
          borderColor: '#3B82F6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: false,
          tension: 0.3,
          pointRadius: 2,
        },
      ],
    };
  }, [seasonData]);

  // Rainfall Chart
  const rainfallChartData = useMemo(() => {
    if (!seasonData?.chart_data?.daily) return null;

    const data = seasonData.chart_data.daily;

    return {
      labels: data.map(d => formatShortDate(d.date)),
      datasets: [
        {
          label: 'Rainfall (mm)',
          data: data.map(d => d.rainfall || 0),
          backgroundColor: CHART_COLORS.rainfall.main,
          borderRadius: 2,
        },
      ],
    };
  }, [seasonData]);

  // Chart options
  const lineChartOptions = {
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
      },
    },
    scales: {
      y: {
        beginAtZero: activeChart === 'gdd',
        title: {
          display: true,
          text: activeChart === 'gdd' ? 'Cumulative GDD (°C·days)' : 'Temperature (°C)',
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

  const barChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { mode: 'index' },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: { display: true, text: 'Rainfall (mm)' },
      },
      x: {
        ticks: { maxTicksLimit: 10 },
      },
    },
  };

  // No zone selected
  if (!zone) {
    return (
      <div className="current-season-explorer">
        <div className="no-zone-message">
          <Target size={48} />
          <h3>Select a Climate Zone</h3>
          <p>Choose a wine region above to view current season climate data</p>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="current-season-explorer">
        <div className="loading-state">
          <RefreshCw size={32} className="spinning" />
          <p>Loading current season data...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="current-season-explorer">
        <div className="error-state">
          <AlertCircle size={32} />
          <p>{error}</p>
        </div>
      </div>
    );
  }

  // No data
  if (!seasonData) {
    return (
      <div className="current-season-explorer">
        <div className="no-data-message">
          <Calendar size={48} />
          <h3>No Current Season Data</h3>
          <p>Climate data for {zone.name} is not yet available for this season</p>
        </div>
      </div>
    );
  }

  const { season } = seasonData;
  const gddComparison = season.gdd_vs_baseline;
  const rainComparison = season.rainfall_vs_baseline;

  return (
    <div className="current-season-explorer">
      {/* Season Header */}
      <div className="season-header">
        <div className="season-title">
          <h3>{zone.name}</h3>
          <span className="season-label">{season.label} Season</span>
        </div>
        <div className="season-meta">
          <span className="data-date">
            <Clock size={14} />
            Data to {formatDate(season.latest_data_date)}
          </span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="summary-cards">
        {/* GDD Card */}
        <div className="summary-card gdd-card">
          <div className="card-icon">
            <Sun size={24} />
          </div>
          <div className="card-content">
            <span className="card-label">Growing Degree Days Base-0</span>
            <span className="card-value">{formatGdd(season.gdd_total)}</span>
            {gddComparison && (
              <div className="card-comparison">
                <TrendIcon value={Number(gddComparison.difference_pct)} />
                <span 
                  className="comparison-value"
                  style={{ color: getStatusColor(gddComparison.status) }}
                >
                  {formatPercent(gddComparison.difference_pct)} vs baseline
                </span>
              </div>
            )}
          </div>
          {gddComparison?.status && (
            <div className={`status-badge ${gddComparison.status}`}>
              {gddComparison.status === 'ahead' ? 'Ahead' : 
               gddComparison.status === 'behind' ? 'Behind' : 'Normal'}
            </div>
          )}
        </div>

        {/* Rainfall Card */}
        <div className="summary-card rainfall-card">
          <div className="card-icon">
            <Droplets size={24} />
          </div>
          <div className="card-content">
            <span className="card-label">Total Rainfall</span>
            <span className="card-value">{formatRainfall(season.rainfall_total)}</span>
            {rainComparison && (
              <div className="card-comparison">
                <TrendIcon value={Number(rainComparison.difference_pct)} inverted />
                <span 
                  className="comparison-value"
                  style={{ color: getStatusColor(rainComparison.status === 'ahead' ? 'behind' : rainComparison.status === 'behind' ? 'ahead' : 'normal') }}
                >
                  {formatPercent(rainComparison.difference_pct)} vs baseline
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Temperature Card */}
        <div className="summary-card temp-card">
          <div className="card-icon">
            <Thermometer size={24} />
          </div>
          <div className="card-content">
            <span className="card-label">Season Avg Temp</span>
            <span className="card-value">{formatTemp(season.temp_mean_avg)}</span>
            <div className="temp-range">
              <span className="temp-min">Min: {formatTemp(season.temp_min_avg)}</span>
              <span className="temp-max">Max: {formatTemp(season.temp_max_avg)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Chart Section */}
      <div className="chart-section">
        <div className="chart-controls">
          <button
            className={`chart-tab ${activeChart === 'gdd' ? 'active' : ''}`}
            onClick={() => setActiveChart('gdd')}
          >
            <Sun size={16} />
            GDD Progress
          </button>
          <button
            className={`chart-tab ${activeChart === 'temperature' ? 'active' : ''}`}
            onClick={() => setActiveChart('temperature')}
          >
            <Thermometer size={16} />
            Temperature
          </button>
          <button
            className={`chart-tab ${activeChart === 'rainfall' ? 'active' : ''}`}
            onClick={() => setActiveChart('rainfall')}
          >
            <Droplets size={16} />
            Rainfall
          </button>
        </div>

        <div className="chart-container">
          {activeChart === 'gdd' && gddChartData && (
            <Line data={gddChartData} options={lineChartOptions} />
          )}
          {activeChart === 'temperature' && tempChartData && (
            <Line data={tempChartData} options={lineChartOptions} />
          )}
          {activeChart === 'rainfall' && rainfallChartData && (
            <Bar data={rainfallChartData} options={barChartOptions} />
          )}
        </div>
      </div>

      {/* Recent Days Table */}
      <div className="recent-days-section">
        <h4>Recent Daily Data</h4>
        <div className="recent-days-table-wrapper">
          <table className="recent-days-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Temp Min</th>
                <th>Temp Max</th>
                <th>Temp Mean</th>
                <th>Rainfall</th>
                <th>GDD</th>
                <th>Cumulative GDD</th>
              </tr>
            </thead>
            <tbody>
              {seasonData.recent_days.slice(0, 10).map((day, idx) => (
                <tr key={idx}>
                  <td>{formatShortDate(day.date)}</td>
                  <td>{formatTemp(day.temp_min)}</td>
                  <td>{formatTemp(day.temp_max)}</td>
                  <td>{formatTemp(day.temp_mean)}</td>
                  <td>{formatRainfall(day.rainfall_mm)}</td>
                  <td>{day.gdd_daily ? Number(day.gdd_daily).toFixed(1) : '-'}</td>
                  <td>{formatGdd(day.gdd_cumulative)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CurrentSeasonExplorer;