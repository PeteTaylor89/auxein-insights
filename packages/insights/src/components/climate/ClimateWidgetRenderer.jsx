// src/components/climate/ClimateWidgetRenderer.jsx - Self-contained live climate widget
// Renders chart OR table from real-time climate API data
import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import 'chart.js/auto';
import { RefreshCw, AlertCircle } from 'lucide-react';
import {
  getGddProgress,
  getCurrentSeason,
  getDiseasePressure,
  fallbackVintages,
} from '../../services/realtimeClimateService';
import {
  compareSeasons,
  compareZonesSeasons,
  getZoneSeasons,
  getZoneProjections,
  getZones,
} from '../../services/publicClimateService';
import {
  getResponsiveLineChartOptions,
  getResponsiveBarChartOptions,
} from '../../utils/responsiveChartOptions';
import { surfaceMapProps } from '../surfaces/surfaceMapConfig';

// Lazy, and separately from this module's own lazy load. mapbox-gl is ~800 kB
// and only ONE of the eleven widget types needs it; bundled here directly it
// would ride along with every article that embeds a bar chart.
const ArticleSurfaceMap = lazy(() => import('../surfaces/ArticleSurfaceMap'));

const WIDGET_TITLES = {
  gdd_progress: 'GDD Progress',
  temperature_rainfall: 'Temperature & Rainfall',
  disease_pressure: 'Disease Pressure',
  season_comparison: 'Season Comparison',
  current_season_summary: 'Current Season Summary',
  recent_observations: 'Recent Observations',
  historical_trend: 'Historical Trend',
  region_trend_compare: 'Region Trend Comparison',
  region_trend_compare_interactive: 'Region Comparison (Interactive)',
  projection_outlook: 'Climate Projection',
  surface_map: 'Climate Surface',
};

const TREND_COLORS = [
  '#16a34a', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
];

const SSP_LABELS = {
  SSP126: 'SSP1-2.6 (Low emissions)',
  SSP245: 'SSP2-4.5 (Middle road)',
  SSP370: 'SSP3-7.0 (High emissions)',
};

const PERIOD_LABELS = {
  '2021_2040': 'Near-term (2021-2040)',
  '2041_2060': 'Mid-century (2041-2060)',
  '2080_2099': 'End of century (2080-2099)',
};

const DISEASE_LABELS = {
  downy_mildew: 'Downy Mildew',
  powdery_mildew: 'Powdery Mildew',
  botrytis: 'Botrytis',
};

// --- Pinning a widget to when it was written ---------------------------------
//
// These widget types read THE SEASON IN PROGRESS. Left unpinned they follow the
// calendar for ever, so an article published in February 2026 under the heading
// "2025 - 2026 Season GDD" ends up drawing the 2027 season — which, on a Sep-Apr
// definition, has not started. Audited 2026-08-23: 24 live widgets across 11
// published articles had done exactly that.
//
// So an article passes its `published_at` as `asOf` and these types resolve
// against that date instead of today. Everything else is deliberately NOT in
// this set:
//
//   historical_trend, region_trend_compare*, projection_outlook — long-run
//   series. They gain a year and stay correct; freezing them would make an
//   article about long-term trends go stale on purpose.
//
//   season_comparison — already carries explicit `vintages` where an author set
//   them. Only its FALLBACK is pinned, below.
const AS_OF_WIDGETS = new Set([
  'gdd_progress',
  'temperature_rainfall',
  'current_season_summary',
  'recent_observations',
  'disease_pressure',
]);

