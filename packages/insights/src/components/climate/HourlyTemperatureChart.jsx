// packages/insights/src/components/climate/HourlyTemperatureChart.jsx
/**
 * Hourly temperature for a climate zone over a recent window (default 10 days),
 * with wheel / drag / pinch zoom and pan. Reads the same zone-aggregated hourly
 * series the disease models use (climate_zone_hourly).
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Line } from 'react-chartjs-2';
import 'chart.js/auto'; // register controllers/elements/scales
import { Chart as ChartJS } from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
import 'hammerjs'; // enables touch pan/pinch for the zoom plugin
import dayjs from 'dayjs';
import { RefreshCw, AlertCircle, ZoomOut, Snowflake } from 'lucide-react';
import { getHourlyClimate } from '../../services/realtimeClimateService';

ChartJS.register(zoomPlugin);

const TEMP_PALETTE = {
  mean: '#3D405B',
  band: 'rgba(108, 142, 173, 0.14)',
  edge: '#6C8EAD',
  frostLine: 'rgba(37, 99, 235, 0.45)',
  frostIce: '#7EC8E3', // ice blue — line segments at/below 0°C
};

// A line segment counts as "frost" when either endpoint sits at/below 0°C.
const isFrostSegment = (ctx) => {
  const a = ctx.p0?.parsed?.y;
  const b = ctx.p1?.parsed?.y;
  return (a != null && a <= 0) || (b != null && b <= 0);
};

const WINDOW_OPTIONS = [3, 7, 10];

const HourlyTemperatureChart = ({ zone }) => {
  const [data, setData] = useState(null);
  const [days, setDays] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [retry, setRetry] = useState(0);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!zone?.slug) {
      setData(null);
      return;
    }
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await getHourlyClimate(zone.slug, { days });
        setData(res);
      } catch (err) {
        console.error('Error loading hourly climate:', err);
        setError('Failed to load hourly data');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [zone?.slug, days, retry]);

  const chartData = useMemo(() => {
    if (!data?.points?.length) return null;
    const pts = data.points;

    const labels = pts.map(p => dayjs(p.timestamp).format('D MMM HH:mm'));
    const mean = pts.map(p => (p.temp_mean != null ? Number(p.temp_mean) : null));
    const max = pts.map(p => (p.temp_max != null ? Number(p.temp_max) : null));
    const min = pts.map(p => (p.temp_min != null ? Number(p.temp_min) : null));
    const hasRange = max.some(v => v != null) && min.some(v => v != null);

    const datasets = [];

    if (hasRange) {
      datasets.push({
        label: 'Max',
        data: max,
        borderColor: 'transparent',
        backgroundColor: 'transparent',
        pointRadius: 0,
        tension: 0.3,
        order: 4,
      });
      datasets.push({
        label: 'Min–Max',
        data: min,
        borderColor: 'transparent',
        backgroundColor: TEMP_PALETTE.band,
        fill: '-1',
        pointRadius: 0,
        tension: 0.3,
        order: 4,
      });
    }

    datasets.push({
      label: 'Hourly temp',
      data: mean,
      borderColor: TEMP_PALETTE.mean,
      backgroundColor: 'transparent',
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 4,
      tension: 0.3,
      order: 2,
      // Below 0°C the line goes ice-blue and dashed (frost).
      segment: {
        borderColor: (ctx) => (isFrostSegment(ctx) ? TEMP_PALETTE.frostIce : TEMP_PALETTE.mean),
        borderDash: (ctx) => (isFrostSegment(ctx) ? [6, 4] : undefined),
      },
    });

    datasets.push({
      label: 'Frost (0°C)',
      data: labels.map(() => 0),
      borderColor: TEMP_PALETTE.frostLine,
      borderWidth: 1,
      borderDash: [4, 4],
      pointRadius: 0,
      tension: 0,
      order: 3,
    });

    return { labels, datasets };
  }, [data]);

  const options = useMemo(() => ({
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
          filter: (item) => item.text !== 'Max', // hide the invisible band edge
        },
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        callbacks: {
          label: (ctx) => {
            if (ctx.dataset.label === 'Frost (0°C)' || ctx.dataset.label === 'Max') return null;
            if (ctx.parsed.y === null || ctx.parsed.y === undefined) return null;
            return `${ctx.dataset.label}: ${Number(ctx.parsed.y).toFixed(1)}°C`;
          },
        },
      },
      zoom: {
        zoom: {
          wheel: { enabled: true },
          drag: { enabled: true, backgroundColor: 'rgba(61, 64, 91, 0.1)' },
          pinch: { enabled: true },
          mode: 'x',
        },
        pan: { enabled: true, mode: 'x' },
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
        ticks: { maxTicksLimit: 12, font: { size: 11 }, maxRotation: 0, autoSkip: true },
      },
    },
    interaction: { mode: 'nearest', axis: 'x', intersect: false },
  }), []);

  const resetZoom = () => {
    if (chartRef.current) chartRef.current.resetZoom();
  };

  return (
    <div className="hourly-temp-chart">
      <div className="hourly-controls">
        <div className="hourly-window">
          <span>Window:</span>
          {WINDOW_OPTIONS.map(d => (
            <button
              key={d}
              className={`days-btn ${days === d ? 'active' : ''}`}
              onClick={() => setDays(d)}
            >
              {d}d
            </button>
          ))}
        </div>
        <div className="hourly-actions">
          <span className="zoom-hint">Scroll, drag or pinch to zoom · drag to pan</span>
          <button className="zoom-reset-btn" onClick={resetZoom} title="Reset zoom">
            <ZoomOut size={14} />
            Reset
          </button>
        </div>
      </div>

      <div className="hourly-chart-container">
        {loading && (
          <div className="loading-state">
            <RefreshCw size={28} className="spinning" />
            <p>Loading hourly data...</p>
          </div>
        )}
        {!loading && error && (
          <div className="climate-error-card">
            <AlertCircle size={28} />
            <p>{error}</p>
            <button className="climate-error-retry" onClick={() => setRetry(c => c + 1)}>
              <RefreshCw size={14} />
              Try again
            </button>
          </div>
        )}
        {!loading && !error && !chartData && (
          <div className="no-data-message">
            <Snowflake size={36} />
            <p>No hourly data available for {zone?.name} yet</p>
          </div>
        )}
        {!loading && !error && chartData && (
          <Line ref={chartRef} data={chartData} options={options} />
        )}
      </div>
    </div>
  );
};

export default HourlyTemperatureChart;
