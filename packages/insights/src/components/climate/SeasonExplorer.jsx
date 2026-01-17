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
import { TrendingUp, TrendingDown, Minus, Calendar, Droplets, Thermometer, Sun, BarChart3, LineChart, MapPin, ChevronLeft, ChevronRight } from 'lucide-react';
import { 
  getZoneSeasons, 
  getZoneHistory,
  compareSeasons,
  compareZones,
  getZoneBaseline,
  formatMetricValue, 
  formatPercentDiff,
  MONTH_NAMES,
  GROWING_SEASON_MONTHS 
} from '../../services/publicClimateService';

// Growing season month labels in order
const SEASON_MONTH_LABELS = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'];
const SEASON_MONTH_ORDER = [10, 11, 12, 1, 2, 3, 4];

// Chart colors
const CHART_COLORS = [
  { main: '#3B82F6', light: '#93C5FD', fill: 'rgba(59, 130, 246, 0.15)' },  // Blue
  { main: '#10B981', light: '#6EE7B7', fill: 'rgba(16, 185, 129, 0.15)' },  // Green
  { main: '#F59E0B', light: '#FCD34D', fill: 'rgba(245, 158, 11, 0.15)' },  // Amber
  { main: '#EF4444', light: '#FCA5A5', fill: 'rgba(239, 68, 68, 0.15)' },   // Red
  { main: '#8B5CF6', light: '#C4B5FD', fill: 'rgba(139, 92, 246, 0.15)' },  // Purple
];

