// packages/insights/src/components/climate/SeasonExplorer.jsx
/**
 * SeasonExplorer Component
 * 
 * Displays historical growing seasons with:
 * - Overview: Season totals over time with baseline
 * - Monthly View: Single season breakdown (Oct-Apr x-axis)
 * - Season Comparison: Compare 2-3 seasons monthly
 * - Zone Comparison: Compare zones for same season/LTA
 * 
 * Features:
 * - Rainfall always displayed as bar chart
 * - SD error bands on line charts (GDD, Temp)
 * - Season cards show 6 most recent with GDD, Rain, Avg Temp
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import 'chart.js/auto';
import { TrendingUp, TrendingDown, Minus, Calendar, Droplets, Thermometer, Sun, BarChart3, LineChart, MapPin, ChevronLeft, ChevronRight, Snowflake, Flame, CloudRain } from 'lucide-react';
import {
  getZoneSeasons,
  getZoneHistory,
  compareSeasons,
  compareZones,
  compareZonesSeasons,
  getZoneBaseline,
  formatMetricValue,
  formatPercentDiff,
  MONTH_NAMES,
  GROWING_SEASON_MONTHS
} from '../../services/publicClimateService';

// Growing season month labels in order
const SEASON_MONTH_LABELS = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'];
const SEASON_MONTH_ORDER = [9, 10, 11, 12, 1, 2, 3, 4];

// The full vintage year (Jul→Jun) existed only so the monthly FROST view could
// show the winter peak. Total frost days were removed on 2026-08-24 (see
// `build_season_extremes`), and every remaining metric is a growing-season one,
// so the season order is the only order left.

// Chart colors
const CHART_COLORS = [
  { main: '#3B82F6', light: '#93C5FD', fill: 'rgba(59, 130, 246, 0.15)' },  // Blue
  { main: '#10B981', light: '#6EE7B7', fill: 'rgba(16, 185, 129, 0.15)' },  // Green
  { main: '#F59E0B', light: '#FCD34D', fill: 'rgba(245, 158, 11, 0.15)' },  // Amber
  { main: '#EF4444', light: '#FCA5A5', fill: 'rgba(239, 68, 68, 0.15)' },   // Red
  { main: '#8B5CF6', light: '#C4B5FD', fill: 'rgba(139, 92, 246, 0.15)' },  // Purple
];

const BASELINE_COLOR = { main: '#6B7280', light: '#9CA3AF', fill: 'rgba(107, 114, 128, 0.1)' };

// Overview trend dataset labels per metric (incl. seasonal extremes)
const OVERVIEW_METRIC_LABELS = {
  gdd: 'Season GDD',
  rain: 'Season Rainfall (mm)',
  tmean: 'Season Avg Temp (°C)',
  tmax: 'Season Max Temp (°C)',
  hot_days30: 'Hot days >30°C',
  r99p: 'Extreme Rain (mm)',
};

// Extreme metrics selectable on the Overview trend (per-season values).
const OVERVIEW_EXTREME_METRICS = [
  { key: 'hot_days30', label: 'Hot days' },
  { key: 'r99p', label: 'Extreme Rain' },
];

// Per-season extreme keys (baseline lookup on the Overview trend)
const SEASON_EXTREME_KEYS = ['hot_days30', 'r99p'];

// Which views each non-base metric is valid in (base metrics work everywhere).
// Seasonal extremes compare only in the zone-compare Trend sub-mode (single
// value per season); rx1day is monthly-grained.
const METRIC_VALID_VIEWS = {
  hot_days30: ['overview', 'zone-compare'],
  r99p: ['overview', 'zone-compare'],
  rx1day: ['monthly', 'season-compare'],
};

// Seasonal extremes that compare across zones via the Trend sub-mode only.
const ZONE_COMPARE_EXTREMES = [
  { key: 'hot_days30', label: 'Hot days' },
  { key: 'r99p', label: 'Extreme Rain' },
];

// Short explainers shown under the chart when a metric is selected.
const METRIC_EXPLAINERS = {
  hot_days30: 'Hot days — days reaching above 30°C (summer).',
  r99p: 'Extreme Rain (R99p) — the one-day rainfall total exceeded on only the most extreme 1% of wet days.',
  rx1day: 'Max 1-day Rain (Rx1day) — the wettest single day in each month.',
};

const SeasonExplorer = ({ zone, comparisonZones = [], onComparisonZonesChange }) => {
  const [seasonsData, setSeasonsData] = useState(null);
  const [monthlyData, setMonthlyData] = useState(null);
  const [baselineData, setBaselineData] = useState(null);
  const [zoneComparisonData, setZoneComparisonData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Controls
  const [viewMode, setViewMode] = useState('overview'); // overview, monthly, season-compare, zone-compare
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [comparisonSeasons, setComparisonSeasons] = useState([]);
  const [chartMetric, setChartMetric] = useState('gdd');
  const [seasonLimit, setSeasonLimit] = useState(10);
  const [includeLTA, setIncludeLTA] = useState(true);
  const [zoneCompareMode, setZoneCompareMode] = useState('lta'); // 'lta' | 'season' | 'trend'
  const [seasonPage, setSeasonPage] = useState(0);

  const seasonsPerPage = 6;

  // Keep the selected metric valid for the active view: per-season extremes
  // only apply in Overview, Rx1day only in Monthly.
  useEffect(() => {
    const allowed = METRIC_VALID_VIEWS[chartMetric];
    if (allowed && !allowed.includes(viewMode)) setChartMetric('gdd');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  // Seasonal extremes compare only in the zone-compare Trend sub-mode.
  useEffect(() => {
    if (viewMode === 'zone-compare' && zoneCompareMode !== 'trend' &&
        ['hot_days30', 'r99p'].includes(chartMetric)) {
      setChartMetric('gdd');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneCompareMode, viewMode]);

  // Load seasons when zone changes
  useEffect(() => {
    if (!zone?.slug) {
      setSeasonsData(null);
      return;
    }

    const loadSeasons = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Load seasons and baseline in parallel
        const [seasons, baseline] = await Promise.all([
          getZoneSeasons(zone.slug, { limit: 50 }),
          getZoneBaseline(zone.slug)
        ]);
        
        setSeasonsData(seasons);
        setBaselineData(baseline);
        
        // Auto-select most recent season
        if (seasons.seasons?.length > 0) {
          setSelectedSeason(seasons.seasons[0].vintage_year);
        }
      } catch (err) {
        console.error('Error loading seasons:', err);
        setError('Failed to load season data');
      } finally {
        setLoading(false);
      }
    };

    loadSeasons();
  }, [zone?.slug]);

  // Load monthly data for selected season (monthly and season-compare views)
  useEffect(() => {
    if (!zone?.slug || !selectedSeason || (viewMode !== 'monthly' && viewMode !== 'season-compare')) {
      return;
    }

    const loadMonthlyData = async () => {
      try {
        setLoading(true);
        // Fetch all 12 months so the frost view can show the winter peak;
        // non-frost metrics still display the growing-season subset.
        const data = await getZoneHistory(zone.slug, {
          vintage_year: selectedSeason,
        });
        setMonthlyData(data);
      } catch (err) {
        console.error('Error loading monthly data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadMonthlyData();
  }, [zone?.slug, selectedSeason, viewMode]);

  // Load zone comparison data
  useEffect(() => {
    if (viewMode !== 'zone-compare' || zoneCompareMode === 'trend' || comparisonZones.length === 0) {
      setZoneComparisonData(null);
      return;
    }

    const loadZoneComparison = async () => {
      try {
        setLoading(true);
        const zoneSlugs = [zone.slug, ...comparisonZones.map(z => z.slug)].join(',');
        const data = await compareZones({
          zones: zoneSlugs,
          metric: chartMetric,
          vintage_year: includeLTA ? null : selectedSeason
        });
        setZoneComparisonData(data);
      } catch (err) {
        console.error('Error loading zone comparison:', err);
      } finally {
        setLoading(false);
      }
    };

    loadZoneComparison();
  }, [zone?.slug, comparisonZones, viewMode, zoneCompareMode, chartMetric, selectedSeason, includeLTA]);

  // Get trend icon
  const TrendIcon = ({ value }) => {
    if (value === null || value === undefined || value === 0) {
      return <Minus size={14} className="trend-icon neutral" />;
    }
    return value > 0 
      ? <TrendingUp size={14} className="trend-icon positive" />
      : <TrendingDown size={14} className="trend-icon negative" />;
  };

  // Get metric value from baseline monthly data
  const getBaselineMonthlyValue = (month, metric) => {
    if (!baselineData?.monthly) return null;
    const monthData = baselineData.monthly.find(m => m.month === month);
    if (!monthData) return null;
    switch (metric) {
      case 'gdd': return monthData.gdd;
      case 'rain': return monthData.rain;
      case 'rx1day': return monthData.rx1day;
      case 'tmean': return monthData.tmean;
      case 'tmax': return monthData.tmax;
      case 'tmin': return monthData.tmin;
      default: return null;
    }
  };

  // Build chart data for overview (seasons over time)
  const overviewChartData = useMemo(() => {
    if (!seasonsData?.seasons) return null;

    const limit = Math.min(seasonLimit, seasonsData.seasons.length);
    const seasons = [...seasonsData.seasons].slice(0, limit).reverse(); // Chronological
    // Rainfall + Extreme Rain render as columns; everything else as a line.
    const isRainfall = chartMetric === 'rain' || chartMetric === 'r99p';
    
    const getValue = (s) => {
      switch (chartMetric) {
        case 'gdd': return s.gdd_total;
        case 'rain': return s.rain_total;
        case 'tmean': return s.tmean_avg;
        case 'tmax': return s.tmax_avg;
        case 'hot_days30': return s.extremes?.hot_days30?.mean;
        case 'r99p': return s.extremes?.r99p?.mean;
        default: return s.gdd_total;
      }
    };

    const datasets = [{
      type: isRainfall ? 'bar' : 'line',
      label: OVERVIEW_METRIC_LABELS[chartMetric] || OVERVIEW_METRIC_LABELS.gdd,
      data: seasons.map(s => getValue(s) ? Number(getValue(s)) : null),
      borderColor: CHART_COLORS[0].main,
      backgroundColor: isRainfall ? CHART_COLORS[0].main + '99' : CHART_COLORS[0].fill,
      fill: !isRainfall,
      tension: 0.3,
      pointRadius: 5,
      pointHoverRadius: 7,
    }];

    // Add baseline line — always a dashed line, even over rainfall columns
    if (includeLTA) {
      const baselineValue =
        chartMetric === 'gdd' ? seasonsData.baseline?.gdd_total :
        chartMetric === 'rain' ? seasonsData.baseline?.rain_total :
        chartMetric === 'tmean' ? seasonsData.baseline?.tmean_avg :
        chartMetric === 'tmax' ? seasonsData.baseline?.tmax_avg :
        SEASON_EXTREME_KEYS.includes(chartMetric)
          ? seasonsData.baseline_extremes?.[chartMetric]?.mean
          : null;
      if (baselineValue) {
        datasets.push({
          type: 'line',
          label: 'LTA baseline',
          data: seasons.map(() => Number(baselineValue)),
          borderColor: BASELINE_COLOR.main,
          borderDash: [5, 5],
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
        });
      }
    }

    return {
      labels: seasons.map(s => s.season_label),
      datasets,
    };
  }, [seasonsData, chartMetric, includeLTA, seasonLimit]);

  // Build chart data for monthly view (single season with SD bands)
  const monthlyChartData = useMemo(() => {
    if (!monthlyData?.data || monthlyData.data.length === 0) return null;

    const isRainfall = chartMetric === 'rain' || chartMetric === 'rx1day';

    // Frost spans the full vintage year (winter peak); other metrics show the
    // growing season only.
    const monthOrder = SEASON_MONTH_ORDER;
    const monthLabels = SEASON_MONTH_LABELS;

    const sortedData = monthlyData.data
      .filter(d => monthOrder.includes(d.month))
      .sort((a, b) => monthOrder.indexOf(a.month) - monthOrder.indexOf(b.month));

    const getValue = (d) => {
      switch (chartMetric) {
        case 'gdd': return d.gdd?.mean;
        case 'rain': return d.rain?.mean;
        case 'rx1day': return d.rx1day?.mean;
        case 'tmean': return d.tmean?.mean;
        case 'tmax': return d.tmax?.mean;
        default: return d.gdd?.mean;
      }
    };

    const getSD = (d) => {
      switch (chartMetric) {
        case 'gdd': return d.gdd?.sd;
        case 'rain': return d.rain?.sd;
        case 'rx1day': return d.rx1day?.sd;
        case 'tmean': return d.tmean?.sd;
        case 'tmax': return d.tmax?.sd;
        default: return d.gdd?.sd;
      }
    };

    const rawValues = sortedData.map(d => {
      const v = getValue(d);
      return v != null ? Number(v) : null;
    });
    const rawSds = sortedData.map(d => {
      const sd = getSD(d);
      return sd != null ? Number(sd) : null;
    });

    // GDD IS CUMULATIVE (2026-08-24). Growing degree days are read as a season
    // accumulation — "where is this season by veraison" — and a bar per month
    // answers a question nobody asks. Only GDD: temperature is a level and
    // cannot be accumulated, and rainfall's monthly pattern is what a grower
    // reads it for.
    const isCumulative = chartMetric === 'gdd';
    const accumulate = (arr) => {
      let run = 0;
      return arr.map((v) => (v === null ? null : (run += v)));
    };
    const values = isCumulative ? accumulate(rawValues) : rawValues;

    // NO BAND ON THE CUMULATIVE LINE. `sd` here is the SPATIAL spread across
    // the region's cells in one month. Accumulating it needs an assumption
    // about how correlated those cells are from month to month — sum if
    // perfectly correlated, root-sum-square if independent, and the truth is
    // between. Neither is defensible, and a band drawn on a guess is worse than
    // no band. The overview's season chart carries a properly derived
    // across-year band instead; this view shows the deviation from the baseline
    // directly, which is the thing being asked.
    const sds = isCumulative ? rawSds.map(() => null) : rawSds;
    
    const datasets = [];

    // For line charts, add SD bands first (so they render behind)
    if (!isRainfall && sds.some(sd => sd != null)) {
      // Upper bound
      datasets.push({
        label: 'Upper SD',
        data: values.map((v, i) => v != null && sds[i] != null ? v + sds[i] : null),
        borderColor: 'transparent',
        backgroundColor: CHART_COLORS[0].fill,
        fill: '+1',
        pointRadius: 0,
        tension: 0.3,
        order: 2,
      });
      // Lower bound
      datasets.push({
        label: 'Lower SD',
        data: values.map((v, i) => v != null && sds[i] != null ? Math.max(0, v - sds[i]) : null),
        borderColor: 'transparent',
        backgroundColor: 'transparent',
        fill: false,
        pointRadius: 0,
        tension: 0.3,
        order: 2,
      });
    }

    // Main data line/bars
    datasets.push({
      type: isRainfall ? 'bar' : 'line',
      label: `${selectedSeason - 1}/${String(selectedSeason).slice(2)}`,
      data: values,
      borderColor: CHART_COLORS[0].main,
      backgroundColor: isRainfall ? CHART_COLORS[0].main + '99' : CHART_COLORS[0].main,
      fill: false,
      tension: 0.3,
      pointRadius: 5,
      pointHoverRadius: 7,
      order: 1,
      // For bar charts, store SD for error bars
      errorBars: isRainfall ? sds : null,
    });

    // Add baseline from monthly data — always a dashed line
    if (baselineData?.monthly && includeLTA) {
      const rawBaseline = monthOrder.map(month => {
        const v = getBaselineMonthlyValue(month, chartMetric);
        return v != null ? Number(v) : null;
      });
      // The baseline accumulates with the season, or the two lines are on
      // different scales and the comparison is meaningless.
      const baselineValues = isCumulative ? accumulate(rawBaseline) : rawBaseline;

      datasets.push({
        type: 'line',
        label: 'LTA baseline',
        data: baselineValues,
        borderColor: BASELINE_COLOR.main,
        backgroundColor: 'transparent',
        borderDash: [5, 5],
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
        order: 0,
      });
    }

    return {
      labels: monthLabels,
      datasets,
    };
  }, [monthlyData, chartMetric, selectedSeason, baselineData, includeLTA]);

  // Chart options for line charts (with SD band support)
  const getLineChartOptions = () => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          usePointStyle: true,
          padding: 8,
          filter: (item) => !item.text.includes('SD'), // Hide SD from legend
        }
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        callbacks: {
          label: (context) => {
            if (context.dataset.label?.includes('SD')) return null;
            const value = context.parsed.y;
            if (value == null) return null;
            return `${context.dataset.label}: ${formatMetricValue(value, chartMetric)}`;
          }
        }
      }
    },
    scales: {
      y: {
        // GDD seasonal totals sit well above 0 (~600+), so let the axis
        // auto-scale to the data range like the temperature metrics rather
        // than anchoring at 0 and squashing everything against the top.
        beginAtZero: chartMetric !== 'tmean' && chartMetric !== 'tmax' && chartMetric !== 'gdd',
        title: {
          display: true,
          // Cumulative in the monthly view — the axis has to say so, or a
          // season total of 1,400 reads as a single month.
          text: chartMetric === 'gdd'
            ? (viewMode === 'monthly' ? 'Cumulative GDD (°C·days)' : 'GDD (°C·days)')
            :
                (chartMetric === 'rain' || chartMetric === 'r99p' || chartMetric === 'rx1day') ? 'Rainfall (mm)' :
                (chartMetric === 'hot_days30') ? 'Days' :
                'Temperature (°C)',
        }
      },
      x: {
        title: {
          display: viewMode === 'monthly' || viewMode === 'season-compare' || viewMode === 'zone-compare',
          text: 'Growing Season Month'
        }
      }
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false,
    },
  });

  // Chart options for bar charts
  const getBarChartOptions = () => ({
    ...getLineChartOptions(),
    plugins: {
      ...getLineChartOptions().plugins,
    },
  });

  // Handle season card click
  const handleSeasonClick = (vintageYear) => {
    if (viewMode === 'season-compare') {
      // Toggle in comparison list (max 3)
      if (comparisonSeasons.includes(vintageYear)) {
        setComparisonSeasons(comparisonSeasons.filter(y => y !== vintageYear));
      } else if (comparisonSeasons.length < 3) {
        setComparisonSeasons([...comparisonSeasons, vintageYear]);
      }
    } else {
      setSelectedSeason(vintageYear);
      if (viewMode === 'overview') {
        setViewMode('monthly');
      }
    }
  };

  // Pagination for season cards
  const paginatedSeasons = useMemo(() => {
    if (!seasonsData?.seasons) return [];
    const start = seasonPage * seasonsPerPage;
    return seasonsData.seasons.slice(start, start + seasonsPerPage);
  }, [seasonsData, seasonPage]);

  const totalPages = Math.ceil((seasonsData?.seasons?.length || 0) / seasonsPerPage);

  if (!zone) {
    return (
      <div className="season-explorer">
        <div className="explorer-placeholder">
          <Calendar size={48} />
          <p>Select a climate zone to explore historical seasons</p>
        </div>
      </div>
    );
  }

  if (loading && !seasonsData) {
    return (
      <div className="season-explorer">
        <div className="explorer-loading">
          <p>Loading season data for {zone.name}...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="season-explorer">
        <div className="explorer-error">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!seasonsData) return null;

  const isRainfall = chartMetric === 'rain' || chartMetric === 'r99p';
  // Monthly view renders these as columns (must match the monthlyChartData
  // builder, which sets the main series type:'bar' + a dashed-line LTA).
  const monthlyIsBar = chartMetric === 'rain' || chartMetric === 'rx1day';

  return (
    <div className="season-explorer">
      {/* Header */}
      <div className="explorer-header">
        <h3>Climate History: {zone.name}</h3>
        {zone.region_name && <span className="zone-region">{zone.region_name}</span>}
      </div>

      {/* View Mode Toggle */}
      <div className="view-mode-selector">
        <button
          className={`mode-btn ${viewMode === 'overview' ? 'active' : ''}`}
          onClick={() => setViewMode('overview')}
        >
          <LineChart size={16} />
          Overview
        </button>
        <button
          className={`mode-btn ${viewMode === 'monthly' ? 'active' : ''}`}
          onClick={() => setViewMode('monthly')}
        >
          <BarChart3 size={16} />
          Monthly View
        </button>
        <button
          className={`mode-btn ${viewMode === 'season-compare' ? 'active' : ''}`}
          onClick={() => {
            setViewMode('season-compare');
            setComparisonSeasons(selectedSeason ? [selectedSeason] : []);
          }}
        >
          <Calendar size={16} />
          Compare Seasons
        </button>
        {/* The zone-compare mode was removed on 2026-08-24 along with the
            comparison picker. Its branches below are unreachable rather than
            deleted — mothballed, not ripped out. */}
              </div>

      {/* Baseline Summary */}
      {seasonsData.baseline && (
        <div className="baseline-summary">
          <div className="baseline-header">
            <span className="baseline-label">Long-term Average (1986-2005)</span>
            <label className="include-lta-toggle">
              <input
                type="checkbox"
                checked={includeLTA}
                onChange={(e) => setIncludeLTA(e.target.checked)}
              />
              Show on chart
            </label>
          </div>
          <div className="baseline-stats">
            <div className="baseline-stat">
              <Sun size={16} />
              <span className="stat-value">{formatMetricValue(seasonsData.baseline.gdd_total, 'gdd')}</span>
              <span className="stat-label">GDD</span>
            </div>
            <div className="baseline-stat">
              <Droplets size={16} />
              <span className="stat-value">{formatMetricValue(seasonsData.baseline.rain_total, 'rain')}</span>
              <span className="stat-label">Rainfall</span>
            </div>
            <div className="baseline-stat">
              <Thermometer size={16} />
              <span className="stat-value">{formatMetricValue(seasonsData.baseline.tmean_avg, 'tmean')}</span>
              <span className="stat-label">Avg Temp</span>
            </div>
          </div>
        </div>
      )}

      {/* Chart Controls */}
      <div className="chart-controls">
        <div className="chart-metric-selector">
          <button
            className={`chart-type-btn ${chartMetric === 'gdd' ? 'active' : ''}`}
            onClick={() => setChartMetric('gdd')}
          >
            GDD
          </button>
          <button
            className={`chart-type-btn ${chartMetric === 'rain' ? 'active' : ''}`}
            onClick={() => setChartMetric('rain')}
          >
            Rainfall
          </button>
          <button
            className={`chart-type-btn ${chartMetric === 'tmean' ? 'active' : ''}`}
            onClick={() => setChartMetric('tmean')}
          >
            Avg Temp
          </button>
          <button
            className={`chart-type-btn ${chartMetric === 'tmax' ? 'active' : ''}`}
            onClick={() => setChartMetric('tmax')}
          >
            Max Temp
          </button>
          {viewMode === 'overview' && OVERVIEW_EXTREME_METRICS.map(m => (
            <button
              key={m.key}
              className={`chart-type-btn ${chartMetric === m.key ? 'active' : ''}`}
              onClick={() => setChartMetric(m.key)}
            >
              {m.label}
            </button>
          ))}
          {viewMode === 'monthly' && (
            <>
              <button
                className={`chart-type-btn ${chartMetric === 'rx1day' ? 'active' : ''}`}
                onClick={() => setChartMetric('rx1day')}
              >
                Max 1-day Rain
              </button>
            </>
          )}
          {viewMode === 'season-compare' && (
            <>
              <button
                className={`chart-type-btn ${chartMetric === 'rx1day' ? 'active' : ''}`}
                onClick={() => setChartMetric('rx1day')}
              >
                Max 1-day Rain
              </button>
            </>
          )}
          {viewMode === 'zone-compare' && zoneCompareMode === 'trend' && ZONE_COMPARE_EXTREMES.map(m => (
            <button
              key={m.key}
              className={`chart-type-btn ${chartMetric === m.key ? 'active' : ''}`}
              onClick={() => setChartMetric(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
        
        {(viewMode === 'overview' || (viewMode === 'zone-compare' && zoneCompareMode === 'trend')) && (
          <select
            className="season-limit-select"
            value={seasonLimit}
            onChange={(e) => setSeasonLimit(Number(e.target.value))}
          >
            <option value={10}>Last 10 seasons</option>
            <option value={20}>Last 20 seasons</option>
            <option value={37}>All seasons</option>
          </select>
        )}

        {(viewMode === 'monthly' || (viewMode === 'zone-compare' && zoneCompareMode === 'season')) && selectedSeason && (
          <div className="season-selector">
            <label>Season:</label>
            <select
              className="season-select"
              value={selectedSeason}
              onChange={(e) => setSelectedSeason(Number(e.target.value))}
            >
              {seasonsData.seasons?.map(s => (
                <option key={s.vintage_year} value={s.vintage_year}>
                  {s.season_label}
                </option>
              ))}
            </select>
          </div>
        )}

        {viewMode === 'zone-compare' && (
          <div className="compare-type-toggle">
            <button
              type="button"
              className={`chart-type-btn ${zoneCompareMode === 'lta' ? 'active' : ''}`}
              onClick={() => { setZoneCompareMode('lta'); setIncludeLTA(true); }}
            >
              Compare LTA
            </button>
            <button
              type="button"
              className={`chart-type-btn ${zoneCompareMode === 'season' ? 'active' : ''}`}
              onClick={() => { setZoneCompareMode('season'); setIncludeLTA(false); }}
            >
              Compare Season
            </button>
            <button
              type="button"
              className={`chart-type-btn ${zoneCompareMode === 'trend' ? 'active' : ''}`}
              onClick={() => setZoneCompareMode('trend')}
            >
              Trend over seasons
            </button>
          </div>
        )}
      </div>

      {/* Season Selection for Comparison Mode */}
      {viewMode === 'season-compare' && (
        <div className="comparison-season-selector">
          <span className="selector-label">Select seasons to compare (max 3):</span>
          <div className="season-pills">
            {seasonsData.seasons?.slice(0, 15).map(s => (
              <button
                key={s.vintage_year}
                className={`season-pill ${comparisonSeasons.includes(s.vintage_year) ? 'selected' : ''}`}
                onClick={() => {
                  if (comparisonSeasons.includes(s.vintage_year)) {
                    setComparisonSeasons(comparisonSeasons.filter(y => y !== s.vintage_year));
                  } else if (comparisonSeasons.length < 3) {
                    setComparisonSeasons([...comparisonSeasons, s.vintage_year]);
                  }
                }}
                disabled={!comparisonSeasons.includes(s.vintage_year) && comparisonSeasons.length >= 3}
              >
                {s.season_label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Metric explainer */}
      {METRIC_EXPLAINERS[chartMetric] && (
        <div className="metric-explainer">{METRIC_EXPLAINERS[chartMetric]}</div>
      )}

      {/* Monthly view: frost/hot days are seasonal totals, surfaced here */}
      {viewMode === 'monthly' && selectedSeason && (() => {
        const sel = seasonsData.seasons?.find(s => s.vintage_year === selectedSeason);
        const ex = sel?.extremes;
        if (!ex) return null;
        return (
          <div className="monthly-extremes-summary">
            <span className="mes-label">{sel.season_label} season:</span>
            {/* No frost chip. Every frost figure was withdrawn on 2026-08-24:
                the count is thresholded off a lapse-retrended Tmin field that
                inverts on frost nights, so it loads frost onto high ground and
                erases it from the valley floors where the vines are. Spring
                frost came off the same field and went with it. */}
            <span className="mes-chip" title="Days above 30°C">
              <Flame size={13} />{Number(ex.hot_days30?.mean ?? 0).toFixed(0)} hot days
            </span>
            <span className="mes-chip" title="R99p — one-day extreme rainfall intensity">
              <CloudRain size={13} />{Number(ex.r99p?.mean ?? 0).toFixed(0)}mm extreme rain
            </span>
          </div>
        );
      })()}

      {/* Chart */}
      <div className="chart-container">
        {viewMode === 'overview' && overviewChartData && (
          isRainfall ? (
            <Bar data={overviewChartData} options={getBarChartOptions()} />
          ) : (
            <Line data={overviewChartData} options={getLineChartOptions()} />
          )
        )}
        
        {viewMode === 'monthly' && monthlyChartData && (
          monthlyIsBar ? (
            <Bar data={monthlyChartData} options={getBarChartOptions()} />
          ) : (
            <Line data={monthlyChartData} options={getLineChartOptions()} />
          )
        )}
        
        {viewMode === 'season-compare' && (
          <SeasonCompareChart
            zone={zone}
            seasons={comparisonSeasons}
            metric={chartMetric}
            includeLTA={includeLTA}
            baselineData={baselineData}
          />
        )}

        {viewMode === 'zone-compare' && zoneCompareMode !== 'trend' && (
          <ZoneCompareChart
            mainZone={zone}
            comparisonZones={comparisonZones}
            metric={chartMetric}
            selectedSeason={selectedSeason}
            useLTA={includeLTA}
            baselineData={baselineData}
          />
        )}

        {viewMode === 'zone-compare' && zoneCompareMode === 'trend' && (
          <ZoneTrendChart
            mainZone={zone}
            comparisonZones={comparisonZones}
            metric={chartMetric}
            seasonLimit={seasonLimit}
            showBaseline={includeLTA}
          />
        )}
        
        {loading && <div className="chart-loading-overlay">Loading...</div>}
      </div>

      {/* Seasonal extremes side-by-side for the selected seasons.
          Lives OUTSIDE .chart-container so it flows below the chart instead of
          overlapping the fixed-height canvas box. */}
      {viewMode === 'season-compare' && (() => {
        const rows = comparisonSeasons
          .map(vy => seasonsData.seasons?.find(s => s.vintage_year === vy))
          .filter(s => s && s.extremes);
        if (rows.length === 0) return null;
        const bx = seasonsData.baseline_extremes;
        const cell = (v) => Number(v ?? 0).toFixed(0);
        return (
          <div className="compare-extremes">
            <h4>Seasonal extremes</h4>
            <table className="compare-extremes-table">
              <thead>
                <tr>
                  <th>Season</th>
                  <th>Hot days &gt;30°C</th>
                  <th>Extreme rain</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(s => (
                  <tr key={s.vintage_year}>
                    <td>{s.season_label}</td>
                    <td>{cell(s.extremes.hot_days30?.mean)}</td>
                    <td>{cell(s.extremes.r99p?.mean)} mm</td>
                  </tr>
                ))}
                {bx && (
                  <tr className="baseline-row">
                    <td>LTA baseline</td>
                    <td>{cell(bx.hot_days30?.mean)}</td>
                    <td>{cell(bx.r99p?.mean)} mm</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        );
      })()}

      {/* Season Cards - 6 per page with pagination */}
      <div className="seasons-section">
        <div className="seasons-header">
          <h4>Season Summaries</h4>
          {totalPages > 1 && (
            <div className="seasons-pagination">
              <button
                className="page-btn"
                onClick={() => setSeasonPage(p => Math.max(0, p - 1))}
                disabled={seasonPage === 0}
              >
                <ChevronLeft size={18} />
              </button>
              <span className="page-info">
                {seasonPage + 1} / {totalPages}
              </span>
              <button
                className="page-btn"
                onClick={() => setSeasonPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={seasonPage >= totalPages - 1}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </div>
        <div className="seasons-grid">
          {paginatedSeasons.map((season) => (
            <div
              key={season.vintage_year}
              className={`season-card ${
                selectedSeason === season.vintage_year ? 'selected' : ''
              } ${
                comparisonSeasons.includes(season.vintage_year) ? 'comparing' : ''
              }`}
              onClick={() => handleSeasonClick(season.vintage_year)}
            >
              <div className="season-card-header">
                <span className="season-label">{season.season_label}</span>
                {season.rankings?.[0] && (
                  <span className="season-ranking">{season.rankings[0].label}</span>
                )}
              </div>
              <div className="season-card-stats">
                <div className="season-stat">
                  <span className="stat-label">GDD</span>
                  <span className="stat-value">{formatMetricValue(season.gdd_total, 'gdd')}</span>
                  {season.vs_baseline?.gdd_pct && (
                    <span className={`stat-diff ${Number(season.vs_baseline.gdd_pct) >= 0 ? 'positive' : 'negative'}`}>
                      <TrendIcon value={Number(season.vs_baseline.gdd_pct)} />
                      {formatPercentDiff(season.vs_baseline.gdd_pct)}
                    </span>
                  )}
                </div>
                <div className="season-stat">
                  <span className="stat-label">Rain</span>
                  <span className="stat-value">{formatMetricValue(season.rain_total, 'rain')}</span>
                  {season.vs_baseline?.rain_pct && (
                    <span className={`stat-diff ${Number(season.vs_baseline.rain_pct) <= 0 ? 'positive' : 'negative'}`}>
                      <TrendIcon value={Number(season.vs_baseline.rain_pct)} />
                      {formatPercentDiff(season.vs_baseline.rain_pct)}
                    </span>
                  )}
                </div>
                <div className="season-stat">
                  <span className="stat-label">Avg</span>
                  <span className="stat-value">{formatMetricValue(season.tmean_avg, 'tmean')}</span>
                  {season.vs_baseline?.tmean_diff && (
                    <span className={`stat-diff ${Number(season.vs_baseline.tmean_diff) >= 0 ? 'positive' : 'negative'}`}>
                      {Number(season.vs_baseline.tmean_diff) >= 0 ? '+' : ''}
                      {Number(season.vs_baseline.tmean_diff).toFixed(1)}°
                    </span>
                  )}
                </div>
              </div>
              {season.extremes && (
                <div className="season-card-extremes">
                  <span className="extreme-chip" title="Hot days (Tmax > 30°C)">
                    <Flame size={12} />{Number(season.extremes.hot_days30?.mean ?? 0).toFixed(0)}
                  </span>
                  <span className="extreme-chip" title="R99p extreme rainfall (mm)">
                    <CloudRain size={12} />{Number(season.extremes.r99p?.mean ?? 0).toFixed(0)}mm
                  </span>
                  {season.extremes.source === 'observed' && (
                    <span className="extreme-chip observed" title="Computed from live station data">obs</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Season Compare Chart Component
// ============================================================================

const SeasonCompareChart = ({ zone, seasons, metric, includeLTA, baselineData }) => {
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(false);

  const isRainfall = metric === 'rain' || metric === 'rx1day';
  // Frost spans the full vintage year (winter peak); others show Sep–Apr.
  const monthOrder = SEASON_MONTH_ORDER;
  const monthLabels = SEASON_MONTH_LABELS;

  useEffect(() => {
    if (!zone?.slug || seasons.length === 0) {
      setChartData(null);
      return;
    }

    const loadData = async () => {
      try {
        setLoading(true);
        
        // Load monthly data for each season
        const seasonDataPromises = seasons.map(year =>
          getZoneHistory(zone.slug, {
            vintage_year: year,
            months: monthOrder.join(',')
          })
        );

        const results = await Promise.all(seasonDataPromises);

        const datasets = [];

        results.forEach((result, idx) => {
          const sortedData = (result.data || [])
            .filter(d => monthOrder.includes(d.month))
            .sort((a, b) => monthOrder.indexOf(a.month) - monthOrder.indexOf(b.month));

          const values = sortedData.map(d => {
            switch (metric) {
              case 'gdd': return d.gdd?.mean;
              case 'rain': return d.rain?.mean;
              case 'rx1day': return d.rx1day?.mean;
              case 'tmean': return d.tmean?.mean;
              case 'tmax': return d.tmax?.mean;
              default: return d.gdd?.mean;
            }
          }).map(v => v != null ? Number(v) : null);

          const sds = sortedData.map(d => {
            switch (metric) {
              case 'gdd': return d.gdd?.sd;
              case 'rain': return d.rain?.sd;
              case 'rx1day': return d.rx1day?.sd;
              case 'tmean': return d.tmean?.sd;
              case 'tmax': return d.tmax?.sd;
              default: return d.gdd?.sd;
            }
          }).map(v => v != null ? Number(v) : null);

          const color = CHART_COLORS[idx % CHART_COLORS.length];
          const year = seasons[idx];

          // Add SD bands for line charts
          if (!isRainfall && sds.some(sd => sd != null)) {
            datasets.push({
              label: `${year} Upper SD`,
              data: values.map((v, i) => v != null && sds[i] != null ? v + sds[i] : null),
              borderColor: 'transparent',
              backgroundColor: color.fill,
              fill: '+1',
              pointRadius: 0,
              tension: 0.3,
              order: 10 + idx,
            });
            datasets.push({
              label: `${year} Lower SD`,
              data: values.map((v, i) => v != null && sds[i] != null ? Math.max(0, v - sds[i]) : null),
              borderColor: 'transparent',
              backgroundColor: 'transparent',
              fill: false,
              pointRadius: 0,
              tension: 0.3,
              order: 10 + idx,
            });
          }

          datasets.push({
            label: `${year - 1}/${String(year).slice(2)}`,
            data: values,
            borderColor: color.main,
            backgroundColor: isRainfall ? color.main + '99' : color.main,
            fill: false,
            tension: 0.3,
            pointRadius: 4,
            pointHoverRadius: 6,
            order: idx,
          });
        });

        // Add LTA baseline — always a dashed line
        if (includeLTA && baselineData?.monthly) {
          const baselineValues = monthOrder.map(month => {
            const monthData = baselineData.monthly.find(m => m.month === month);
            if (!monthData) return null;
            switch (metric) {
              case 'gdd': return monthData.gdd;
              case 'rain': return monthData.rain;
              case 'rx1day': return monthData.rx1day;
              case 'tmean': return monthData.tmean;
              case 'tmax': return monthData.tmax;
              default: return null;
            }
          }).map(v => v != null ? Number(v) : null);

          datasets.push({
            type: 'line',
            label: 'LTA baseline',
            data: baselineValues,
            borderColor: BASELINE_COLOR.main,
            backgroundColor: 'transparent',
            borderDash: [5, 5],
            borderWidth: 2,
            pointRadius: 0,
            fill: false,
            order: 100,
          });
        }

        setChartData({
          labels: monthLabels,
          datasets,
        });
      } catch (err) {
        console.error('Error loading comparison data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [zone?.slug, seasons, metric, includeLTA, baselineData, isRainfall]);

  if (loading) {
    return <div className="chart-loading">Loading comparison...</div>;
  }

  if (!chartData || seasons.length === 0) {
    return <div className="chart-placeholder">Select seasons to compare</div>;
  }

  const ChartComponent = isRainfall ? Bar : Line;

  return (
    <ChartComponent
      data={chartData}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { 
            position: 'top',
            labels: {
              filter: (item) => !item.text.includes('SD'),
            }
          },
          tooltip: { 
            mode: 'index', 
            intersect: false,
            callbacks: {
              label: (ctx) => {
                if (ctx.dataset.label?.includes('SD')) return null;
                return `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(1)}`;
              }
            }
          },
        },
        scales: {
          y: {
            beginAtZero: metric !== 'tmean' && metric !== 'tmax',
            title: {
              display: true,
              text: metric === 'gdd' ? 'GDD (°C·days)' :
                    (metric === 'rain' || metric === 'rx1day') ? 'Rainfall (mm)' :
                    'Temperature (°C)',
            }
          },
          x: {
            title: { display: true, text: 'Growing Season Month' }
          }
        },
      }}
    />
  );
};

// ============================================================================
// Zone Compare Chart Component
// ============================================================================

const ZoneCompareChart = ({ mainZone, comparisonZones = [], metric, selectedSeason, useLTA, baselineData }) => {
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const isRainfall = metric === 'rain';

  useEffect(() => {
    // Combine main zone with comparison zones
    const allZones = [mainZone, ...comparisonZones].filter(Boolean);

    // Need at least the main zone
    if (!mainZone) {
      setChartData(null);
      return;
    }

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const datasets = [];

        // Load data for each zone (main zone + comparison zones)
        for (let i = 0; i < allZones.length; i++) {
          const zone = allZones[i];
          const color = CHART_COLORS[i % CHART_COLORS.length];
          
          let values = [];
          let sds = [];
          
          try {
            if (useLTA) {
              // Load baseline
              const baseline = await getZoneBaseline(zone.slug);

              values = SEASON_MONTH_ORDER.map(month => {
                const monthData = baseline.monthly?.find(m => m.month === month);
                if (!monthData) return null;
                switch (metric) {
                  case 'gdd': return monthData.gdd;
                  case 'rain': return monthData.rain;
                  case 'tmean': return monthData.tmean;
                  case 'tmax': return monthData.tmax;
                  default: return null;
                }
              }).map(v => v != null ? Number(v) : null);
              sds = values.map(() => null); // No SD for baseline
            } else if (selectedSeason) {
              // Load season history
              const history = await getZoneHistory(zone.slug, {
                vintage_year: selectedSeason,
                months: SEASON_MONTH_ORDER.join(',')
              });

              const sortedData = [...(history.data || [])].sort((a, b) => 
                SEASON_MONTH_ORDER.indexOf(a.month) - SEASON_MONTH_ORDER.indexOf(b.month)
              );
              
              values = sortedData.map(d => {
                switch (metric) {
                  case 'gdd': return d.gdd?.mean;
                  case 'rain': return d.rain?.mean;
                  case 'tmean': return d.tmean?.mean;
                  case 'tmax': return d.tmax?.mean;
                  default: return d.gdd?.mean;
                }
              }).map(v => v != null ? Number(v) : null);
              sds = sortedData.map(d => {
                switch (metric) {
                  case 'gdd': return d.gdd?.sd;
                  case 'rain': return d.rain?.sd;
                  case 'tmean': return d.tmean?.sd;
                  case 'tmax': return d.tmax?.sd;
                  default: return d.gdd?.sd;
                }
              }).map(v => v != null ? Number(v) : null);
            } 
          } catch (zoneError) {
            console.error(`Error loading data for zone ${zone.slug}:`, zoneError);
            continue; // Skip this zone but continue with others
          }

          // Only add if we have data
          if (values.length === 0 || values.every(v => v === null)) {
            continue;
          }

          // Add SD bands for line charts (only for season data, not LTA)
          if (!isRainfall && !useLTA && sds.some(sd => sd != null)) {
            datasets.push({
              label: `${zone.name} Upper SD`,
              data: values.map((v, j) => v != null && sds[j] != null ? v + sds[j] : null),
              borderColor: 'transparent',
              backgroundColor: color.fill,
              fill: '+1',
              pointRadius: 0,
              tension: 0.3,
              order: 10 + i,
            });
            datasets.push({
              label: `${zone.name} Lower SD`,
              data: values.map((v, j) => v != null && sds[j] != null ? Math.max(0, v - sds[j]) : null),
              borderColor: 'transparent',
              backgroundColor: 'transparent',
              fill: false,
              pointRadius: 0,
              tension: 0.3,
              order: 10 + i,
            });
          }

          datasets.push({
            label: zone.name,
            data: values,
            borderColor: color.main,
            backgroundColor: isRainfall ? color.main + '99' : color.main,
            fill: false,
            tension: 0.3,
            pointRadius: 4,
            pointHoverRadius: 6,
            order: i,
          });
        }
        if (datasets.length > 0) {
          setChartData({
            labels: SEASON_MONTH_LABELS,
            datasets,
          });
        } else {
          setChartData(null);
          setError('No data available for selected zones');
        }
      } catch (err) {
        console.error('Error loading zone comparison:', err);
        setError('Failed to load zone comparison data');
        setChartData(null);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [mainZone, comparisonZones, metric, selectedSeason, useLTA, isRainfall]);

  if (loading) {
    return <div className="chart-loading">Loading zone comparison...</div>;
  }

  if (error) {
    return <div className="chart-placeholder">{error}</div>;
  }

  if (!chartData) {
    return (
      <div className="chart-placeholder">
        {mainZone ? 'No data available. Try selecting a different season or metric.' : 'Select a zone to view data'}
      </div>
    );
  }

  const ChartComponent = isRainfall ? Bar : Line;
  const title = useLTA 
    ? 'Long-term Average Comparison (1986-2005)' 
    : `Season ${selectedSeason - 1}/${String(selectedSeason).slice(2)} Comparison`;

  return (
    <ChartComponent
      data={chartData}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { 
            position: 'top',
            labels: {
              filter: (item) => !item.text.includes('SD'),
            }
          },
          tooltip: { 
            mode: 'index', 
            intersect: false,
            callbacks: {
              label: (ctx) => {
                if (ctx.dataset.label?.includes('SD')) return null;
                const value = ctx.parsed.y;
                if (value == null) return null;
                return `${ctx.dataset.label}: ${formatMetricValue(value, metric)}`;
              }
            }
          },
          title: {
            display: true,
            text: title,
            font: { size: 14, weight: 'bold' },
          }
        },
        scales: {
          y: {
            beginAtZero: metric !== 'tmean' && metric !== 'tmax',
            title: {
              display: true,
              text: metric === 'gdd' ? 'GDD (°C·days)' :
                    metric === 'rain' ? 'Rainfall (mm)' : 'Temperature (°C)',
            }
          },
          x: {
            title: { display: true, text: 'Growing Season Month' }
          }
        },
      }}
    />
  );
};

// =============================================================================
// Zone Trend Chart (multi-zone, multi-season)
// =============================================================================

const ZoneTrendChart = ({ mainZone, comparisonZones = [], metric, seasonLimit, showBaseline }) => {
  const [trendData, setTrendData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const isRainfall = metric === 'rain';

  useEffect(() => {
    if (!mainZone?.slug) {
      setTrendData(null);
      return;
    }

    const allZones = [mainZone, ...comparisonZones].filter(Boolean);
    const zoneSlugs = allZones.map(z => z.slug).join(',');
    const limitParam = seasonLimit >= 37 ? null : seasonLimit;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await compareZonesSeasons({
          zones: zoneSlugs,
          metric,
          limit: limitParam,
        });
        setTrendData(data);
      } catch (err) {
        console.error('Error loading zone trend:', err);
        setError('Failed to load trend data');
        setTrendData(null);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [mainZone?.slug, comparisonZones, metric, seasonLimit]);

  const chartData = useMemo(() => {
    if (!trendData?.zones?.length) return null;

    const labels = trendData.zones[0]?.series?.map(s => s.season_label) || [];

    const datasets = [];
    trendData.zones.forEach((z, i) => {
      const color = CHART_COLORS[i % CHART_COLORS.length];
      const values = z.series.map(s => (s.value != null ? Number(s.value) : null));

      datasets.push({
        label: z.zone_name,
        data: values,
        borderColor: color.main,
        backgroundColor: isRainfall ? color.main + 'CC' : color.main,
        fill: false,
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 6,
        order: i,
      });

      if (showBaseline && !isRainfall && z.baseline != null) {
        const baselineValue = Number(z.baseline);
        datasets.push({
          label: `${z.zone_name} LTA`,
          data: labels.map(() => baselineValue),
          borderColor: color.main,
          backgroundColor: 'transparent',
          borderDash: [6, 4],
          borderWidth: 1.5,
          fill: false,
          pointRadius: 0,
          tension: 0,
          order: 100 + i,
        });
      }
    });

    return { labels, datasets };
  }, [trendData, isRainfall, showBaseline]);

  if (loading && !trendData) {
    return <div className="chart-loading">Loading trend...</div>;
  }
  if (error) {
    return <div className="chart-placeholder">{error}</div>;
  }
  if (!chartData) {
    return (
      <div className="chart-placeholder">
        {mainZone ? 'No trend data available.' : 'Select a zone to view trend'}
      </div>
    );
  }

  const ChartComponent = isRainfall ? Bar : Line;

  return (
    <ChartComponent
      data={chartData}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: {
              filter: (item) => !item.text.endsWith(' LTA'),
            }
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              label: (ctx) => {
                if (ctx.dataset.label?.endsWith(' LTA')) return null;
                const value = ctx.parsed.y;
                if (value == null) return null;
                return `${ctx.dataset.label}: ${formatMetricValue(value, metric)}`;
              }
            }
          },
          title: {
            display: true,
            text: `${metric === 'gdd' ? 'Season GDD' :
                    metric === 'rain' ? 'Season Rainfall' :
                    metric === 'tmean' ? 'Season Avg Temp' :
                    metric === 'tmax' ? 'Season Max Temp' :
                    metric === 'hot_days30' ? 'Hot days >30°C' :
                    metric === 'r99p' ? 'Extreme rain (R99p)' : 'Season Min Temp'} by zone`,
            font: { size: 14, weight: 'bold' },
          }
        },
        scales: {
          y: {
            beginAtZero: metric !== 'tmean' && metric !== 'tmax',
            title: {
              display: true,
              text: metric === 'gdd' ? 'GDD (°C·days)' :
                    (metric === 'rain' || metric === 'r99p') ? 'Rainfall (mm)' :
                    (metric === 'hot_days30') ? 'Days' :
                    'Temperature (°C)',
            }
          },
          x: {
            title: { display: true, text: 'Growing season' }
          }
        },
      }}
    />
  );
};

export default SeasonExplorer;