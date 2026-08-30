// src/pages/StationMap.jsx - Weather station coverage map
//
// One map answering "what is measured where". The whole station set arrives in
// a single /weather/stations/map call (~870 rows) and every filter is applied
// client-side, so changing a filter is instant and costs no request. Only the
// chart modal goes back to the server, for one station and one variable.
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Line } from 'react-chartjs-2';
import {
  RefreshCw, X, ExternalLink, MapPin, AlertTriangle, Search,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import adminService from '../services/adminService';
import '../utils/chartDefaults';
import './admin.css';
import './StationMap.css';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || '';

const NZ_BOUNDS = [[166.0, -47.5], [179.0, -34.0]];

// Sentinel for the zone filter. A distinct string rather than null so the
// <select> can hold it as a value, and one that cannot collide with a zone id.
const UNASSIGNED = 'unassigned';

const STATUS_COLORS = {
  healthy: '#10b981',
  stale: '#f59e0b',
  offline: '#ef4444',
};

const STATUS_ORDER = ['healthy', 'stale', 'offline'];

// Friendly labels for the raw variable keys stored in weather_data.
const VARIABLE_LABELS = {
  temp: 'Air temperature',
  rainfall: 'Rainfall',
  rh: 'Relative humidity',
  wind_speed: 'Wind speed',
  wind_direction: 'Wind direction',
  wind_gust: 'Wind gust',
  soil_temp: 'Soil temperature',
  soil_moisture_vwc: 'Soil moisture',
  pressure: 'Pressure',
  pressure_msl: 'Pressure (MSL)',
  dewpoint: 'Dew point',
  solar_radiation: 'Solar radiation',
  evapotranspiration: 'Evapotranspiration',
};

const labelFor = (v) => VARIABLE_LABELS[v] || v;

const formatAge = (hours) => {
  if (hours === null || hours === undefined) return 'never';
  if (hours < 1) return `${Math.round(hours * 60)}m ago`;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

const formatInterval = (minutes) => {
  if (!minutes) return 'unknown';
  if (minutes < 60) return `${minutes} min`;
  if (minutes === 60) return 'hourly';
  if (minutes < 1440) return `${minutes / 60}-hourly`;
  return 'daily';
};

// ---------------------------------------------------------------------------
// Chart modal
// ---------------------------------------------------------------------------

// Which raw variable names count as a thermometer. MUST match
// TEMP_VARIABLE_NAMES in admin_weather.py and the temperature list in
// hourly_aggregation — an hour with no temperature is skipped by the rollup
// outright, so this is what decides whether an assignment does anything.
const TEMP_VARIABLES = ['temp', 'temperature', 'air_temperature'];
const RH_VARIABLES = ['rh', 'humidity', 'relative_humidity'];

function StationChartModal({ station, zones = [], onClose, onAssigned }) {
  const [variable, setVariable] = useState(station.variables[0] || null);
  const [zoneId, setZoneId] = useState(station.zone_id ?? '');
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [days, setDays] = useState(10);
  const [series, setSeries] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!variable) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    adminService.weather
      .getStationSeries(station.station_id, variable, days)
      .then((data) => { if (!cancelled) setSeries(data); })
      .catch((err) => {
        if (!cancelled) setError(err?.response?.data?.detail || 'Could not load this series.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [station.station_id, variable, days]);

  // Escape closes, and the body must not scroll behind the modal.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  // What this station can actually contribute once assigned. Temperature is the
  // gate: an hour without it is skipped by the rollup, and dew point and leaf
  // wetness are undefined, so all three models go with it.
  const hasTemp = station.variables.some((v) => TEMP_VARIABLES.includes(v));
  const hasRh = station.variables.some((v) => RH_VARIABLES.includes(v));
  const hasRain = station.variables.includes('rainfall');

  const saveZone = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    setSaveResult(null);
    try {
      const result = await adminService.assignStationZone(
        station.station_id, zoneId === '' ? null : zoneId);
      setSaveResult(result);
      // Tell the map, so the marker and the filter counts move without a full
      // reload — the payload is ~900 rows and refetching it to change one field
      // would blank the map mid-edit.
      onAssigned?.(station.station_id, result.zone_id, result.zone_name);
    } catch (err) {
      setSaveError(err?.response?.data?.detail || 'Could not save the zone.');
    } finally {
      setSaving(false);
    }
  }, [station.station_id, zoneId, onAssigned]);

  const chart = useMemo(() => {
    if (!series || !series.points.length) return null;

    // {x, y} with parsing off so Chart.js can run LTTB decimation — the densest
    // station in the network returns ~6,700 points for 10 days.
    const points = series.points
      .filter((p) => p.v !== null)
      .map((p) => ({ x: Date.parse(p.t), y: p.v }));

    if (!points.length) return null;

    const isBar = series.variable === 'rainfall';

    return {
      data: {
        datasets: [{
          label: `${labelFor(series.variable)}${series.unit ? ` (${series.unit})` : ''}`,
          data: points,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.12)',
          borderWidth: 1.5,
          pointRadius: 0,
          pointHitRadius: 8,
          tension: isBar ? 0 : 0.2,
          fill: !isBar,
          stepped: isBar,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        parsing: false,
        normalized: true,
        animation: false,
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        plugins: {
          legend: { display: false },
          decimation: { enabled: true, algorithm: 'lttb', samples: 600 },
          tooltip: {
            callbacks: {
              title: (items) => new Date(items[0].parsed.x).toLocaleString('en-NZ', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
              }),
              label: (item) => `${item.parsed.y}${series.unit ? ` ${series.unit}` : ''}`,
            },
          },
        },
        scales: {
          x: {
            type: 'linear',
            // A time scale would need chartjs-adapter-date-fns, which this app
            // does not ship. Linear + a formatting callback avoids the dep.
            ticks: {
              maxTicksLimit: 7,
              autoSkip: true,
              callback: (value) => new Date(value).toLocaleDateString('en-NZ', {
                day: 'numeric', month: 'short',
              }),
            },
            grid: { display: false },
          },
          y: {
            title: {
              display: Boolean(series.unit),
              text: series.unit || '',
            },
            beginAtZero: isBar,
          },
        },
      },
    };
  }, [series]);

  return (
    <div className="station-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="station-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${station.station_name || station.station_code} recent data`}
      >
        <header className="station-modal-header">
          <div className="station-modal-title">
            <h2>{station.station_name || station.station_code}</h2>
            <p>
              <span className={`status-badge status-${station.status}`}>{station.status}</span>
              <span className="station-modal-meta">
                {station.data_source}
                {station.region ? ` · ${station.region}` : ''}
                {' · '}{formatInterval(station.derived_interval_minutes)}
                {' · last '}{formatAge(station.hours_since_last_data)}
              </span>
            </p>
          </div>
          <button type="button" className="station-modal-close" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </header>

        <div className="station-modal-controls">
          <div className="station-modal-vars" role="tablist" aria-label="Variable">
            {station.variables.map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={v === variable}
                className={`var-chip ${v === variable ? 'is-active' : ''}`}
                onClick={() => setVariable(v)}
              >
                {labelFor(v)}
              </button>
            ))}
          </div>
          <div className="station-modal-range">
            {[10, 30, 90].map((d) => (
              <button
                key={d}
                type="button"
                className={`range-chip ${d === days ? 'is-active' : ''}`}
                onClick={() => setDays(d)}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        <div className="station-modal-body">
          {!station.variables.length && (
            <p className="station-modal-empty">
              This station has reported no variables in the last 90 days.
            </p>
          )}
          {loading && <p className="station-modal-empty">Loading…</p>}
          {error && <p className="station-modal-empty station-modal-error">{error}</p>}
          {!loading && !error && series && !chart && (
            <p className="station-modal-empty">
              No readings for {labelFor(variable)} in the last {days} days.
            </p>
          )}
          {!loading && !error && chart && (
            <>
              <div className="station-modal-chart">
                <Line data={chart.data} options={chart.options} />
              </div>
              <dl className="station-modal-stats">
                <div><dt>Points</dt><dd>{series.point_count.toLocaleString()}</dd></div>
                <div><dt>Min</dt><dd>{series.min_value}</dd></div>
                <div><dt>Max</dt><dd>{series.max_value}</dd></div>
                <div><dt>Mean</dt><dd>{series.avg_value}</dd></div>
                <div><dt>Latest</dt><dd>{series.latest_value}</dd></div>
              </dl>
            </>
          )}
        </div>

        <div className="station-modal-zone">
          <div className="station-zone-head">
            <h3>Climate zone</h3>
            <span className="station-zone-contributes">
              {hasTemp
                ? `contributes ${[
                    hasTemp && 'temperature',
                    hasRh && 'humidity',
                    hasRain && 'rainfall',
                  ].filter(Boolean).join(', ')}`
                : 'no thermometer — cannot be scored'}
            </span>
          </div>

          <p className="station-zone-note">
            {/* Membership is this field, not geography. The hourly rollup walks
                weather_stations.zone_id and never tests containment, so a
                station sitting inside a boundary counts for nothing until it
                is assigned here. */}
            Disease pressure reads a zone's stations from this field. A station
            inside a zone's boundary contributes nothing until it is set.
          </p>

          <div className="station-zone-form">
            <select
              value={zoneId}
              onChange={(e) => setZoneId(e.target.value === '' ? '' : Number(e.target.value))}
              aria-label="Climate zone"
              disabled={saving}
            >
              <option value="">— unassigned —</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>{z.name}</option>
              ))}
            </select>
            <button
              type="button"
              className="station-zone-save"
              disabled={saving || zoneId === (station.zone_id ?? '')}
              onClick={saveZone}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>

          {saveError && <p className="station-zone-error">{saveError}</p>}
          {saveResult && (
            <p className={`station-zone-result ${saveResult.disease_usable ? 'is-ok' : 'is-warn'}`}>
              {saveResult.zone_id
                ? `Assigned to ${saveResult.zone_name}.`
                : 'Assignment cleared.'}
              {saveResult.zone_id && !saveResult.disease_usable && (
                ' This station reports no temperature, so it adds no scoreable'
                + ' hour on its own — every model is driven by temperature, and'
                + ' an hour without it is skipped.'
              )}
              {saveResult.zone_id && saveResult.disease_usable && (
                ' It will be picked up by the next 18:00 rollup, for the days'
                + ' inside its lookback. Earlier days need hourly_aggregation'
                + ' re-run over that range — assigning does not backfill.'
              )}
            </p>
          )}
        </div>

        <footer className="station-modal-footer">
          <span className="station-modal-code">{station.station_code}</span>
          <Link to={`/admin/weather/${station.station_id}`} className="station-modal-link">
            Full station detail <ExternalLink size={14} />
          </Link>
        </footer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Map page
// ---------------------------------------------------------------------------

export default function StationMap() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const stationsRef = useRef([]);

  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [selected, setSelected] = useState(null);

  const [variable, setVariable] = useState('');
  const [source, setSource] = useState('');
  const [region, setRegion] = useState('');
  // '' = every station, UNASSIGNED = the ones no zone can see, or a zone id.
  const [zone, setZone] = useState('');
  const [search, setSearch] = useState('');
  const [statuses, setStatuses] = useState(() => new Set(STATUS_ORDER));

  // The server reuses a telemetry bundle for 60s, so an explicit Refresh has to
  // say so or the button would appear to do nothing.
  const load = useCallback((refresh = false) => {
    setLoading(true);
    setError(null);
    adminService.weather
      .getStationMap({ refresh })
      .then(setPayload)
      .catch((err) => setError(err?.response?.data?.detail || 'Could not load stations.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!payload) return [];
    const term = search.trim().toLowerCase();
    return payload.stations.filter((s) => {
      if (!statuses.has(s.status)) return false;
      if (variable && !s.variables.includes(variable)) return false;
      if (source && s.data_source !== source) return false;
      if (region && s.region !== region) return false;
      // UNASSIGNED is the point of this filter, not an afterthought: a station
      // with no zone_id is invisible to every zone rollup and therefore to all
      // three disease models, however good its data is.
      if (zone === UNASSIGNED && s.zone_id != null) return false;
      if (zone && zone !== UNASSIGNED && s.zone_id !== Number(zone)) return false;
      if (term) {
        const haystack = `${s.station_code} ${s.station_name || ''}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [payload, statuses, variable, source, region, zone, search]);

  // Keep the ref in step so the map's click handler — bound once — always sees
  // the current result set without being torn down and rebound on every filter.
  useEffect(() => { stationsRef.current = filtered; }, [filtered]);

  // Initialise the map once.
  useEffect(() => {
    if (map.current || !mapContainer.current || !mapboxgl.accessToken) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      bounds: NZ_BOUNDS,
      fitBoundsOptions: { padding: 40 },
    });

    map.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    map.current.addControl(new mapboxgl.ScaleControl({ maxWidth: 100 }), 'bottom-left');

    map.current.on('load', () => {
      map.current.addSource('stations', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.current.addLayer({
        id: 'station-circles',
        type: 'circle',
        source: 'stations',
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            4, 3.5,
            8, 6,
            12, 9,
          ],
          'circle-color': [
            'match', ['get', 'status'],
            'healthy', STATUS_COLORS.healthy,
            'stale', STATUS_COLORS.stale,
            'offline', STATUS_COLORS.offline,
            '#9ca3af',
          ],
          'circle-stroke-width': 1,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.9,
        },
      });

      map.current.on('click', 'station-circles', (e) => {
        const id = e.features?.[0]?.properties?.station_id;
        const hit = stationsRef.current.find((s) => s.station_id === id);
        if (hit) setSelected(hit);
      });

      map.current.on('mouseenter', 'station-circles', () => {
        map.current.getCanvas().style.cursor = 'pointer';
      });
      map.current.on('mouseleave', 'station-circles', () => {
        map.current.getCanvas().style.cursor = '';
      });

      setMapReady(true);
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Push the filtered set into the map whenever it changes.
  useEffect(() => {
    if (!mapReady || !map.current) return;
    const src = map.current.getSource('stations');
    if (!src) return;

    src.setData({
      type: 'FeatureCollection',
      features: filtered.map((s) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [s.longitude, s.latitude] },
        properties: { station_id: s.station_id, status: s.status },
      })),
    });
  }, [filtered, mapReady]);

  const toggleStatus = (value) => {
    setStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value); else next.add(value);
      return next;
    });
  };

  const resetFilters = () => {
    setVariable('');
    setSource('');
    setRegion('');
    setZone('');
    setSearch('');
    setStatuses(new Set(STATUS_ORDER));
  };

  const visibleCounts = useMemo(() => {
    const counts = { healthy: 0, stale: 0, offline: 0 };
    filtered.forEach((s) => { counts[s.status] = (counts[s.status] || 0) + 1; });
    return counts;
  }, [filtered]);

  const hasFilters = Boolean(variable || source || region || zone || search)
    || statuses.size !== STATUS_ORDER.length;

  // Patch the one station in place rather than refetching. The payload is ~900
  // rows behind a 60s server-side cache, so a reload after every assignment
  // would either blank the map mid-edit or hand back the pre-edit value.
  const applyAssignment = useCallback((stationId, zoneId, zoneName) => {
    setPayload((prev) => {
      if (!prev) return prev;
      const stations = prev.stations.map((s) => (
        s.station_id === stationId ? { ...s, zone_id: zoneId, zone_name: zoneName } : s
      ));
      const unassigned_count = stations.filter(
        (s) => s.zone_id == null).length;
      return { ...prev, stations, unassigned_count };
    });
    setSelected((prev) => (
      prev && prev.station_id === stationId
        ? { ...prev, zone_id: zoneId, zone_name: zoneName }
        : prev
    ));
  }, []);

  return (
    <AdminLayout title="Station Map" backLink="/admin/weather">
      <div className="admin-page station-map-page">
        <div className="station-map-toolbar">
          <div className="station-map-filters">
            <label className="station-map-search">
              <Search size={14} />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or code"
                aria-label="Search stations"
              />
            </label>

            <select value={variable} onChange={(e) => setVariable(e.target.value)} aria-label="Measurement">
              <option value="">All measurements</option>
              {payload?.variables.map((v) => (
                <option key={v} value={v}>{labelFor(v)}</option>
              ))}
            </select>

            <select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Data source">
              <option value="">All sources</option>
              {payload?.sources.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>

            <select value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Region">
              <option value="">All regions</option>
              {payload?.regions.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>

            {/* Climate zone is NOT the same thing as `region` above. `region` is
                free text off the source feed; this is the wine climate zone the
                disease models actually resolve their stations through. */}
            <select value={zone} onChange={(e) => setZone(e.target.value)} aria-label="Climate zone">
              <option value="">All zones</option>
              <option value={UNASSIGNED}>
                — unassigned{payload ? ` (${payload.unassigned_count.toLocaleString()})` : ''} —
              </option>
              {payload?.zones?.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>

            <div className="station-map-statuses">
              {STATUS_ORDER.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={statuses.has(s)}
                  className={`status-toggle status-toggle-${s} ${statuses.has(s) ? 'is-on' : ''}`}
                  onClick={() => toggleStatus(s)}
                >
                  <span className="status-dot" style={{ backgroundColor: STATUS_COLORS[s] }} />
                  {s} <strong>{visibleCounts[s] || 0}</strong>
                </button>
              ))}
            </div>

            {hasFilters && (
              <button type="button" className="station-map-reset" onClick={resetFilters}>
                Clear
              </button>
            )}
          </div>

          <div className="station-map-actions">
            <span className="station-map-count">
              <MapPin size={14} />
              {filtered.length.toLocaleString()}
              {payload ? ` of ${payload.total.toLocaleString()}` : ''}
            </span>
            <button
              type="button"
              className="station-map-refresh"
              onClick={() => load(true)}
              disabled={loading}
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {!mapboxgl.accessToken && (
          <p className="station-map-notice">
            <AlertTriangle size={16} />
            No Mapbox token. Set <code>VITE_MAPBOX_TOKEN</code> to render the map.
          </p>
        )}
        {error && (
          <p className="station-map-notice station-map-error">
            <AlertTriangle size={16} /> {error}
          </p>
        )}

        <div className="station-map-shell">
          <div ref={mapContainer} className="station-map-canvas" />
          {loading && <div className="station-map-loading">Loading stations…</div>}
          {!loading && payload && filtered.length === 0 && (
            <div className="station-map-loading">No stations match these filters.</div>
          )}
        </div>

        <p className="station-map-hint">
          Click a station for its recent readings. Colour is ingestion health, not
          data quality. Variables reflect the last 90 days.
        </p>
      </div>

      {selected && (
        <StationChartModal
          station={selected}
          zones={payload?.zones || []}
          onAssigned={applyAssignment}
          onClose={() => setSelected(null)}
        />
      )}
    </AdminLayout>
  );
}