const BASELINE_COLOR = { main: '#6B7280', light: '#9CA3AF', fill: 'rgba(107, 114, 128, 0.1)' };

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
  const [seasonPage, setSeasonPage] = useState(0);

  const seasonsPerPage = 6;

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
        const data = await getZoneHistory(zone.slug, {
          vintage_year: selectedSeason,
          months: SEASON_MONTH_ORDER.join(',')
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
    if (viewMode !== 'zone-compare' || comparisonZones.length === 0) {
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
  }, [zone?.slug, comparisonZones, viewMode, chartMetric, selectedSeason, includeLTA]);

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
    const isRainfall = chartMetric === 'rain';
    
    const getValue = (s) => {
      switch (chartMetric) {
        case 'gdd': return s.gdd_total;
        case 'rain': return s.rain_total;
        case 'tmean': return s.tmean_avg;
        case 'tmax': return s.tmax_avg;
        default: return s.gdd_total;
      }
    };

    const datasets = [{
      label: chartMetric === 'gdd' ? 'Season GDD' : 
             chartMetric === 'rain' ? 'Season Rainfall (mm)' : 
             chartMetric === 'tmean' ? 'Season Avg Temp (°C)' : 'Season Max Temp (°C)',
      data: seasons.map(s => getValue(s) ? Number(getValue(s)) : null),
      borderColor: CHART_COLORS[0].main,
      backgroundColor: isRainfall ? CHART_COLORS[0].main + '99' : CHART_COLORS[0].fill,
      fill: !isRainfall,
      tension: 0.3,
      pointRadius: 5,
      pointHoverRadius: 7,
    }];

    // Add baseline line
    if (seasonsData.baseline && includeLTA) {
      const baselineValue = chartMetric === 'gdd' ? seasonsData.baseline.gdd_total :
                          chartMetric === 'rain' ? seasonsData.baseline.rain_total :
                          chartMetric === 'tmean' ? seasonsData.baseline.tmean_avg :
                          seasonsData.baseline.tmax_avg;
      if (baselineValue) {
        datasets.push({
          label: 'LTA (1986-2005)',
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
    
    const isRainfall = chartMetric === 'rain';
    
    // Sort by growing season order
    const sortedData = [...monthlyData.data].sort((a, b) => {
      return SEASON_MONTH_ORDER.indexOf(a.month) - SEASON_MONTH_ORDER.indexOf(b.month);
    });

    const getValue = (d) => {
      switch (chartMetric) {
        case 'gdd': return d.gdd?.mean;
        case 'rain': return d.rain?.mean;
        case 'tmean': return d.tmean?.mean;
        case 'tmax': return d.tmax?.mean;
        default: return d.gdd?.mean;
      }
    };

    const getSD = (d) => {
      switch (chartMetric) {
        case 'gdd': return d.gdd?.sd;
        case 'rain': return d.rain?.sd;
        case 'tmean': return d.tmean?.sd;
        case 'tmax': return d.tmax?.sd;
        default: return d.gdd?.sd;
      }
    };

    const values = sortedData.map(d => {
      const v = getValue(d);
      return v != null ? Number(v) : null;
    });
    const sds = sortedData.map(d => {
      const sd = getSD(d);
      return sd != null ? Number(sd) : null;
    });
    
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

    // Add baseline from monthly data
    if (baselineData?.monthly && includeLTA) {
      const baselineValues = SEASON_MONTH_ORDER.map(month => {
        const v = getBaselineMonthlyValue(month, chartMetric);
        return v != null ? Number(v) : null;
      });
      
      datasets.push({
        label: 'LTA (1986-2005)',
        data: baselineValues,
        borderColor: BASELINE_COLOR.main,
        backgroundColor: isRainfall ? BASELINE_COLOR.main + '60' : 'transparent',
        borderDash: isRainfall ? [] : [5, 5],
        borderWidth: 2,
        pointRadius: isRainfall ? 0 : 3,
        fill: false,
        order: 0,
      });
    }

    return {
      labels: SEASON_MONTH_LABELS,
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
          padding: 15,
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
        beginAtZero: chartMetric !== 'tmean' && chartMetric !== 'tmax',
        title: {
          display: true,
          text: chartMetric === 'gdd' ? 'GDD (°C·days)' :
                chartMetric === 'rain' ? 'Rainfall (mm)' : 'Temperature (°C)',
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

  const isRainfall = chartMetric === 'rain';

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
        <button
          className={`mode-btn ${viewMode === 'zone-compare' ? 'active' : ''}`}
          onClick={() => setViewMode('zone-compare')}
        >
          <MapPin size={16} />
          Compare Zones
        </button>
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
        </div>
        
        {viewMode === 'overview' && (
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

        {(viewMode === 'monthly' || viewMode === 'zone-compare') && selectedSeason && (
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
            <label>
              <input
                type="radio"
                checked={includeLTA}
                onChange={() => setIncludeLTA(true)}
              />
              Compare LTA
            </label>
            <label>
              <input
                type="radio"
                checked={!includeLTA}
                onChange={() => setIncludeLTA(false)}
              />
              Compare Season
            </label>
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
          isRainfall ? (
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
        
        {viewMode === 'zone-compare' && (
          <ZoneCompareChart
            mainZone={zone}
            comparisonZones={comparisonZones}
            metric={chartMetric}
            selectedSeason={selectedSeason}
            useLTA={includeLTA}
            baselineData={baselineData}
          />
        )}
        
        {loading && <div className="chart-loading-overlay">Loading...</div>}
      </div>

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

  const isRainfall = metric === 'rain';

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
            months: SEASON_MONTH_ORDER.join(',')
          })
        );
        
        const results = await Promise.all(seasonDataPromises);
        
        const datasets = [];

        results.forEach((result, idx) => {
          const sortedData = [...(result.data || [])].sort((a, b) => 
            SEASON_MONTH_ORDER.indexOf(a.month) - SEASON_MONTH_ORDER.indexOf(b.month)
          );
          
          const values = sortedData.map(d => {
            switch (metric) {
              case 'gdd': return d.gdd?.mean;
              case 'rain': return d.rain?.mean;
              case 'tmean': return d.tmean?.mean;
              case 'tmax': return d.tmax?.mean;
              default: return d.gdd?.mean;
            }
          }).map(v => v != null ? Number(v) : null);

          const sds = sortedData.map(d => {
            switch (metric) {
              case 'gdd': return d.gdd?.sd;
              case 'rain': return d.rain?.sd;
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

        // Add LTA baseline
        if (includeLTA && baselineData?.monthly) {
          const baselineValues = SEASON_MONTH_ORDER.map(month => {
            const monthData = baselineData.monthly.find(m => m.month === month);
            if (!monthData) return null;
            switch (metric) {
              case 'gdd': return monthData.gdd;
              case 'rain': return monthData.rain;
              case 'tmean': return monthData.tmean;
              case 'tmax': return monthData.tmax;
              default: return null;
            }
          }).map(v => v != null ? Number(v) : null);
          
          datasets.push({
            label: 'LTA (1986-2005)',
            data: baselineValues,
            borderColor: BASELINE_COLOR.main,
            backgroundColor: isRainfall ? BASELINE_COLOR.main + '60' : 'transparent',
            borderDash: isRainfall ? [] : [5, 5],
            borderWidth: 2,
            pointRadius: isRainfall ? 0 : 3,
            fill: false,
            order: 100,
          });
        }

        setChartData({
          labels: SEASON_MONTH_LABELS,
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

export default SeasonExplorer;