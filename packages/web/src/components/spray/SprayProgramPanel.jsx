// Spray Program — list of spray-coverage events + per-event application-rate map.
import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { sprayCoverageService, blocksService } from '@vineyard/shared';
import { Droplets, AlertTriangle, RefreshCw } from 'lucide-react';
import './SprayProgram.css';

mapboxgl.accessToken = 'pk.eyJ1IjoicGV0ZXRheWxvciIsImEiOiJjbTRtaHNxcHAwZDZ4MmxwbjZkeXNneTZnIn0.RJ9B3Q3-t_-gFrEkgshH9Q';

const GRID_SOURCE = 'spray-grid';
const GRID_LAYER = 'spray-grid-fill';
const BLOCK_SOURCE = 'spray-block';
const BLOCK_LAYER = 'spray-block-outline';

// Diverging application-rate ramp keyed to the target (or avg as proxy):
// blue = under, green = on-target, amber/red = over. (Data-viz ramp — the
// blue here is intentional per the Spray Program spec, not brand chrome.)
function buildColorExpr(centre) {
  const T = centre && centre > 0 ? centre : null;
  if (!T) {
    return ['interpolate', ['linear'], ['get', 'rate_lha'],
      0, '#2c7bb6', 200, '#abd9e9', 500, '#1a9641', 800, '#fdae61', 1200, '#d7191c'];
  }
  return ['interpolate', ['linear'], ['get', 'rate_lha'],
    0, '#2c7bb6',
    0.75 * T, '#abd9e9',
    T, '#1a9641',
    1.25 * T, '#fdae61',
    1.75 * T, '#d7191c'];
}

const fmt = (v, unit = '', dp = 0) =>
  v === null || v === undefined ? '—' : `${Number(v).toFixed(dp)}${unit}`;