/** ISO timestamp -> 'YYYY-MM-DD', or null. Date-only, because the API takes a date. */
function toAsOfDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function formatAsOf(isoDate) {
  const d = new Date(`${isoDate}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? isoDate
    : d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' });
}

function ClimateWidgetRenderer({
  widgetType,
  zoneSlug,
  zoneName,
  zoneSlugs,
  zoneNames,
  metric,
  displayMode = 'chart',
  title,
  snapshotData,
  vintages,
  includeBaseline = true,
  seasonLimit,
  scenario,
  period,
  asOf,
  // --- surface_map only. See ClimateWidgetExtension for why these are flat.
  variable,
  cadence,
  validAt,
  statistic,
  followLatest,
  mapHeight,
  mapCentre,
  mapZoom,
  basemap,
  // The published page this widget lives in, for the embed grant. Only the
  // reader's view sets it; the admin preview deliberately does not, because a
  // draft grants nothing and pretending otherwise would show the author a map
  // that behaves differently once published.
  embed = null,
}) {
  const [data, setData] = useState(snapshotData || null);
  const [loading, setLoading] = useState(!snapshotData);
  const [error, setError] = useState(null);
  const isSnapshot = !!snapshotData;
  const isInteractive = widgetType === 'region_trend_compare_interactive';

  // Resolved once and used by both the fetch and the caption, so the date the
  // widget asks for can never disagree with the date it prints.
  const asOfDate = useMemo(() => toAsOfDate(asOf), [asOf]);
  const isPinned = !!asOfDate && AS_OF_WIDGETS.has(widgetType);

  // Reader-driven selection for interactive widget. Seeded from default zoneSlugs.
  const defaultPair = useMemo(() => {
    const slugs = (zoneSlugs || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 2);
    const names = (zoneNames || '').split(',').map(s => s.trim());
    return slugs.map((slug, i) => ({ slug, name: names[i] || slug }));
  }, [zoneSlugs, zoneNames]);

  const [readerZones, setReaderZones] = useState(defaultPair);
  const [zoneOptions, setZoneOptions] = useState(null); // for interactive picker
  // Reader-overridable settings for the interactive widget. Seeded from author attrs.
  const [readerMetric, setReaderMetric] = useState(metric || 'gdd');
  const [readerSeasonLimit, setReaderSeasonLimit] = useState(seasonLimit || 10);
  const [readerIncludeBaseline, setReaderIncludeBaseline] = useState(includeBaseline !== false);

  const effectiveMetric = isInteractive ? readerMetric : (metric || 'gdd');
  const effectiveSeasonLimit = isInteractive ? readerSeasonLimit : seasonLimit;
  const effectiveIncludeBaseline = isInteractive ? readerIncludeBaseline : (includeBaseline !== false);

  useEffect(() => {
    if (!isInteractive || zoneOptions) return;
    getZones()
      .then(res => setZoneOptions(res?.zones || []))
      .catch(() => setZoneOptions([]));
  }, [isInteractive, zoneOptions]);

  const activeSlugsForFetch = isInteractive
    ? readerZones.map(z => z.slug).filter(Boolean).join(',')
    : zoneSlugs;

  useEffect(() => {
    // Skip fetch if we have embedded snapshot data
    if (snapshotData) return;

    const isMultiZone = widgetType === 'region_trend_compare' || isInteractive;
    if (isMultiZone) {
      if (!activeSlugsForFetch) { setData(null); setLoading(false); return; }
    } else {
      if (!zoneSlug) return;
    }

    setLoading(true);
    setError(null);

    const fetchData = async () => {
      try {
        // Empty when the widget is not pinned, so an unpinned widget sends
        // exactly the request it always did.
        const asOfParams = isPinned ? { as_of: asOfDate } : {};

        switch (widgetType) {
          case 'gdd_progress': {
            setData(await getGddProgress(zoneSlug, asOfParams));
            break;
          }
          case 'temperature_rainfall':
          case 'current_season_summary':
          case 'recent_observations': {
            setData(await getCurrentSeason(zoneSlug, asOfParams));
            break;
          }
          case 'disease_pressure': {
            setData(await getDiseasePressure(zoneSlug, asOfParams));
            break;
          }
          case 'season_comparison': {
            // The fallback pair, resolved at publication rather than at read
            // time. An author who set `vintages` explicitly is untouched —
            // that is already a pinned widget and article 14 relies on it.
            //
            // `fallbackVintages` is SHARED with the editor's snapshot path on
            // purpose; see its docstring for what a second copy cost.
            const vintagesParam = vintages || fallbackVintages(asOfDate);
            setData(await compareSeasons({
              zone: zoneSlug,
              vintages: vintagesParam,
              include_baseline: includeBaseline,
            }));
            break;
          }
          case 'historical_trend': {
            const limit = seasonLimit && seasonLimit < 37 ? seasonLimit : null;
            setData(await getZoneSeasons(zoneSlug, limit ? { limit } : {}));
            break;
          }
          case 'region_trend_compare':
          case 'region_trend_compare_interactive': {
            const limit = effectiveSeasonLimit && effectiveSeasonLimit < 37 ? effectiveSeasonLimit : null;
            setData(await compareZonesSeasons({
              zones: activeSlugsForFetch,
              metric: effectiveMetric,
              limit,
            }));
            break;
          }
          case 'projection_outlook': {
            setData(await getZoneProjections(zoneSlug, {
              ssp: scenario || 'all',
              period: period || 'all',
            }));
            break;
          }
          default:
            setError('Unknown widget type');
        }
      } catch (err) {
        setError(err.message || 'Failed to load climate data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [widgetType, zoneSlug, activeSlugsForFetch, effectiveMetric, effectiveSeasonLimit, effectiveIncludeBaseline, snapshotData, vintages, scenario, period, isInteractive, asOfDate, isPinned]);

  const content = useMemo(() => {
    if (!data && !isInteractive) return null;
    const isTable = displayMode === 'table';

    switch (widgetType) {
      case 'gdd_progress':
        return isTable ? gddTable(data) : gddChart(data);
      case 'temperature_rainfall':
        return isTable ? tempRainTable(data, metric) : tempRainChart(data, metric);
      case 'disease_pressure':
        return isTable ? diseaseTable(data) : diseaseChart(data);
      case 'season_comparison':
        return isTable ? seasonTable(data, metric) : seasonChart(data, metric);
      case 'current_season_summary':
        return seasonSummaryTable(data);
      case 'recent_observations':
        return recentObsTable(data);
      case 'historical_trend':
        return historicalTrendChart(data, metric, includeBaseline);
      case 'region_trend_compare':
        return regionTrendChart(data, metric, includeBaseline);
      case 'region_trend_compare_interactive':
        return regionTrendInteractive({
          data,
          metric: readerMetric,
          includeBaseline: readerIncludeBaseline,
          seasonLimit: readerSeasonLimit,
          zoneOptions,
          readerZones,
          onZonesChange: setReaderZones,
          onMetricChange: setReaderMetric,
          onSeasonLimitChange: setReaderSeasonLimit,
          onIncludeBaselineChange: setReaderIncludeBaseline,
        });
      case 'projection_outlook':
        return projectionStatBlock(data, scenario, period);
      default:
        return null;
    }
  }, [data, widgetType, metric, displayMode, includeBaseline, zoneOptions, readerZones, readerMetric, readerIncludeBaseline, readerSeasonLimit, scenario, period, isInteractive]);

  // A SURFACE MAP IS NOT A SERIES. It has no zone, no vintage, no chart-or-table
  // mode and no snapshot — it owns its own catalogue, tiles and probe — so it
  // short-circuits every zone-keyed branch above rather than being threaded
  // through a fetch switch that has nothing to fetch for it.
  //
  // Placed HERE, after the last hook and before the loading guard, for two
  // reasons: an early return above the hooks would change hook order between
  // widget types and crash React, and `loading` never clears for this type
  // (the fetch effect returns at `if (!zoneSlug)`), so a return below the
  // guard would render a permanent "Loading climate data..." instead.
  if (widgetType === 'surface_map') {
    return (
      <div style={S.container}>
        {title && (
          <div style={S.header}>
            <h4 style={S.title}>{title}</h4>
          </div>
        )}
        <Suspense fallback={(
          <div style={S.loading}>
            <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />
            <span>Loading the climate surface...</span>
          </div>
        )}
        >
          {/* Through the SAME normaliser a research map section uses, so a
              node written by an older build degrades to defaults rather than
              handing `undefined` to Mapbox. */}
          <ArticleSurfaceMap
            {...surfaceMapProps({
              variable, cadence, validAt, statistic, followLatest,
              mapHeight, mapCentre, mapZoom, basemap,
            })}
            embed={embed}
          />
        </Suspense>
      </div>
    );
  }

  // Interactive widget renders its own picker even while loading/empty
  if (loading && !isInteractive) {
    return (
      <div style={S.container}>
        <div style={S.loading}>
          <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />
          <span>Loading climate data...</span>
        </div>
      </div>
    );
  }

  if (error && !isInteractive) {
    return (
      <div style={S.container}>
        <div style={S.error}><AlertCircle size={18} /> <span>{error}</span></div>
      </div>
    );
  }

  const zoneLabel = widgetType === 'region_trend_compare' || isInteractive
    ? (zoneNames || (zoneSlugs ? `${zoneSlugs.split(',').length} zones` : ''))
    : (zoneName || zoneSlug);

  return (
    <div style={S.container}>
      <div style={S.header}>
        <h4 style={S.title}>{title || WIDGET_TITLES[widgetType] || 'Climate Data'}</h4>
        <span style={S.zone}>{zoneLabel}</span>
      </div>
      <div style={(displayMode === 'table' || widgetType === 'projection_outlook' || isInteractive) ? {} : S.chartWrap}>
        {content}
      </div>
      <div style={S.attribution}>
        {isSnapshot && <span style={{ marginRight: '0.5rem', color: '#92400e' }}>Snapshot</span>}
        {/* Without this a pinned widget is indistinguishable from a broken one:
            the reader sees a season that stops partway and no reason why. */}
        {isPinned && !isSnapshot && (
          <span style={{ marginRight: '0.5rem' }}>As at {formatAsOf(asOfDate)}</span>
        )}
        Data: Auxein Climate Network
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// GDD Progress
// API shape: { daily_data: [{ date, gdd_actual, gdd_baseline }], milestones, current_gdd, baseline_gdd_at_date }
// ═════════════════════════════════════════════════════════════

function gddChart(data) {
  const daily = data?.daily_data?.filter((d) => d.gdd_actual != null);
  if (!daily?.length) return <p style={S.noData}>No GDD data available for this zone.</p>;

  // Thin out labels for readability — show every ~7th date
  const step = Math.max(1, Math.floor(daily.length / 25));
  const labels = daily.map((d, i) => i % step === 0 ? fmtDateShort(d.date) : '');

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Cumulative GDD',
        data: daily.map((d) => d.gdd_actual),
        borderColor: '#16a34a',
        backgroundColor: 'rgba(22, 163, 74, 0.1)',
        fill: true,
        pointRadius: 0,
      },
      {
        label: 'Baseline',
        data: daily.map((d) => d.gdd_baseline),
        borderColor: '#9ca3af',
        borderDash: [5, 5],
        pointRadius: 0,
        fill: false,
      },
    ],
  };

  return <Line data={chartData} options={getResponsiveLineChartOptions({ yAxis: { title: { text: 'GDD', display: true } } })} />;
}

function gddTable(data) {
  const daily = data?.daily_data?.filter((d) => d.gdd_actual != null);
  if (!daily?.length) return <p style={S.noData}>No GDD data available.</p>;

  // Show milestones + summary row, plus last ~14 days
  const rows = daily.slice(-14);
  return (
    <div>
      {/* Summary */}
      <div style={S.summaryRow}>
        <span>Current GDD: <strong>{num(data.current_gdd)}</strong></span>
        {data.baseline_gdd_at_date != null && (
          <span>Baseline at date: <strong>{num(data.baseline_gdd_at_date)}</strong></span>
        )}
        {data.days_vs_baseline != null && (
          <span style={{ color: data.days_vs_baseline >= 0 ? '#16a34a' : '#dc2626' }}>
            {data.days_vs_baseline >= 0 ? '+' : ''}{data.days_vs_baseline} days vs baseline
          </span>
        )}
      </div>
      {/* Milestones */}
      {data.milestones?.length > 0 && (
        <table style={S.table}>
          <thead><tr><th style={S.th}>Milestone</th><th style={S.th}>GDD Threshold</th><th style={S.th}>Reached</th></tr></thead>
          <tbody>
            {data.milestones.map((m) => (
              <tr key={m.name}>
                <td style={S.td}>{m.name}</td>
                <td style={S.tdNum}>{num(m.gdd_threshold)}</td>
                <td style={{ ...S.td, color: m.reached ? '#16a34a' : '#9ca3af' }}>{m.reached ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {/* Recent daily */}
      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', marginTop: '0.75rem', marginBottom: '0.25rem' }}>Last 14 days</div>
      <table style={S.table}>
        <thead><tr><th style={S.th}>Date</th><th style={S.th}>Actual GDD</th><th style={S.th}>Baseline GDD</th></tr></thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.date}>
              <td style={S.td}>{fmtDateShort(d.date)}</td>
              <td style={S.tdNum}>{num(d.gdd_actual)}</td>
              <td style={S.tdNum}>{num(d.gdd_baseline)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// Temperature & Rainfall
// API shape: { chart_data: { daily: [{ date, temp_min, temp_max, temp_mean, rainfall }] }, season: {...} }
// ═════════════════════════════════════════════════════════════

function tempRainChart(data, metric) {
  const m = metric || 'tmean';
  const daily = data?.chart_data?.daily;
  if (!daily?.length) return <p style={S.noData}>No season data available.</p>;

  const step = Math.max(1, Math.floor(daily.length / 25));
  const labels = daily.map((d, i) => i % step === 0 ? fmtDateShort(d.date) : '');

  if (m === 'rain') {
    const chartData = {
      labels,
      datasets: [{
        label: 'Rainfall (mm)',
        data: daily.map((d) => d.rainfall ?? 0),
        backgroundColor: 'rgba(59, 130, 246, 0.6)',
        borderColor: '#3b82f6',
        borderWidth: 1,
      }],
    };
    return <Bar data={chartData} options={getResponsiveBarChartOptions({ yAxis: { title: { text: 'mm', display: true } } })} />;
  }

  const fieldMap = { tmean: 'temp_mean', tmax: 'temp_max', tmin: 'temp_min' };
  const colorMap = { tmax: '#ef4444', tmin: '#3b82f6', tmean: '#f59e0b' };
  const labelMap = { tmax: 'Max Temp', tmin: 'Min Temp', tmean: 'Mean Temp' };
  const field = fieldMap[m] || 'temp_mean';

  const chartData = {
    labels,
    datasets: [{
      label: labelMap[m] || 'Temperature',
      data: daily.map((d) => d[field]),
      borderColor: colorMap[m] || '#f59e0b',
      backgroundColor: 'transparent',
      pointRadius: 0,
    }],
  };

  return <Line data={chartData} options={getResponsiveLineChartOptions({ yAxis: { title: { text: '°C', display: true } } })} />;
}

function tempRainTable(data, metric) {
  const daily = data?.chart_data?.daily;
  if (!daily?.length) return <p style={S.noData}>No season data available.</p>;

  const rows = daily.slice(-14);
  return (
    <table style={S.table}>
      <thead>
        <tr>
          <th style={S.th}>Date</th>
          <th style={S.th}>Min °C</th>
          <th style={S.th}>Mean °C</th>
          <th style={S.th}>Max °C</th>
          <th style={S.th}>Rain mm</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((d) => (
          <tr key={d.date}>
            <td style={S.td}>{fmtDateShort(d.date)}</td>
            <td style={S.tdNum}>{num(d.temp_min, 1)}</td>
            <td style={S.tdNum}>{num(d.temp_mean, 1)}</td>
            <td style={S.tdNum}>{num(d.temp_max, 1)}</td>
            <td style={S.tdNum}>{num(d.rainfall, 1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ═════════════════════════════════════════════════════════════
// Disease Pressure
// API shape: { current_pressure: { diseases: [{ disease, risk_level, score, description }] }, chart_data: { daily: [{ date, downy_mildew, powdery_mildew, botrytis }] } }
// ═════════════════════════════════════════════════════════════

const RISK_COLORS = { low: '#22c55e', moderate: '#f59e0b', high: '#ef4444', extreme: '#991b1b' };

function diseaseChart(data) {
  const daily = data?.chart_data?.daily;
  if (!daily?.length) {
    // Fall back to card display if no chart data
    return diseaseCards(data);
  }

  const step = Math.max(1, Math.floor(daily.length / 25));
  const labels = daily.map((d, i) => i % step === 0 ? fmtDateShort(d.date) : '');

  const chartData = {
    labels,
    datasets: [
      { label: 'Downy Mildew', data: daily.map((d) => d.downy_mildew), borderColor: '#3b82f6', pointRadius: 0, fill: false },
      { label: 'Powdery Mildew', data: daily.map((d) => d.powdery_mildew), borderColor: '#f59e0b', pointRadius: 0, fill: false },
      { label: 'Botrytis', data: daily.map((d) => d.botrytis), borderColor: '#8b5cf6', pointRadius: 0, fill: false },
    ],
  };

  return <Line data={chartData} options={getResponsiveLineChartOptions({ yAxis: { title: { text: 'Risk Score', display: true }, min: 0 } })} />;
}

function diseaseCards(data) {
  const diseases = data?.current_pressure?.diseases;
  if (!diseases?.length) return <p style={S.noData}>No disease pressure data available.</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {diseases.map((d) => (
        <div key={d.disease} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: RISK_COLORS[d.risk_level] || '#9ca3af', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#1f2937' }}>{DISEASE_LABELS[d.disease] || d.disease}</div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'capitalize' }}>{d.risk_level} risk</div>
          </div>
          {d.score != null && (
            <span style={{ fontWeight: 700, fontSize: '1.1rem', color: RISK_COLORS[d.risk_level] || '#374151' }}>{Math.round(d.score)}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function diseaseTable(data) {
  const diseases = data?.current_pressure?.diseases;
  if (!diseases?.length) return <p style={S.noData}>No disease pressure data available.</p>;

  return (
    <div>
      <table style={S.table}>
        <thead>
          <tr>
            <th style={S.th}>Disease</th>
            <th style={S.th}>Risk Level</th>
            <th style={S.th}>Score</th>
            <th style={S.th}>Description</th>
          </tr>
        </thead>
        <tbody>
          {diseases.map((d) => (
            <tr key={d.disease}>
              <td style={{ ...S.td, fontWeight: 600 }}>{DISEASE_LABELS[d.disease] || d.disease}</td>
              <td style={S.td}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: RISK_COLORS[d.risk_level] || '#9ca3af', display: 'inline-block' }} />
                  <span style={{ textTransform: 'capitalize' }}>{d.risk_level}</span>
                </span>
              </td>
              <td style={S.tdNum}>{d.score != null ? Math.round(d.score) : '—'}</td>
              <td style={{ ...S.td, fontSize: '0.75rem', color: '#6b7280', maxWidth: '250px' }}>{d.description || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.current_pressure?.recommendations && (
        <p style={{ fontSize: '0.8rem', color: '#374151', marginTop: '0.5rem', fontStyle: 'italic' }}>
          {data.current_pressure.recommendations}
        </p>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// Season Comparison
// API shape: { chart_data: { monthly: [{ month, month_name, baseline_gdd, "2024_gdd", "2025_gdd" }] }, seasons: [{ vintage_year, label, gdd_total, rain_total, ... }] }
// ═════════════════════════════════════════════════════════════

function seasonChart(data, metric) {
  const monthly = data?.chart_data?.monthly;
  if (!monthly?.length) return <p style={S.noData}>No comparison data available.</p>;

  const m = metric || 'gdd';
  const labels = monthly.map((d) => d.month_name);
  const colors = ['#16a34a', '#3b82f6', '#f59e0b', '#ef4444'];

  // Extract vintage keys from the monthly data (e.g., "2024_gdd", "2025_gdd")
  const vintageKeys = Object.keys(monthly[0]).filter((k) => k.endsWith(`_${m}`) && !k.startsWith('baseline'));
  const datasets = vintageKeys.map((key, i) => ({
    label: key.replace(`_${m}`, ''),
    data: monthly.map((d) => d[key]),
    borderColor: colors[i % colors.length],
    backgroundColor: 'transparent',
    pointRadius: 2,
  }));

  // Add baseline if present
  const baselineKey = `baseline_${m}`;
  if (monthly[0][baselineKey] != null) {
    datasets.push({
      label: 'Baseline',
      data: monthly.map((d) => d[baselineKey]),
      borderColor: '#9ca3af',
      borderDash: [5, 5],
      pointRadius: 0,
    });
  }

  const unit = m === 'rain' ? 'mm' : m === 'gdd' ? 'GDD' : '°C';
  return <Line data={{ labels, datasets }} options={getResponsiveLineChartOptions({ yAxis: { title: { text: unit, display: true } } })} />;
}

function seasonTable(data, metric) {
  const seasons = data?.seasons;
  if (!seasons?.length) return <p style={S.noData}>No comparison data available.</p>;

  return (
    <table style={S.table}>
      <thead>
        <tr>
          <th style={S.th}>Season</th>
          <th style={S.th}>GDD Total</th>
          <th style={S.th}>Rainfall (mm)</th>
          <th style={S.th}>Mean Temp °C</th>
          <th style={S.th}>vs Baseline</th>
        </tr>
      </thead>
      <tbody>
        {seasons.map((s) => (
          <tr key={s.vintage_year}>
            <td style={{ ...S.td, fontWeight: 600 }}>{s.label}</td>
            <td style={S.tdNum}>{num(s.gdd_total)}</td>
            <td style={S.tdNum}>{num(s.rain_total, 1)}</td>
            <td style={S.tdNum}>{num(s.tmean_avg, 1)}</td>
            <td style={S.td}>
              {s.vs_baseline?.gdd_pct != null ? (
                <span style={{ color: s.vs_baseline.gdd_diff >= 0 ? '#16a34a' : '#dc2626' }}>
                  {s.vs_baseline.gdd_diff >= 0 ? '+' : ''}{num(s.vs_baseline.gdd_pct, 1)}% GDD
                </span>
              ) : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ═════════════════════════════════════════════════════════════
// Current Season Summary (table only)
// Uses getCurrentSeason data.season
// ═════════════════════════════════════════════════════════════

function seasonSummaryTable(data) {
  const s = data?.season;
  if (!s) return <p style={S.noData}>No season data available.</p>;

  const rows = [
    ['Season', s.label],
    ['Days into season', s.days_into_season],
    ['GDD Total', num(s.gdd_total)],
    ['Rainfall Total', `${num(s.rainfall_total, 1)} mm`],
    ['Mean Temp (avg)', `${num(s.temp_mean_avg, 1)} °C`],
    ['Max Temp (avg)', `${num(s.temp_max_avg, 1)} °C`],
    ['Min Temp (avg)', `${num(s.temp_min_avg, 1)} °C`],
    ['Latest Data', fmtDateShort(s.latest_data_date)],
  ];

  const gddBaseline = s.gdd_vs_baseline;
  if (gddBaseline?.status) {
    rows.push(['GDD vs Baseline', `${gddBaseline.status} (${gddBaseline.difference_pct != null ? (gddBaseline.difference_pct >= 0 ? '+' : '') + num(gddBaseline.difference_pct, 1) + '%' : '—'})`]);
  }

  const rainBaseline = s.rainfall_vs_baseline;
  if (rainBaseline?.status) {
    rows.push(['Rain vs Baseline', `${rainBaseline.status} (${rainBaseline.difference_pct != null ? (rainBaseline.difference_pct >= 0 ? '+' : '') + num(rainBaseline.difference_pct, 1) + '%' : '—'})`]);
  }

  return (
    <table style={S.table}>
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <td style={{ ...S.td, fontWeight: 600, width: '45%' }}>{label}</td>
            <td style={S.td}>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ═════════════════════════════════════════════════════════════
// Recent Observations (table only)
// Uses getCurrentSeason data.recent_days
// ═════════════════════════════════════════════════════════════

function recentObsTable(data) {
  const days = data?.recent_days;
  if (!days?.length) return <p style={S.noData}>No recent observation data available.</p>;

  return (
    <table style={S.table}>
      <thead>
        <tr>
          <th style={S.th}>Date</th>
          <th style={S.th}>Min °C</th>
          <th style={S.th}>Mean °C</th>
          <th style={S.th}>Max °C</th>
          <th style={S.th}>Rain mm</th>
          <th style={S.th}>GDD</th>
        </tr>
      </thead>
      <tbody>
        {days.map((d) => (
          <tr key={d.date}>
            <td style={S.td}>{fmtDateShort(d.date)}</td>
            <td style={S.tdNum}>{num(d.temp_min, 1)}</td>
            <td style={S.tdNum}>{num(d.temp_mean, 1)}</td>
            <td style={S.tdNum}>{num(d.temp_max, 1)}</td>
            <td style={S.tdNum}>{num(d.rainfall_mm, 1)}</td>
            <td style={S.tdNum}>{num(d.gdd_daily, 1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ═════════════════════════════════════════════════════════════
// Historical Trend (single zone, multi-season)
// API shape: SeasonsResponse from getZoneSeasons
// ═════════════════════════════════════════════════════════════

function historicalTrendChart(data, metric, includeBaseline) {
  const seasons = data?.seasons;
  if (!seasons?.length) return <p style={S.noData}>No season data available.</p>;

  const m = metric || 'gdd';
  const baseline = data?.baseline || {};
  const baselineExtremes = data?.baseline_extremes || {};
  const ordered = [...seasons].reverse(); // API returns most-recent-first; chart wants chronological
  const labels = ordered.map(s => s.season_label);
  const num = (v) => (v != null ? Number(v) : null);
  const valueFor = (s) => {
    switch (m) {
      case 'gdd': return num(s.gdd_total);
      case 'rain': return num(s.rain_total);
      case 'tmean': return num(s.tmean_avg);
      case 'tmax': return num(s.tmax_avg);
      case 'tmin': return num(s.tmin_avg);
      case 'frost_days': return num(s.extremes?.frost_days?.mean);
      case 'early_frost': return num(s.extremes?.early_frost?.mean);
      case 'hot_days30': return num(s.extremes?.hot_days30?.mean);
      case 'r99p': return num(s.extremes?.r99p?.mean);
      default: return null;
    }
  };
  const baselineFor = () => {
    switch (m) {
      case 'gdd': return num(baseline.gdd_total);
      case 'rain': return num(baseline.rain_total);
      case 'tmean': return num(baseline.tmean_avg);
      case 'tmax': return num(baseline.tmax_avg);
      case 'tmin': return num(baseline.tmin_avg);
      case 'frost_days': return num(baselineExtremes.frost_days?.mean);
      case 'early_frost': return num(baselineExtremes.early_frost?.mean);
      case 'hot_days30': return num(baselineExtremes.hot_days30?.mean);
      case 'r99p': return num(baselineExtremes.r99p?.mean);
      default: return null;
    }
  };

  const values = ordered.map(valueFor);
  const datasets = [{
    label: WIDGET_TITLES.historical_trend,
    data: values,
    borderColor: TREND_COLORS[0],
    backgroundColor: m === 'rain' ? TREND_COLORS[0] + 'CC' : TREND_COLORS[0],
    fill: false,
    tension: 0.3,
    pointRadius: 3,
  }];

  const baselineValue = baselineFor();
  if (includeBaseline && baselineValue != null) {
    datasets.push({
      label: 'LTA (1986-2005)',
      data: labels.map(() => baselineValue),
      borderColor: '#9ca3af',
      borderDash: [6, 4],
      borderWidth: 1.5,
      pointRadius: 0,
      fill: false,
    });
  }

  const unitTitle = m === 'gdd' ? 'GDD (°C·days)' :
    (m === 'rain' || m === 'r99p') ? 'Rainfall (mm)' :
    (m === 'frost_days' || m === 'early_frost' || m === 'hot_days30') ? 'Days' :
    'Temperature (°C)';
  const ChartComponent = m === 'rain' ? Bar : Line;
  const options = m === 'rain'
    ? getResponsiveBarChartOptions({ yAxis: { title: { text: unitTitle, display: true } } })
    : getResponsiveLineChartOptions({ yAxis: { title: { text: unitTitle, display: true } } });

  return <ChartComponent data={{ labels, datasets }} options={options} />;
}

// ═════════════════════════════════════════════════════════════
// Region Trend Compare (multi-zone, multi-season)
// API shape: ZonesSeasonsCompareResponse from compareZonesSeasons
// ═════════════════════════════════════════════════════════════

function buildTrendChartData(data, metric, includeBaseline) {
  if (!data?.zones?.length) return null;
  const m = metric || 'gdd';
  const labels = data.zones[0]?.series?.map(s => s.season_label) || [];

  const datasets = [];
  data.zones.forEach((z, i) => {
    const color = TREND_COLORS[i % TREND_COLORS.length];
    const values = z.series.map(s => (s.value != null ? Number(s.value) : null));
    datasets.push({
      label: z.zone_name,
      data: values,
      borderColor: color,
      backgroundColor: m === 'rain' ? color + 'CC' : color,
      fill: false,
      tension: 0.3,
      pointRadius: 3,
      order: i,
    });
    if (includeBaseline && m !== 'rain' && z.baseline != null) {
      datasets.push({
        label: `${z.zone_name} LTA`,
        data: labels.map(() => Number(z.baseline)),
        borderColor: color,
        borderDash: [6, 4],
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false,
        order: 100 + i,
      });
    }
  });

  return { labels, datasets };
}

function regionTrendChart(data, metric, includeBaseline) {
  const chartData = buildTrendChartData(data, metric, includeBaseline);
  if (!chartData) return <p style={S.noData}>No trend data available.</p>;

  const m = metric || 'gdd';
  const unitTitle = m === 'gdd' ? 'GDD (°C·days)' : m === 'rain' ? 'Rainfall (mm)' : 'Temperature (°C)';
  const ChartComponent = m === 'rain' ? Bar : Line;
  const extraPluginOpts = {
    legend: { labels: { filter: (item) => !item.text?.endsWith(' LTA') } },
  };
  const options = m === 'rain'
    ? getResponsiveBarChartOptions({ yAxis: { title: { text: unitTitle, display: true } }, plugins: extraPluginOpts })
    : getResponsiveLineChartOptions({ yAxis: { title: { text: unitTitle, display: true } }, plugins: extraPluginOpts });

  return <ChartComponent data={chartData} options={options} />;
}

// ═════════════════════════════════════════════════════════════
// Region Trend Compare — Interactive (reader picks up to 2 zones)
// ═════════════════════════════════════════════════════════════

function regionTrendInteractive({
  data, metric, includeBaseline, seasonLimit,
  zoneOptions, readerZones,
  onZonesChange, onMetricChange, onSeasonLimitChange, onIncludeBaselineChange,
}) {
  const setSlotZone = (slotIndex, slug) => {
    if (!zoneOptions) return;
    const next = [...readerZones];
    if (!slug) {
      next.splice(slotIndex, 1);
    } else {
      const z = zoneOptions.find(x => x.slug === slug);
      const entry = { slug, name: z?.name || slug };
      if (next[slotIndex]) next[slotIndex] = entry; else next.push(entry);
    }
    // Dedupe
    const seen = new Set();
    onZonesChange(next.filter(e => {
      if (!e || seen.has(e.slug)) return false;
      seen.add(e.slug);
      return true;
    }).slice(0, 2));
  };

  const controlStyle = {
    padding: '0.4rem 0.6rem',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '0.85rem',
    background: 'white',
  };

  const renderSlot = (i) => {
    const current = readerZones[i]?.slug || '';
    return (
      <select
        key={i}
        value={current}
        onChange={(e) => setSlotZone(i, e.target.value)}
        style={{ ...controlStyle, minWidth: '180px' }}
      >
        <option value="">Pick region {i + 1}</option>
        {(zoneOptions || []).map(z => (
          <option key={z.slug} value={z.slug}>
            {z.region_name ? `${z.region_name}, ${z.name}` : z.name}
          </option>
        ))}
      </select>
    );
  };

  const chart = readerZones.length > 0 && data
    ? regionTrendChart(data, metric, includeBaseline)
    : (
      <p style={S.noData}>
        {zoneOptions ? 'Select up to two regions above to compare.' : 'Loading regions…'}
      </p>
    );

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        {renderSlot(0)}
        {renderSlot(1)}
      </div>
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.75rem' }}>
        <select
          value={metric}
          onChange={(e) => onMetricChange(e.target.value)}
          style={controlStyle}
          aria-label="Metric"
        >
          <option value="gdd">Growing Degree Days</option>
          <option value="rain">Rainfall</option>
          <option value="tmean">Mean Temperature</option>
          <option value="tmax">Max Temperature</option>
        </select>
        <select
          value={seasonLimit}
          onChange={(e) => onSeasonLimitChange(Number(e.target.value))}
          style={controlStyle}
          aria-label="Time range"
        >
          <option value={10}>Last 10 seasons</option>
          <option value={20}>Last 20 seasons</option>
          <option value={37}>All seasons</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#374151', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={includeBaseline}
            onChange={(e) => onIncludeBaselineChange(e.target.checked)}
          />
          Show LTA (1986-2005)
        </label>
      </div>
      <div style={S.chartWrap}>{chart}</div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// Projection Outlook (stat block)
// API shape: ProjectionsResponse from getZoneProjections (filtered by ssp + period)
// ═════════════════════════════════════════════════════════════

function projectionStatBlock(data, scenario, period) {
  const projections = data?.projections;
  if (!projections?.length) return <p style={S.noData}>No projection data available.</p>;

  // Find best match (caller should have filtered, but defend)
  const match = projections.find(p =>
    (!scenario || p.scenario?.code === scenario) &&
    (!period || p.period?.code === period)
  ) || projections[0];

  if (!match) return <p style={S.noData}>No matching projection scenario.</p>;

  const s = match.season_summary || {};
  const scenarioLabel = SSP_LABELS[match.scenario?.code] || match.scenario?.name || match.scenario?.code;
  const periodLabel = PERIOD_LABELS[match.period?.code] || match.period?.name || match.period?.code;

  const cells = [
    {
      label: 'Season GDD',
      baseline: s.gdd_baseline != null ? `${Math.round(Number(s.gdd_baseline))} °C·days` : '—',
      projected: s.gdd_projected != null ? `${Math.round(Number(s.gdd_projected))} °C·days` : '—',
      delta: s.gdd_change_pct != null ? `${Number(s.gdd_change_pct) >= 0 ? '+' : ''}${Number(s.gdd_change_pct).toFixed(1)}%` : '—',
      deltaPositive: s.gdd_change_pct != null ? Number(s.gdd_change_pct) >= 0 : null,
    },
    {
      label: 'Season rainfall',
      baseline: s.rain_baseline != null ? `${Math.round(Number(s.rain_baseline))} mm` : '—',
      projected: s.rain_projected != null ? `${Math.round(Number(s.rain_projected))} mm` : '—',
      delta: s.rain_change_pct != null ? `${Number(s.rain_change_pct) >= 0 ? '+' : ''}${Number(s.rain_change_pct).toFixed(1)}%` : '—',
      deltaPositive: null, // not coloured — direction is ambiguous for rainfall
    },
    {
      label: 'Mean temperature',
      baseline: s.tmean_baseline != null ? `${Number(s.tmean_baseline).toFixed(1)} °C` : '—',
      projected: s.tmean_projected != null ? `${Number(s.tmean_projected).toFixed(1)} °C` : '—',
      delta: s.tmean_change != null ? `${Number(s.tmean_change) >= 0 ? '+' : ''}${Number(s.tmean_change).toFixed(1)} °C` : '—',
      deltaPositive: s.tmean_change != null ? Number(s.tmean_change) >= 0 : null,
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: '0.75rem', fontSize: '0.85rem', color: '#374151' }}>
        <strong>{scenarioLabel}</strong> · {periodLabel} vs. 1986-2005 baseline
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
        {cells.map((c) => (
          <div key={c.label} style={{
            background: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '0.75rem 0.9rem',
          }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {c.label}
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', marginTop: '0.25rem' }}>
              {c.projected}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.15rem' }}>
              Baseline: {c.baseline}
            </div>
            {c.delta !== '—' && (
              <div style={{
                marginTop: '0.4rem',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: c.deltaPositive === null ? '#374151' : (c.deltaPositive ? '#16a34a' : '#dc2626'),
              }}>
                {c.delta}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// Helpers
// ═════════════════════════════════════════════════════════════

function num(v, decimals = 0) {
  if (v == null) return '—';
  const n = Number(v);
  return isNaN(n) ? '—' : n.toFixed(decimals);
}

function fmtDateShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });
}

// ═════════════════════════════════════════════════════════════
// Styles
// ═════════════════════════════════════════════════════════════

const S = {
  container: {
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    padding: '1.25rem',
    margin: '1.5rem 0',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: '1rem',
    flexWrap: 'wrap',
    gap: '0.5rem',
  },
  title: { margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111827' },
  zone: { fontSize: '0.8rem', color: '#6b7280', fontStyle: 'italic' },
  chartWrap: { height: '280px', position: 'relative' },
  attribution: { marginTop: '0.75rem', fontSize: '0.7rem', color: '#9ca3af', textAlign: 'right' },
  loading: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '2rem', color: '#6b7280', fontSize: '0.875rem' },
  error: { display: 'flex', alignItems: 'center', gap: '8px', padding: '1rem', color: '#dc2626', fontSize: '0.875rem' },
  noData: { color: '#9ca3af', fontSize: '0.875rem', textAlign: 'center', padding: '2rem 0' },
  summaryRow: { display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.85rem', color: '#374151', marginBottom: '0.75rem', padding: '0.5rem 0' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' },
  th: { textAlign: 'left', padding: '6px 8px', borderBottom: '2px solid #e5e7eb', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', whiteSpace: 'nowrap' },
  td: { padding: '5px 8px', borderBottom: '1px solid #f3f4f6', color: '#374151' },
  tdNum: { padding: '5px 8px', borderBottom: '1px solid #f3f4f6', color: '#374151', textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
};

export default ClimateWidgetRenderer;
