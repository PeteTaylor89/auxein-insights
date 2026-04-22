// src/components/climate/ClimateWidgetRenderer.jsx - Self-contained live climate widget
// Renders chart OR table from real-time climate API data
import { useState, useEffect, useMemo } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import 'chart.js/auto';
import { RefreshCw, AlertCircle } from 'lucide-react';
import {
  getGddProgress,
  getCurrentSeason,
  getDiseasePressure,
} from '../../services/realtimeClimateService';
import { compareSeasons } from '../../services/publicClimateService';
import {
  getResponsiveLineChartOptions,
  getResponsiveBarChartOptions,
} from '../../utils/responsiveChartOptions';

const WIDGET_TITLES = {
  gdd_progress: 'GDD Progress',
  temperature_rainfall: 'Temperature & Rainfall',
  disease_pressure: 'Disease Pressure',
  season_comparison: 'Season Comparison',
  current_season_summary: 'Current Season Summary',
  recent_observations: 'Recent Observations',
};

const DISEASE_LABELS = {
  downy_mildew: 'Downy Mildew',
  powdery_mildew: 'Powdery Mildew',
  botrytis: 'Botrytis',
};

function ClimateWidgetRenderer({ widgetType, zoneSlug, zoneName, metric, displayMode = 'chart', title, snapshotData, vintages, includeBaseline = true }) {
  const [data, setData] = useState(snapshotData || null);
  const [loading, setLoading] = useState(!snapshotData);
  const [error, setError] = useState(null);
  const isSnapshot = !!snapshotData;

  useEffect(() => {
    // Skip fetch if we have embedded snapshot data
    if (snapshotData) return;
    if (!zoneSlug) return;
    setLoading(true);
    setError(null);

    const fetchData = async () => {
      try {
        switch (widgetType) {
          case 'gdd_progress': {
            setData(await getGddProgress(zoneSlug));
            break;
          }
          case 'temperature_rainfall':
          case 'current_season_summary':
          case 'recent_observations': {
            setData(await getCurrentSeason(zoneSlug));
            break;
          }
          case 'disease_pressure': {
            setData(await getDiseasePressure(zoneSlug));
            break;
          }
          case 'season_comparison': {
            let vintagesParam = vintages;
            if (!vintagesParam) {
              const currentYear = new Date().getFullYear();
              vintagesParam = `${currentYear},${currentYear - 1}`;
            }
            setData(await compareSeasons({
              zone: zoneSlug,
              vintages: vintagesParam,
              include_baseline: includeBaseline,
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
  }, [widgetType, zoneSlug, metric, snapshotData, vintages, includeBaseline]);

  const content = useMemo(() => {
    if (!data) return null;
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
      default:
        return null;
    }
  }, [data, widgetType, metric, displayMode]);

  if (loading) {
    return (
      <div style={S.container}>
        <div style={S.loading}>
          <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />
          <span>Loading climate data...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={S.container}>
        <div style={S.error}><AlertCircle size={18} /> <span>{error}</span></div>
      </div>
    );
  }

  return (
    <div style={S.container}>
      <div style={S.header}>
        <h4 style={S.title}>{title || WIDGET_TITLES[widgetType] || 'Climate Data'}</h4>
        <span style={S.zone}>{zoneName || zoneSlug}</span>
      </div>
      <div style={displayMode === 'table' ? {} : S.chartWrap}>
        {content}
      </div>
      <div style={S.attribution}>
        {isSnapshot && <span style={{ marginRight: '0.5rem', color: '#92400e' }}>Snapshot</span>}
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
