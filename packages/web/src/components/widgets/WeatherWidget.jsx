import { useEffect, useMemo, useState } from 'react';
import 'chart.js/auto';
import { Chart } from 'react-chartjs-2';
import { weatherCacheService } from '@vineyard/shared';
import { RefreshCcw, AlertTriangle } from 'lucide-react';

const DEFAULT_LOCATION = { lat: -43.5320, lon: 172.3103, name: 'Christchurch, NZ' };

const formatHour = (ts) => {
  const d = new Date(ts);
  const h = d.getHours();
  return `${h === 0 ? 12 : h % 12 || 12}${h >= 12 ? 'p' : 'a'}`;
};

const baseChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: 'rgba(47,47,47,0.92)',
      titleColor: '#fdf6e3',
      bodyColor: '#fdf6e3',
      padding: 10,
      cornerRadius: 6,
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: '#666', font: { size: 11 }, maxRotation: 0, autoSkipPadding: 12 },
    },
  },
};

const WeatherWidget = ({ location = null, className = '' }) => {
  const [current, setCurrent] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const loc = location || DEFAULT_LOCATION;

  const fetchWeather = async (forceRefresh = false) => {
    try {
      setLoading(true);
      setError(null);
      const [w, f] = await Promise.all([
        weatherCacheService.getCachedCurrentWeather(loc.lat, loc.lon, forceRefresh),
        weatherCacheService.getCachedWeatherForecast(loc.lat, loc.lon, forceRefresh),
      ]);
      setCurrent(w);
      setForecast(f);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Weather fetch failed:', err);
      setError(err.message || 'Could not load weather');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWeather(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.lat, loc.lon]);

  const series = useMemo(() => {
    const rows = forecast?.forecast || [];
    return {
      labels: rows.map((r) => formatHour(r.timestamp)),
      temp: rows.map((r) => r.weather?.temperature?.value ?? null),
      rain: rows.map((r) => r.weather?.precipitation?.value ?? 0),
      humidity: rows.map((r) => r.weather?.humidity?.value ?? null),
      wind: rows.map((r) => {
        const ws = r.weather?.windSpeed;
        if (!ws) return null;
        return ws.kmh ?? (ws.value != null ? ws.value * 3.6 : null);
      }),
      gust: rows.map((r) => {
        const wg = r.weather?.windGust;
        if (!wg) return null;
        return wg.kmh ?? (wg.value != null ? wg.value * 3.6 : null);
      }),
    };
  }, [forecast]);

  const tempRainData = {
    labels: series.labels,
    datasets: [
      {
        type: 'bar',
        label: 'Rain (mm)',
        data: series.rain,
        backgroundColor: 'rgba(59, 130, 246, 0.55)',
        borderColor: 'rgba(59, 130, 246, 0.85)',
        borderWidth: 1,
        yAxisID: 'yRain',
        order: 2,
      },
      {
        type: 'line',
        label: 'Temp (°C)',
        data: series.temp,
        borderColor: '#D1583B',
        backgroundColor: 'rgba(209, 88, 59, 0.12)',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.35,
        fill: true,
        yAxisID: 'yTemp',
        order: 1,
      },
    ],
  };

  const tempRainOptions = {
    ...baseChartOptions,
    scales: {
      ...baseChartOptions.scales,
      yTemp: {
        position: 'left',
        grid: { color: 'rgba(91, 104, 48, 0.08)' },
        ticks: { color: '#D1583B', font: { size: 11 }, callback: (v) => `${v}°` },
        title: { display: false },
      },
      yRain: {
        position: 'right',
        grid: { display: false },
        beginAtZero: true,
        suggestedMax: 2,
        ticks: { color: '#3b82f6', font: { size: 11 }, callback: (v) => `${v}mm` },
      },
    },
  };

  const humidityData = {
    labels: series.labels,
    datasets: [
      {
        type: 'line',
        label: 'Humidity (%)',
        data: series.humidity,
        borderColor: '#5B6830',
        backgroundColor: 'rgba(91, 104, 48, 0.15)',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.35,
        fill: true,
      },
    ],
  };

  const humidityOptions = {
    ...baseChartOptions,
    scales: {
      ...baseChartOptions.scales,
      y: {
        min: 0,
        max: 100,
        grid: { color: 'rgba(91, 104, 48, 0.08)' },
        ticks: { color: '#5B6830', font: { size: 11 }, callback: (v) => `${v}%` },
      },
    },
  };

  const windData = {
    labels: series.labels,
    datasets: [
      {
        type: 'line',
        label: 'Gusts (km/h)',
        data: series.gust,
        borderColor: 'rgba(120, 113, 108, 0.6)',
        backgroundColor: 'rgba(120, 113, 108, 0.18)',
        borderWidth: 1,
        borderDash: [4, 4],
        pointRadius: 0,
        tension: 0.35,
        fill: true,
      },
      {
        type: 'line',
        label: 'Wind (km/h)',
        data: series.wind,
        borderColor: '#0f766e',
        backgroundColor: 'rgba(15, 118, 110, 0.15)',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.35,
        fill: true,
      },
    ],
  };

  const windOptions = {
    ...baseChartOptions,
    scales: {
      ...baseChartOptions.scales,
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(91, 104, 48, 0.08)' },
        ticks: { color: '#0f766e', font: { size: 11 }, callback: (v) => `${v} km/h` },
      },
    },
  };

  const cw = current?.weather;
  const currentTemp = cw?.temperature?.value;
  const currentCondition = cw?.condition;
  const locationName = location?.name || DEFAULT_LOCATION.name;
  const hasForecast = series.labels.length > 0;

  return (
    <div className={`ww ${className}`}>
      <div className="ww-header">
        <div>
          <div className="ww-loc">{locationName}</div>
          {current?.location && (
            <div className="ww-coords">
              {current.location.lat?.toFixed(3)}, {current.location.lon?.toFixed(3)}
            </div>
          )}
        </div>
        <button
          type="button"
          className="ww-refresh"
          onClick={() => fetchWeather(true)}
          disabled={loading}
          title="Refresh"
        >
          <RefreshCcw size={14} />
        </button>
      </div>

      <div className="ww-body">
        {loading && !current && (
          <div className="ww-skeleton">Loading weather…</div>
        )}

        {error && (
          <div className="ww-error">
            <AlertTriangle size={16} />
            <span>{error}</span>
            <button type="button" onClick={() => fetchWeather(true)}>Retry</button>
          </div>
        )}

        {!loading && !error && (
          <>
            {(currentTemp != null || currentCondition) && (
              <div className="ww-now">
                <div className="ww-now-temp">
                  {currentTemp != null ? `${Math.round(currentTemp)}°C` : '—'}
                </div>
                {currentCondition && <div className="ww-now-cond">{currentCondition}</div>}
              </div>
            )}

            {hasForecast ? (
              <div className="ww-charts">
                <div className="ww-chart-block">
                  <div className="ww-chart-title">
                    <span className="ww-dot ww-dot-temp" /> Temperature
                    <span className="ww-sep">·</span>
                    <span className="ww-dot ww-dot-rain" /> Rainfall
                    <span className="ww-chart-window">next 24h</span>
                  </div>
                  <div className="ww-chart">
                    <Chart type="bar" data={tempRainData} options={tempRainOptions} />
                  </div>
                </div>

                <div className="ww-chart-block">
                  <div className="ww-chart-title">
                    <span className="ww-dot ww-dot-humidity" /> Humidity
                  </div>
                  <div className="ww-chart ww-chart-sm">
                    <Chart type="line" data={humidityData} options={humidityOptions} />
                  </div>
                </div>

                <div className="ww-chart-block">
                  <div className="ww-chart-title">
                    <span className="ww-dot ww-dot-wind" /> Wind
                    <span className="ww-sep">·</span>
                    <span className="ww-dot ww-dot-gust" /> Gusts
                  </div>
                  <div className="ww-chart ww-chart-sm">
                    <Chart type="line" data={windData} options={windOptions} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="ww-skeleton">Forecast not available</div>
            )}

            {lastUpdated && (
              <div className="ww-foot">
                Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        .ww {
          background: #fff;
          border-radius: 12px;
          border: 1px solid rgba(91, 104, 48, 0.25);
          box-shadow: 0 2px 8px rgba(47, 47, 47, 0.08);
          font-family: Calibri, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
          color: #2F2F2F;
          overflow: hidden;
        }
        .ww-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          background: #FDF6E3;
          border-bottom: 1px solid rgba(91, 104, 48, 0.25);
        }
        .ww-loc { font-size: 15px; font-weight: 600; color: #2F2F2F; }
        .ww-coords { font-size: 11px; color: #5B6830; margin-top: 2px; }
        .ww-refresh {
          background: transparent;
          border: 1px solid rgba(91, 104, 48, 0.35);
          color: #5B6830;
          width: 28px; height: 28px;
          border-radius: 6px;
          padding: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .ww-refresh:hover:not(:disabled) { background: #fff; }
        .ww-refresh:disabled { opacity: 0.5; cursor: not-allowed; }

        .ww-body { padding: 14px 16px 12px; }

        .ww-now {
          display: flex;
          align-items: baseline;
          gap: 12px;
          margin-bottom: 14px;
          padding-bottom: 12px;
          border-bottom: 1px solid rgba(91, 104, 48, 0.15);
        }
        .ww-now-temp { font-size: 30px; font-weight: 700; color: #5B6830; line-height: 1; }
        .ww-now-cond { font-size: 14px; color: #2F2F2F; opacity: 0.85; }

        .ww-charts { display: flex; flex-direction: column; gap: 14px; }
        .ww-chart-block { display: flex; flex-direction: column; gap: 6px; }
        .ww-chart-title {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 600;
          color: #5B6830;
          letter-spacing: 0.02em;
        }
        .ww-chart-window {
          margin-left: auto;
          font-size: 11px;
          color: #666;
          font-weight: 500;
          text-transform: none;
        }
        .ww-sep { color: #ccc; margin: 0 2px; }
        .ww-dot {
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        .ww-dot-temp { background: #D1583B; }
        .ww-dot-rain { background: #3b82f6; }
        .ww-dot-humidity { background: #5B6830; }
        .ww-dot-wind { background: #0f766e; }
        .ww-dot-gust { background: rgba(120, 113, 108, 0.6); }

        .ww-chart { height: 150px; position: relative; }
        .ww-chart-sm { height: 100px; }

        .ww-foot {
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px solid rgba(91, 104, 48, 0.15);
          font-size: 11px;
          color: #666;
        }

        .ww-skeleton {
          padding: 24px 0;
          text-align: center;
          color: #666;
          font-size: 13px;
        }

        .ww-error {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px;
          background: rgba(209, 88, 59, 0.08);
          border: 1px solid rgba(209, 88, 59, 0.3);
          border-radius: 6px;
          color: #D1583B;
          font-size: 13px;
        }
        .ww-error button {
          margin-left: auto;
          background: #D1583B;
          color: #fff;
          border: none;
          padding: 4px 10px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
        }
      `}</style>
    </div>
  );
};

export default WeatherWidget;