export default function SprayProgramPanel({ selectedPropertyId }) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const popup = useRef(null);
  const [mapReady, setMapReady] = useState(false);

  const [events, setEvents] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(null);

  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [coverage, setCoverage] = useState(null);
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [recomputing, setRecomputing] = useState(false);

  const [candidates, setCandidates] = useState([]);
  const [checkedBlocks, setCheckedBlocks] = useState(new Set());
  const [confirming, setConfirming] = useState(false);

  // --- Load the event list (re-runs when the property filter changes) ---
  const loadEvents = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const params = {};
      if (selectedPropertyId) params.property_id = selectedPropertyId;
      const data = await sprayCoverageService.listCoverages(params);
      setEvents(Array.isArray(data) ? data : []);
    } catch (e) {
      setListError('Could not load spray coverage events.');
      setEvents([]);
    } finally {
      setListLoading(false);
    }
  }, [selectedPropertyId]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  // --- Init map once ---
  useEffect(() => {
    if (map.current || !mapContainer.current) return;
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: [172.6148, -43.5272],
      zoom: 6,
    });
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.current.on('load', () => setMapReady(true));
    return () => {
      if (popup.current) { popup.current.remove(); popup.current = null; }
      if (map.current) { map.current.remove(); map.current = null; }
      setMapReady(false);
    };
  }, []);

  const loadCandidates = useCallback(async (taskId) => {
    try {
      const cands = await sprayCoverageService.getCandidates(taskId);
      const list = Array.isArray(cands) ? cands : [];
      setCandidates(list);
      setCheckedBlocks(new Set(list.filter(c => !c.already_confirmed).map(c => c.block_id)));
    } catch (e) {
      setCandidates([]);
    }
  }, []);

  // --- Fetch coverage grid for the selected event ---
  const handleSelect = useCallback(async (taskId) => {
    setSelectedTaskId(taskId);
    setCoverageLoading(true);
    setCandidates([]);
    try {
      const data = await sprayCoverageService.getCoverage(taskId);
      setCoverage(data);
      // Only origin runs have candidates — clones carry no GPS of their own.
      if (data && !data.source_task_id) loadCandidates(taskId);
    } catch (e) {
      setCoverage(null);
    } finally {
      setCoverageLoading(false);
    }
  }, [loadCandidates]);

  const toggleBlock = useCallback((blockId) => {
    setCheckedBlocks(prev => {
      const next = new Set(prev);
      next.has(blockId) ? next.delete(blockId) : next.add(blockId);
      return next;
    });
  }, []);

  const handleConfirm = useCallback(async () => {
    const ids = Array.from(checkedBlocks);
    if (!ids.length || !selectedTaskId) return;
    setConfirming(true);
    try {
      await sprayCoverageService.confirmBlocks(selectedTaskId, ids);
      await loadEvents();
      await loadCandidates(selectedTaskId);
    } catch (e) {
      /* surfaced by candidates staying put */
    } finally {
      setConfirming(false);
    }
  }, [checkedBlocks, selectedTaskId, loadEvents, loadCandidates]);

  const handleRecompute = useCallback(async () => {
    if (!selectedTaskId) return;
    setRecomputing(true);
    try {
      const data = await sprayCoverageService.recompute(selectedTaskId);
      setCoverage(data);
      loadEvents();
    } catch (e) {
      /* surfaced via empty state */
    } finally {
      setRecomputing(false);
    }
  }, [selectedTaskId, loadEvents]);

  // --- Render coverage grid + block outline on the map ---
  const clearLayers = useCallback(() => {
    const m = map.current;
    if (!m) return;
    [GRID_LAYER, BLOCK_LAYER].forEach((id) => { if (m.getLayer(id)) m.removeLayer(id); });
    [GRID_SOURCE, BLOCK_SOURCE].forEach((id) => { if (m.getSource(id)) m.removeSource(id); });
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !mapReady) return;
    clearLayers();
    if (!coverage || !coverage.grid || !coverage.grid.features?.length) return;

    const centre = coverage.stats?.avg_lha || coverage.inputs?.target_lha;

    m.addSource(GRID_SOURCE, { type: 'geojson', data: coverage.grid });
    m.addLayer({
      id: GRID_LAYER,
      type: 'fill',
      source: GRID_SOURCE,
      paint: { 'fill-color': buildColorExpr(centre), 'fill-opacity': 0.78 },
    });

    // Block boundary for context (best-effort).
    blocksService.getBlocksGeoJSON().then((bg) => {
      if (!m.getSource(GRID_SOURCE)) return; // coverage changed / unmounted
      const feat = bg?.features?.find(f => Number(f.properties?.id) === Number(coverage.block_id));
      if (feat && !m.getSource(BLOCK_SOURCE)) {
        m.addSource(BLOCK_SOURCE, { type: 'geojson', data: feat });
        m.addLayer({
          id: BLOCK_LAYER,
          type: 'line',
          source: BLOCK_SOURCE,
          paint: { 'line-color': '#ffffff', 'line-width': 2, 'line-opacity': 0.9 },
        });
      }
    }).catch(() => {});

    // Fit to the grid extent.
    const b = new mapboxgl.LngLatBounds();
    coverage.grid.features.forEach(f => {
      const ring = f.geometry?.coordinates?.[0];
      if (ring) ring.forEach(c => b.extend(c));
    });
    if (!b.isEmpty()) m.fitBounds(b, { padding: 40, maxZoom: 18, duration: 600 });

    // Hover popup with rate + passes.
    const onMove = (e) => {
      const f = e.features?.[0];
      if (!f) return;
      m.getCanvas().style.cursor = 'pointer';
      if (!popup.current) popup.current = new mapboxgl.Popup({ closeButton: false, closeOnClick: false });
      popup.current
        .setLngLat(e.lngLat)
        .setHTML(`<strong>${Number(f.properties.rate_lha).toFixed(0)} L/ha</strong><br/>${f.properties.passes} pass${f.properties.passes > 1 ? 'es' : ''}`)
        .addTo(m);
    };
    const onLeave = () => {
      m.getCanvas().style.cursor = '';
      if (popup.current) { popup.current.remove(); }
    };
    m.on('mousemove', GRID_LAYER, onMove);
    m.on('mouseleave', GRID_LAYER, onLeave);
    return () => {
      if (map.current) {
        map.current.off('mousemove', GRID_LAYER, onMove);
        map.current.off('mouseleave', GRID_LAYER, onLeave);
      }
    };
  }, [coverage, mapReady, clearLayers]);

  const s = coverage?.stats || {};
  const centre = s.avg_lha || coverage?.inputs?.target_lha;

  return (
    <div className="sp-layout">
      <div className="sp-list">
        <div className="sp-list-head">
          <Droplets size={16} />
          <span>Spray Events</span>
        </div>
        {listLoading ? (
          <div className="sp-muted">Loading…</div>
        ) : listError ? (
          <div className="sp-error"><AlertTriangle size={14} /> {listError}</div>
        ) : events.length === 0 ? (
          <div className="sp-empty">
            No spray coverage yet. Complete a GPS-tracked spray task whose sprayer has a swath width and flow-rate calibration.
          </div>
        ) : (
          <ul className="sp-events">
            {events.map(ev => (
              <li
                key={`${ev.task_id}-${ev.block_id}`}
                className={`sp-event ${selectedTaskId === ev.task_id ? 'active' : ''}`}
                onClick={() => handleSelect(ev.task_id)}
              >
                <div className="sp-event-top">
                  <span className="sp-event-block">{ev.block_name || `Block ${ev.block_id}`}</span>
                  <span className="sp-event-date">{ev.date ? new Date(ev.date).toLocaleDateString() : ''}</span>
                </div>
                <div className="sp-event-sub">
                  <span>{ev.title || ev.task_number}</span>
                  <span className="sp-event-rate">{fmt(ev.avg_lha, ' L/ha')}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="sp-map-wrap">
        <div ref={mapContainer} className="sp-map" />

        {coverageLoading && <div className="sp-map-status">Computing coverage…</div>}
        {!coverageLoading && !coverage && (
          <div className="sp-map-status">Select a spray event to view coverage</div>
        )}

        {coverage && (
          <>
            <div className="sp-stats">
              <div className="sp-stat"><label>Avg</label><b>{fmt(s.avg_lha, ' L/ha')}</b></div>
              <div className="sp-stat"><label>Range</label><b>{fmt(s.min_lha)}–{fmt(s.max_lha)}</b></div>
              <div className="sp-stat"><label>Sprayed</label><b>{fmt(s.sprayed_area_hectares, ' ha', 2)}</b></div>
              <div className="sp-stat"><label>Gaps</label><b>{fmt(s.gap_area_hectares, ' ha', 2)}</b></div>
              <div className="sp-stat"><label>Overlap</label><b>{fmt(s.overlap_area_hectares, ' ha', 2)}</b></div>
              <div className="sp-stat"><label>Volume</label><b>{fmt(s.computed_volume_l, ' L')}</b></div>
              <button className="sp-recompute" onClick={handleRecompute} disabled={recomputing} title="Recompute">
                <RefreshCw size={13} className={recomputing ? 'sp-spin' : ''} /> Recompute
              </button>
            </div>

            <div className="sp-legend">
              <div className="sp-legend-title">Application rate (L/ha){centre ? ` · centred ${Math.round(centre)}` : ''}</div>
              <div className="sp-legend-ramp" />
              <div className="sp-legend-labels"><span>Under</span><span>Target</span><span>Over</span></div>
            </div>

            {candidates.length > 0 && (
              <div className="sp-detect">
                <div className="sp-detect-head">
                  <AlertTriangle size={14} />
                  This track also covered {candidates.filter(c => !c.already_confirmed).length || candidates.length} other block{candidates.length > 1 ? 's' : ''}
                </div>
                <ul className="sp-detect-list">
                  {candidates.map(c => (
                    <li key={c.block_id} className={c.already_confirmed ? 'done' : ''}>
                      <label>
                        <input
                          type="checkbox"
                          disabled={c.already_confirmed}
                          checked={c.already_confirmed || checkedBlocks.has(c.block_id)}
                          onChange={() => toggleBlock(c.block_id)}
                        />
                        <span>{c.block_name || `Block ${c.block_id}`}</span>
                        <span className="sp-detect-area">{Number(c.covered_area_hectares).toFixed(2)} ha · {c.pct}%</span>
                        {c.already_confirmed && <span className="sp-detect-done">✓ added</span>}
                      </label>
                    </li>
                  ))}
                </ul>
                <button
                  className="sp-detect-confirm"
                  onClick={handleConfirm}
                  disabled={confirming || checkedBlocks.size === 0}
                >
                  {confirming ? 'Creating…' : `Create ${checkedBlocks.size} completed task${checkedBlocks.size === 1 ? '' : 's'}`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
