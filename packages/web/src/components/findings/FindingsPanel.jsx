// src/components/findings/FindingsPanel.jsx
/**
 * The Biosecurity and Pests & Diseases reports on Insights — one component,
 * `kind` choosing which. The server decides which report an organism belongs
 * to (`services/pest_catalog.py`): an exotic recorded on a pest/disease form
 * shows under Biosecurity, not here twice.
 *
 * Each finding can be raised as a risk or turned into a management task; a
 * biosecurity finding can also be logged as an incident. The create forms are
 * the ordinary ones, prefilled; they write the spot id back (risk/incident
 * `custom_fields`, a task link), so the finding shows what has been raised
 * from it next time.
 *
 * Property scope comes from the page's property picker. The period is chosen
 * here and defaults to the last twelve months.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { AlertTriangle, ShieldAlert, ClipboardList, Siren, MapPin, Camera } from 'lucide-react';
import { reportService, useAuth } from '@vineyard/shared';
import {
  Stat, StatGrid, Pill, LoadingBlock, ErrorBlock, fmtDate, fmtNum,
} from '../reports/ReportPrimitives';
import '../../pages/Reports.css';
import './FindingsPanel.css';

mapboxgl.accessToken = 'pk.eyJ1IjoicGV0ZXRheWxvciIsImEiOiJjbTRtaHNxcHAwZDZ4MmxwbjZkeXNneTZnIn0.RJ9B3Q3-t_-gFrEkgshH9Q';

// MPI's exotic pest and disease line.
const MPI_HOTLINE = '0800 80 99 66';

const KINDS = {
  biosecurity: {
    label: 'biosecurity',
    load: (s, e, p) => reportService.getBiosecuritySummary(s, e, p),
    riskCategory: 'biosecurity',
    tag: 'biosecurity',
    incidents: true,
    titlePrefix: 'Biosecurity',
  },
  pest_disease: {
    label: 'pests & diseases',
    load: (s, e, p) => reportService.getPestDiseaseSummary(s, e, p),
    riskCategory: 'pests_diseases',
    tag: 'pest_disease',
    incidents: false,
    titlePrefix: 'Pest/disease',
  },
};

const PERIODS = [
  { key: '90', label: '90 days', days: 90 },
  { key: '365', label: '12 months', days: 365 },
  { key: 'all', label: 'All', days: null },
];

const CLASSES = [
  { key: null, label: 'All' },
  { key: 'pest', label: 'Pests' },
  { key: 'disease', label: 'Diseases' },
];

// A finding nothing has been raised from yet is the one to look at.
const OPEN_COLOUR = '#dc2626';
const ACTIONED_COLOUR = '#28a745';

const isoDaysAgo = (days) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString('en-CA'); // YYYY-MM-DD, local
};

// `datetime-local` wants local wall-clock time with no zone.
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const isActioned = (f) => f.risks.length > 0 || f.incidents.length > 0 || f.tasks.length > 0;
const mustReport = (f) => f.notify_regulator || f.report_to === 'mpi';
const whereText = (f) => [f.block_name, f.property_name].filter(Boolean).join(', ');

const REPORT_TO = { mpi: 'Report to MPI', council: 'Report to council' };

// The finding in words, for the description of whatever is raised from it.
const describe = (f) => [
  `${f.organism_label} recorded on ${fmtDate(f.observed_at)}${f.observer ? ` by ${f.observer}` : ''}.`,
  whereText(f) && `Location: ${whereText(f)}.`,
  f.severity != null && `Severity: ${fmtNum(f.severity)}.`,
  f.incidence != null && `Incidence: ${fmtNum(f.incidence)}%.`,
  f.count != null && `Count: ${fmtNum(f.count, 0)}.`,
  f.pathway && `Pathway/source: ${f.pathway}.`,
  f.containment && `Containment taken: ${f.containment}.`,
  f.report_to === 'mpi' && `Report to MPI, ${MPI_HOTLINE}.`,
  f.report_to === 'council' && 'Report to the regional council.',
  f.notify_regulator && f.report_to !== 'mpi' && 'Flagged for regulator notification.',
  f.notes,
  `From observation run "${f.run_name}".`,
].filter(Boolean).join('\n');

const pointOf = (f) => (f.lat != null && f.lng != null
  ? { type: 'Point', coordinates: [f.lng, f.lat] }
  : null);

const sourceOf = (f, kind) => ({
  observation_spot_id: f.spot_id, observation_run_id: f.run_id, source: `${kind}_report`,
});

function FindingsMap({ findings, blocks, selectedId, onSelect }) {
  const container = useRef(null);
  const map = useRef(null);
  const [ready, setReady] = useState(false);

  const points = useMemo(() => ({
    type: 'FeatureCollection',
    features: findings.filter((f) => f.lat != null).map((f) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [f.lng, f.lat] },
      properties: { spot_id: f.spot_id, actioned: isActioned(f) ? 1 : 0 },
    })),
  }), [findings]);

  useEffect(() => {
    if (!container.current || map.current) return undefined;
    const m = new mapboxgl.Map({
      container: container.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: [172.6148, -43.5272],
      zoom: 6,
    });
    m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    m.on('load', () => {
      m.addSource('fd-blocks', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({
        id: 'fd-blocks-line', type: 'line', source: 'fd-blocks',
        paint: { 'line-color': '#ffffff', 'line-width': 1.5, 'line-opacity': 0.85 },
      });
      // promoteId: feature-state (the selection ring) needs an id per feature.
      m.addSource('fd-points', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        promoteId: 'spot_id',
      });
      m.addLayer({
        id: 'fd-points-circle', type: 'circle', source: 'fd-points',
        paint: {
          'circle-radius': ['case', ['boolean', ['feature-state', 'selected'], false], 10, 7],
          'circle-color': ['case', ['==', ['get', 'actioned'], 1], ACTIONED_COLOUR, OPEN_COLOUR],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });
      m.on('click', 'fd-points-circle', (e) => {
        const id = e.features?.[0]?.properties?.spot_id;
        if (id != null) onSelect(Number(id));
      });
      m.on('mouseenter', 'fd-points-circle', () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', 'fd-points-circle', () => { m.getCanvas().style.cursor = ''; });
      setReady(true);
    });
    map.current = m;
    return () => { m.remove(); map.current = null; };
    // onSelect is a stable callback from the parent.
  }, [onSelect]);

  // Data, and a view that fits it.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    m.getSource('fd-points').setData(points);
    m.getSource('fd-blocks').setData(blocks || { type: 'FeatureCollection', features: [] });
    const bounds = new mapboxgl.LngLatBounds();
    points.features.forEach((f) => bounds.extend(f.geometry.coordinates));
    (blocks?.features || []).forEach((f) => {
      const walk = (c) => (typeof c[0] === 'number' ? bounds.extend(c) : c.forEach(walk));
      if (f.geometry?.coordinates) walk(f.geometry.coordinates);
    });
    if (!bounds.isEmpty()) m.fitBounds(bounds, { padding: 48, maxZoom: 17, duration: 0 });
  }, [ready, points, blocks]);

  // Selection ring.
  const previous = useRef(null);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    if (previous.current != null) {
      m.setFeatureState({ source: 'fd-points', id: previous.current }, { selected: false });
    }
    if (selectedId != null) {
      m.setFeatureState({ source: 'fd-points', id: selectedId }, { selected: true });
      const f = points.features.find((p) => p.properties.spot_id === selectedId);
      if (f) m.easeTo({ center: f.geometry.coordinates, duration: 400 });
    }
    previous.current = selectedId;
  }, [ready, selectedId, points]);

  return (
    <div className="fd-map-wrap">
      <div ref={container} className="fd-map" />
      <div className="fd-map-legend">
        <span><i style={{ background: OPEN_COLOUR }} /> Nothing raised</span>
        <span><i style={{ background: ACTIONED_COLOUR }} /> Actioned</span>
      </div>
    </div>
  );
}

export default function FindingsPanel({ kind = 'biosecurity', selectedPropertyId }) {
  const spec = KINDS[kind];
  const isBio = kind === 'biosecurity';
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const [period, setPeriod] = useState('365');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [organism, setOrganism] = useState(null); // null = all
  const [organismClass, setOrganismClass] = useState(null); // pest | disease | null
  const [selectedId, setSelectedId] = useState(null);
  const rowRefs = useRef({});

  const startDate = useMemo(() => {
    const p = PERIODS.find((x) => x.key === period);
    return p?.days ? isoDaysAgo(p.days) : null;
  }, [period]);

  const load = useCallback(() => {
    let live = true;
    setLoading(true);
    setFailed(false);
    spec.load(startDate, null, selectedPropertyId || null)
      .then((d) => { if (live) setData(d); })
      .catch(() => { if (live) { setData(null); setFailed(true); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [spec, startDate, selectedPropertyId]);

  useEffect(load, [load]);

  // A filter naming an organism the new data no longer has would empty the list.
  useEffect(() => {
    if (organism !== null && data && !data.organisms.some((o) => (o.key || '') === organism)) {
      setOrganism(null);
    }
  }, [data, organism]);

  const organisms = useMemo(() => (data?.organisms || [])
    .filter((o) => organismClass === null || o.organism_class === organismClass), [data, organismClass]);

  const findings = useMemo(() => (data?.findings || []).filter((f) => (
    (organism === null || (f.organism_key || '') === organism)
    && (organismClass === null || f.organism_class === organismClass)
  )), [data, organism, organismClass]);

  const select = useCallback((id) => {
    setSelectedId(id);
    const el = rowRefs.current[id];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);

  const canRisk = hasPermission('risks', 'create');
  const canIncident = spec.incidents && hasPermission('incidents', 'create');
  const canTask = hasPermission('tasks', 'create');

  const title = (f) => `${spec.titlePrefix}: ${f.organism_label}`.slice(0, 200);

  const raiseRisk = (f) => navigate('/risks/create', {
    state: {
      prefill: {
        form: {
          risk_title: title(f),
          risk_description: describe(f),
          risk_category: spec.riskCategory,
          risk_type: 'production',
          location_description: whereText(f).slice(0, 500),
          existing_controls: f.containment || '',
          regulatory_requirements: f.report_to === 'mpi' ? `Report to MPI, ${MPI_HOTLINE}.`
            : f.report_to === 'council' ? 'Report to the regional council.' : '',
          property_id: f.property_id ?? '',
          ...(f.block_id ? { block_id: f.block_id } : {}),
        },
        location: pointOf(f),
        custom_fields: sourceOf(f, kind),
      },
    },
  });

  const logIncident = (f) => navigate('/incidents/create', {
    state: {
      prefill: {
        form: {
          incident_title: title(f),
          incident_description: describe(f),
          incident_type: 'environmental',
          category: 'biosecurity',
          incident_date: toLocalInput(f.observed_at),
          discovered_date: toLocalInput(f.observed_at),
          location_description: (whereText(f) || 'Recorded on an observation').slice(0, 500),
          immediate_actions_taken: f.containment || '',
          photos_taken: f.photo_count > 0,
          property_id: f.property_id ?? '',
        },
        location: pointOf(f),
        custom_fields: sourceOf(f, kind),
      },
    },
  });

  const createTask = (f) => navigate('/tasks/create', {
    state: {
      prefill: {
        form: {
          title: `Manage ${f.organism_label}${f.block_name ? ` — ${f.block_name}` : ''}`.slice(0, 200),
          description: describe(f),
          task_category: f.block_id ? 'vineyard' : 'general',
          block_id: f.block_id || null,
          priority: mustReport(f) || (f.severity != null && f.severity >= 4) ? 'high' : 'medium',
          related_observation_run_id: f.run_id,
          tags: [spec.tag],
        },
        observationSpotId: f.spot_id,
        linkReason: `${kind}_finding`,
      },
    },
  });

  const showClasses = !isBio && (data?.organisms || []).some((o) => o.organism_class);

  return (
    <div className="fd">
      <div className="fd-pills" role="group" aria-label="Period">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`fd-pill${p.key === period ? ' is-active' : ''}`}
            onClick={() => setPeriod(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading && <LoadingBlock label={spec.label} />}
      {!loading && (failed || !data) && <ErrorBlock label={spec.label} onRetry={load} />}

      {!loading && data && (
        <>
          <StatGrid>
            <Stat value={data.findings_count} label="Findings" tone={isBio ? 'danger' : undefined} />
            <Stat value={data.organisms.length} label={isBio ? 'Organisms' : 'Pests & diseases'} />
            <Stat value={data.blocks_affected} label="Blocks affected" />
            <Stat value={data.clean_spots} label="Clean checks" />
            {isBio && <Stat value={data.notify_count} label="To report to MPI" tone="danger" />}
          </StatGrid>

          {isBio && data.notify_count > 0 && (
            <div className="fd-banner">
              <Siren size={16} aria-hidden="true" />
              <span>
                {data.notify_count === 1 ? 'One finding needs' : `${data.notify_count} findings need`} reporting.
                Suspected exotic pests go to MPI on <strong>{MPI_HOTLINE}</strong>.
              </span>
            </div>
          )}

          {!isBio && data.redirected > 0 && (
            <p className="fd-note">
              <ShieldAlert size={14} aria-hidden="true" />
              {data.redirected === 1 ? 'One record names' : `${data.redirected} records name`} an exotic
              organism and {data.redirected === 1 ? 'is' : 'are'} shown under Biosecurity.
            </p>
          )}

          {data.warnings.map((w) => (
            <p key={w} className="fd-note"><AlertTriangle size={14} aria-hidden="true" /> {w}</p>
          ))}

          {data.findings_count === 0 ? (
            <p className="fd-empty">
              {data.total_spots > 0
                ? `${data.total_spots} check${data.total_spots === 1 ? '' : 's'} in this period, nothing found.`
                : `No ${spec.label} observations in this period.`}
            </p>
          ) : (
            <>
              <FindingsMap
                findings={findings}
                blocks={data.blocks}
                selectedId={selectedId}
                onSelect={select}
              />

              <div className="fd-heading-row">
                <h4 className="fd-heading">{isBio ? 'Organisms found' : 'Pests & diseases found'}</h4>
                {showClasses && (
                  <div className="fd-pills" role="group" aria-label="Type">
                    {CLASSES.map((c) => (
                      <button
                        key={c.label}
                        type="button"
                        className={`fd-pill fd-pill--small${organismClass === c.key ? ' is-active' : ''}`}
                        onClick={() => { setOrganismClass(c.key); setOrganism(null); }}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="fd-organisms">
                {organisms.map((o) => {
                  const key = o.key || '';
                  return (
                    <button
                      key={key || '_unnamed'}
                      type="button"
                      className={`fd-organism${organism === key ? ' is-active' : ''}`}
                      onClick={() => setOrganism(organism === key ? null : key)}
                    >
                      <span className="fd-organism-name">
                        {(o.notify || o.report_to === 'mpi') && <Siren size={13} aria-label="Report to MPI" />}
                        {o.label}
                      </span>
                      <span className="fd-organism-meta">
                        {o.findings} finding{o.findings === 1 ? '' : 's'}
                        {' · '}{o.blocks} block{o.blocks === 1 ? '' : 's'}
                        {' · last '}{fmtDate(o.last_seen)}
                      </span>
                      {(o.severity_mean != null || o.incidence_mean != null) && (
                        <span className="fd-organism-meta">
                          {o.severity_mean != null && `Severity ${fmtNum(o.severity_mean)} avg, ${fmtNum(o.severity_max)} max`}
                          {o.severity_mean != null && o.incidence_mean != null && ' · '}
                          {o.incidence_mean != null && `Incidence ${fmtNum(o.incidence_mean)}%`}
                        </span>
                      )}
                      <span className="fd-organism-meta">
                        {o.findings - o.actioned > 0 ? `${o.findings - o.actioned} open` : 'All actioned'}
                        {o.report_to && ` · ${REPORT_TO[o.report_to]}`}
                      </span>
                    </button>
                  );
                })}
              </div>

              <h4 className="fd-heading">Findings</h4>
              <ul className="fd-findings">
                {findings.map((f) => (
                  <li
                    key={f.spot_id}
                    ref={(el) => { rowRefs.current[f.spot_id] = el; }}
                    className={`fd-finding${f.spot_id === selectedId ? ' is-selected' : ''}`}
                  >
                    <button
                      type="button"
                      className="fd-finding-head"
                      onClick={() => setSelectedId(f.spot_id)}
                      disabled={f.lat == null}
                      title={f.lat == null ? 'No GPS for this spot' : 'Show on map'}
                    >
                      <span className="fd-finding-title">
                        {mustReport(f) && <Siren size={14} aria-label="Report to MPI" />}
                        {f.organism_label}
                        {f.report_to && <Pill tone={f.report_to === 'mpi' ? 'danger' : 'warning'}>{REPORT_TO[f.report_to]}</Pill>}
                      </span>
                      <span className="fd-finding-meta">
                        {fmtDate(f.observed_at)}
                        {whereText(f) && <> · <MapPin size={12} aria-hidden="true" /> {whereText(f)}</>}
                        {f.observer && <> · {f.observer}</>}
                        {f.photo_count > 0 && <> · <Camera size={12} aria-hidden="true" /> {f.photo_count}</>}
                      </span>
                    </button>

                    {(f.severity != null || f.incidence != null || f.count != null
                      || f.pathway || f.containment || f.notes) && (
                      <dl className="fd-finding-detail">
                        {f.severity != null && (<><dt>Severity</dt><dd>{fmtNum(f.severity)}</dd></>)}
                        {f.incidence != null && (<><dt>Incidence</dt><dd>{fmtNum(f.incidence)}%</dd></>)}
                        {f.count != null && (<><dt>Count</dt><dd>{fmtNum(f.count, 0)}</dd></>)}
                        {f.pathway && (<><dt>Pathway</dt><dd>{f.pathway}</dd></>)}
                        {f.containment && (<><dt>Containment</dt><dd>{f.containment}</dd></>)}
                        {f.notes && (<><dt>Notes</dt><dd>{f.notes}</dd></>)}
                      </dl>
                    )}

                    {isActioned(f) && (
                      <div className="fd-raised">
                        {f.risks.map((r) => (
                          <Pill key={`r${r.id}`} tone="warning">Risk · {r.title}</Pill>
                        ))}
                        {f.incidents.map((i) => (
                          <Pill key={`i${i.id}`} tone="danger">Incident {i.number}</Pill>
                        ))}
                        {f.tasks.map((t) => (
                          <button
                            key={`t${t.id}`}
                            type="button"
                            className="fd-task-link"
                            onClick={() => navigate(`/tasks/${t.id}`)}
                          >
                            <Pill tone="success">Task · {t.title} ({String(t.status).replace(/_/g, ' ')})</Pill>
                          </button>
                        ))}
                      </div>
                    )}

                    {(canRisk || canIncident || canTask) && (
                      <div className="fd-actions">
                        {canRisk && (
                          <button type="button" className="fd-action" onClick={() => raiseRisk(f)}>
                            <ShieldAlert size={14} aria-hidden="true" /> Raise risk
                          </button>
                        )}
                        {canIncident && (
                          <button type="button" className="fd-action" onClick={() => logIncident(f)}>
                            <AlertTriangle size={14} aria-hidden="true" /> Log incident
                          </button>
                        )}
                        {canTask && (
                          <button type="button" className="fd-action" onClick={() => createTask(f)}>
                            <ClipboardList size={14} aria-hidden="true" /> Create task
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
