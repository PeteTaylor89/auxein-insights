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
  RefreshCw,
  Snowflake,
  Flame,
  CloudRain,
} from 'lucide-react';
import HourlyTemperatureChart from './HourlyTemperatureChart';
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

// Muted, data-viz palette for the temperature chart (min–max band + mean line
// + frost reference). Deliberately understated rather than primary-bright.
const TEMP_PALETTE = {
  max: '#C26B5A',                       // muted terracotta
  mean: '#3D405B',                      // deep slate — emphasis line
  min: '#6C8EAD',                       // muted steel blue
  band: 'rgba(108, 142, 173, 0.12)',    // soft fill between min and max
  frostLine: 'rgba(37, 99, 235, 0.45)', // dashed 0°C reference
  frostMark: '#2563EB',                 // frost-night markers
};

const CurrentSeasonExplorer = ({ zone, inSeason = true }) => {
  const [seasonData, setSeasonData] = useState(null);
  const [progressData, setProgressData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  // Out of season we are past the GDD accumulation window, so default to the
  // weather charts and hide GDD entirely.
  const [activeChart, setActiveChart] = useState(inSeason ? 'gdd' : 'temperature'); // 'gdd', 'temperature', 'rainfall'
  // GDD base: base-10 (Winkler) is the NZ viticulture default; base-0 optional.
  const [gddBase, setGddBase] = useState('base10');

  // Load season + GDD data when zone or GDD base changes
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
          getCurrentSeason(zone.slug, { recent_days: 30, base: gddBase }),
          getGddProgress(zone.slug, { base: gddBase }),
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
  }, [zone?.slug, gddBase, retryCount]);

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

  // GDD base label derived from the active series base
  const gddBaseLabel = (progressData?.gdd_base || gddBase) === 'base10' ? 'Base-10' : 'Base-0';

  // GDD Progress Chart
  const gddChartData = useMemo(() => {
    if (!progressData?.daily_data) return null;

    const data = progressData.daily_data;
    const baseLabel = (progressData.gdd_base || 'base10') === 'base10' ? 'Base-10' : 'Base-0';

    return {
      labels: data.map(d => formatShortDate(d.date)),
      datasets: [
        {
          label: `Actual GDD ${baseLabel}`,
          data: data.map(d => d.gdd_actual),
          borderColor: CHART_COLORS.primary.main,
          backgroundColor: CHART_COLORS.primary.fill,
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 4,
        },
        {
          label: `Baseline ${baseLabel} (1986-2005)`,
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

  // Temperature Chart — min–max band, emphasised mean line, 0°C frost reference
  // and frost-night markers.
  const tempChartData = useMemo(() => {
    if (!seasonData?.chart_data?.daily) return null;

    const data = seasonData.chart_data.daily;
    const labels = data.map(d => formatShortDate(d.date));
    const frostPoints = data.map(d => (d.temp_min != null && d.temp_min <= 0 ? d.temp_min : null));
    const hasFrost = frostPoints.some(v => v != null);

    return {
      labels,
      datasets: [
        {
          label: 'Max',
          data: data.map(d => d.temp_max),
          borderColor: TEMP_PALETTE.max,
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          fill: false,
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 3,
          order: 3,
        },
        {
          label: 'Min',
          data: data.map(d => d.temp_min),
          borderColor: TEMP_PALETTE.min,
          backgroundColor: TEMP_PALETTE.band,
          borderWidth: 1.5,
          fill: '-1', // fill up to the Max line → soft range band
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 3,
          order: 3,
        },
        {
          label: 'Mean',
          data: data.map(d => d.temp_mean),
          borderColor: TEMP_PALETTE.mean,
          backgroundColor: 'transparent',
          borderWidth: 2.5,
          fill: false,
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 4,
          order: 2,
        },
        {
          label: 'Frost (0°C)',
          data: labels.map(() => 0),
          borderColor: TEMP_PALETTE.frostLine,
          borderWidth: 1,
          borderDash: [4, 4],
          fill: false,
          tension: 0,
          pointRadius: 0,
          order: 4,
        },
        ...(hasFrost ? [{
          label: 'Frost night',
          data: frostPoints,
          showLine: false,
          borderColor: TEMP_PALETTE.frostMark,
          backgroundColor: TEMP_PALETTE.frostMark,
          pointStyle: 'rectRot',
          pointRadius: 5,
          pointHoverRadius: 7,
          order: 1,
        }] : []),
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

  // Dedicated, restrained styling for the temperature chart (the old one read
  // as too bright/heavy). Thin gridlines, point-style legend, no x grid.
  const tempChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          usePointStyle: true,
          boxWidth: 8,
          padding: 14,
          font: { size: 12 },
        },
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        callbacks: {
          label: (ctx) => {
            if (ctx.dataset.label === 'Frost (0°C)') return null;
            if (ctx.parsed.y === null || ctx.parsed.y === undefined) return null;
            return `${ctx.dataset.label}: ${Number(ctx.parsed.y).toFixed(1)}°C`;
          },
        },
      },
    },
    scales: {
      y: {
        title: { display: true, text: 'Temperature (°C)', font: { size: 12 } },
        grid: { color: 'rgba(0, 0, 0, 0.05)' },
        ticks: { font: { size: 11 } },
      },
      x: {
        grid: { display: false },
        ticks: { maxTicksLimit: 10, font: { size: 11 } },
      },
    },
    interaction: { mode: 'nearest', axis: 'x', intersect: false },
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
        <div className="climate-error-card">
          <AlertCircle size={32} />
          <p>{error}</p>
          <button className="climate-error-retry" onClick={() => setRetryCount(c => c + 1)}>
            <RefreshCw size={14} />
            Try again
          </button>
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

      {/* Off-season note — GDD accumulation is paused outside 1 Sept – 30 Apr */}
      {!inSeason && (
        <div className="season-offseason-note">
          <AlertCircle size={16} />
          <span>Dormant season — GDD accumulation paused until 1 September. Showing temperature and rainfall.</span>
        </div>
      )}

      {/* Summary Cards */}
      <div className="summary-cards">
        {/* GDD Card — hidden out of season (outside the accumulation window) */}
        {inSeason && (
        <div className="summary-card gdd-card">
          <div className="card-icon">
            <Sun size={24} />
          </div>
          <div className="card-content">
            <div className="gdd-card-label-row">
              <span className="card-label">Growing Degree Days {gddBaseLabel}</span>
              <div className="gdd-base-toggle" role="group" aria-label="GDD base">
                <button
                  type="button"
                  className={gddBase === 'base10' ? 'active' : ''}
                  onClick={() => setGddBase('base10')}
                >
                  Base-10
                </button>
                <button
                  type="button"
                  className={gddBase === 'base0' ? 'active' : ''}
                  onClick={() => setGddBase('base0')}
                >
                  Base-0
                </button>
              </div>
            </div>
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
        )}

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

      {/* Threshold metrics — frost / hot days / extreme rainfall.
          Season-to-date, so only shown in season (off-season these would be
          last season's values, which aren't relevant to current weather). */}
      {inSeason && season.extremes && (
        <>
        <div className="extremes-heading">This season to date</div>
        <div className="extremes-cards">
          <div className="extreme-card frost">
            <div className="extreme-icon"><Snowflake size={20} /></div>
            <div className="extreme-body">
              <span className="extreme-label">Frost days</span>
              <span className="extreme-value">{season.extremes.frost_days_total}</span>
              <span className="extreme-sub">
                {season.extremes.early_frost_count} in spring (Sep–Nov)
                {season.extremes.last_frost_date && <> · last {formatShortDate(season.extremes.last_frost_date)}</>}
              </span>
            </div>
          </div>

          <div className="extreme-card hot">
            <div className="extreme-icon"><Flame size={20} /></div>
            <div className="extreme-body">
              <span className="extreme-label">Hot days &gt;30°C</span>
              <span className="extreme-value">{season.extremes.hot_days_count}</span>
              <span className="extreme-sub">days above 30°C</span>
            </div>
          </div>

          <div className="extreme-card rain">
            <div className="extreme-icon"><CloudRain size={20} /></div>
            <div className="extreme-body">
              <span className="extreme-label">Extreme rainfall</span>
              <span className="extreme-value">
                {season.extremes.max_1day_rainfall != null
                  ? `${Number(season.extremes.max_1day_rainfall).toFixed(1)} mm`
                  : '—'}
              </span>
              <span className="extreme-sub">
                max 1-day{season.extremes.max_1day_rainfall_date ? ` (${formatShortDate(season.extremes.max_1day_rainfall_date)})` : ''}
                {' · '}{season.extremes.heavy_rain_days_count} day{season.extremes.heavy_rain_days_count === 1 ? '' : 's'} ≥ {Number(season.extremes.heavy_rain_threshold_mm)}mm
              </span>
            </div>
          </div>
        </div>
        </>
      )}

      {/* Chart Section */}
      <div className="chart-section">
        <div className="chart-controls">
          {inSeason && (
          <button
            className={`chart-tab ${activeChart === 'gdd' ? 'active' : ''}`}
            onClick={() => setActiveChart('gdd')}
          >
            <Sun size={16} />
            GDD Progress
          </button>
          )}
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
          <button
            className={`chart-tab ${activeChart === 'hourly' ? 'active' : ''}`}
            onClick={() => setActiveChart('hourly')}
          >
            <Thermometer size={16} />
            Hourly (10d)
          </button>
        </div>

        <div className="chart-container">
          {inSeason && activeChart === 'gdd' && gddChartData && (
            <Line data={gddChartData} options={lineChartOptions} />
          )}
          {activeChart === 'temperature' && tempChartData && (
            <Line data={tempChartData} options={tempChartOptions} />
          )}
          {activeChart === 'rainfall' && rainfallChartData && (
            <Bar data={rainfallChartData} options={barChartOptions} />
          )}
          {activeChart === 'hourly' && (
            <HourlyTemperatureChart zone={zone} />
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
                {inSeason && <th>GDD</th>}
                {inSeason && <th>Cumulative GDD</th>}
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
                  {inSeason && <td>{day.gdd_daily ? Number(day.gdd_daily).toFixed(1) : '-'}</td>}
                  {inSeason && <td>{formatGdd(day.gdd_cumulative)}</td>}
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