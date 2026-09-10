// components/season/ThisSeasonPanel.jsx — what the weather has done to this
// property so far, and what it has made likely.
//
// Replaces two placeholder cards ("Current Season Climate Analysis coming
// soon...", "Disease risk analysis coming soon...") that had sat on the
// Insights page as pills of their own. Both were promising the same thing about
// the same property, so they are one tab with three sections: weather, disease,
// and the phenology panel built alongside it.
//
// ## EVERY FIGURE SAYS WHOSE IT IS
//
// A property with a climate site gets its own point. A property without one
// gets its region — which is live, current, and needs no setup. The difference
// is not cosmetic: a regional figure is an average over a zone that can span
// 60 km, and a grower acting on it needs to know that is what they are reading.
// So the scope is stated on the card, not implied by which card it is.
//
// This is also why the site upgrade is offered inline rather than hidden in
// settings — the moment somebody notices the regional caveat is the moment the
// offer is useful.
import { useState, useEffect, useCallback } from 'react';
import { CloudSun, ShieldCheck, Grape, MapPin, Info, Loader, AlertTriangle } from 'lucide-react';
import { propertyService } from '@vineyard/shared';
import PhenologyPanel from '../phenology/PhenologyPanel';
import './ThisSeasonPanel.css';

const SECTIONS = [
  { key: 'weather', label: 'Weather', Icon: CloudSun },
  { key: 'disease', label: 'Disease', Icon: ShieldCheck },
  { key: 'phenology', label: 'Phenology', Icon: Grape },
];

// Risk vocabulary as the models emit it. Ordered worst first, which is also the
// order the tones escalate.
const RISK_TONE = { high: 'danger', moderate: 'warning', low: 'ok' };
const RISK_LABEL = { high: 'High', moderate: 'Moderate', low: 'Low' };

const DISEASES = [
  { key: 'powdery_mildew_risk', label: 'Powdery mildew' },
  { key: 'downy_mildew_risk', label: 'Downy mildew' },
  { key: 'botrytis_risk', label: 'Botrytis' },
];

const fmtDate = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });
};

const num = (v, dp = 1) =>
  (v === null || v === undefined ? '—' : Number(v).toFixed(dp));

/** Says whether a figure is this property's own or its region's. */
function ScopeTag({ isSite }) {
  return (
    <span className={`gs-scope gs-scope--${isSite ? 'site' : 'region'}`}>
      {isSite ? 'This property' : 'Region'}
    </span>
  );
}

function RiskBadge({ level }) {
  const tone = RISK_TONE[level] || 'unknown';
  return (
    <span className={`gs-risk gs-risk--${tone}`}>
      {RISK_LABEL[level] || level || 'Not modelled'}
    </span>
  );
}

function WeatherSection({ data }) {
  const regional = data.season?.regional;
  const site = data.season?.site;
  const s = regional?.season;

  return (
    <div className="gs-panel">
      {!regional && !site && (
        <p className="gs-reason">{data.season?.reason || data.zone_reason}</p>
      )}

      {s && (
        <>
          <div className="gs-panel-head">
            <h4 className="gs-panel-title">
              Season {regional.label || regional.vintage_year}
            </h4>
            <ScopeTag isSite={false} />
          </div>
          <p className="gs-panel-sub">
            {s.days_into_season} day{s.days_into_season === 1 ? '' : 's'} in, from{' '}
            {fmtDate(s.season_start)}. Latest reading {fmtDate(s.latest_data_date)}.
          </p>
          <div className="gs-tiles">
            <div className="gs-tile">
              <div className="gs-tile-value">{num(s.gdd_total, 0)}</div>
              <div className="gs-tile-label">Growing degree days</div>
              {s.gdd_base && <div className="gs-tile-foot">{s.gdd_base}</div>}
            </div>
            <div className="gs-tile">
              <div className="gs-tile-value">{num(s.rainfall_total, 0)} mm</div>
              <div className="gs-tile-label">Rainfall</div>
            </div>
            <div className="gs-tile">
              <div className="gs-tile-value">{num(s.temp_mean_avg)} °C</div>
              <div className="gs-tile-label">Mean temperature</div>
            </div>
            <div className="gs-tile">
              <div className="gs-tile-value">{num(s.temp_max_avg)} °C</div>
              <div className="gs-tile-label">Mean daily maximum</div>
            </div>
          </div>
        </>
      )}

      {/* The site's own record is a DIFFERENT SEASON from the one above — the
          extracted record holds completed seasons, and the newest is 2026 while
          the live regional figure is 2027. Labelling them both "this season"
          would be two different claims under one heading. */}
      {site && (
        <div className="gs-panel">
          <div className="gs-panel-head">
            <h4 className="gs-panel-title">Season {site.vintage_year}, completed</h4>
            <ScopeTag isSite />
          </div>
          <p className="gs-panel-sub">
            This property&apos;s own point, against its own{' '}
            {site.baseline_period || '1986–2005'} normals
            {site.metrics[0]?.baseline_seasons
              ? ` (${site.metrics[0].baseline_seasons} seasons)`
              : ''}.
            {' '}Computed from this site&apos;s own record, so the comparison is
            the same place in two periods.
          </p>
          <table className="gs-table">
            <thead>
              <tr><th>Metric</th><th>This season</th><th>Baseline</th><th>Difference</th></tr>
            </thead>
            <tbody>
              {site.metrics.map((m) => (
                <tr key={m.metric}>
                  <td>{m.label}</td>
                  <td>{num(m.value)} {m.unit}</td>
                  <td>{m.baseline === null ? '—' : `${num(m.baseline)} ${m.unit}`}</td>
                  <td>
                    {m.vs_baseline === null
                      ? <span className="gs-muted" title="No baseline to compare against">—</span>
                      : `${m.vs_baseline > 0 ? '+' : ''}${num(m.vs_baseline)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!site && data.season?.site_reason && (
        <p className="gs-offer">{data.season.site_reason}</p>
      )}
    </div>
  );
}

function DiseaseSection({ data }) {
  const d = data.disease || {};
  // The site's own modelling wins when it exists; the region is the fallback,
  // and the tag says which is on screen.
  const active = d.site || d.regional;
  const isSite = !!d.site;

  if (!active) {
    return <div className="gs-panel"><p className="gs-reason">{d.reason || data.zone_reason}</p></div>;
  }

  return (
    <div className="gs-panel">
      <div className="gs-panel-head">
        <h4 className="gs-panel-title">
          Pressure to {fmtDate(active.as_of)}
        </h4>
        <ScopeTag isSite={isSite} />
      </div>
      <p className="gs-panel-sub">
        Modelled over the last {d.window_days} days
        {active.growth_stage
          ? <> at growth stage <strong>{String(active.growth_stage).replace(/_/g, ' ')}</strong></>
          : null}.
      </p>

      <div className="gs-risks">
        {DISEASES.map((disease) => (
          <div key={disease.key} className="gs-risk-row">
            <span className="gs-risk-name">{disease.label}</span>
            <RiskBadge level={active[disease.key]} />
          </div>
        ))}
      </div>

      {/* A risk level computed without a hygrometer is not the same claim as
          one computed with one — botrytis in particular is a wetness model. */}
      {!active.humidity_available && (
        <p className="gs-reason">
          <strong>No humidity data for this period.</strong> The mildew and botrytis
          models are wetness-driven, so these levels are based on temperature and
          rainfall alone and will read low more often than they should.
        </p>
      )}

      {active.series?.length > 1 && (
        <div className="gs-panel">
          <h4 className="gs-panel-title">Last {active.series.length} days</h4>
          <div className="gs-strip-wrap">
            <table className="gs-strip">
              <thead>
                <tr>
                  <th />
                  {active.series.map((row) => (
                    <th key={row.date}>{fmtDate(row.date)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[['powdery', 'Powdery'], ['downy', 'Downy'], ['botrytis', 'Botrytis']].map(([k, label]) => (
                  <tr key={k}>
                    <th scope="row">{label}</th>
                    {active.series.map((row) => (
                      <td key={row.date}>
                        <span
                          className={`gs-cell gs-cell--${RISK_TONE[row[k]] || 'unknown'}`}
                          title={`${label}: ${RISK_LABEL[row[k]] || 'not modelled'} on ${fmtDate(row.date)}`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!isSite && data.site_reason && <p className="gs-offer">{data.site_reason}</p>}
    </div>
  );
}

export default function ThisSeasonPanel({
  selectedPropertyId, selectedProperty,
  // A saved deep link to ?insight=phenology or ?insight=disease resolves to
  // this panel now, and has to open on the section it named — landing on
  // Weather would look like the link had stopped working.
  initialSection = 'weather',
}) {
  const [section, setSection] = useState(
    () => (SECTIONS.some((s) => s.key === initialSection) ? initialSection : 'weather'),
  );

  // A second link arriving while the panel is already open must still move it.
  useEffect(() => {
    if (SECTIONS.some((s) => s.key === initialSection)) setSection(initialSection);
  }, [initialSection]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    if (!selectedPropertyId) { setData(null); return; }
    setLoading(true);
    setFailed(false);
    propertyService.getPropertySeason(selectedPropertyId)
      .then(setData)
      .catch(() => { setData(null); setFailed(true); })
      .finally(() => setLoading(false));
  }, [selectedPropertyId]);

  useEffect(load, [load]);

  if (!selectedPropertyId) {
    return (
      <div className="gs">
        <div className="gs-intro">
          <MapPin size={16} className="gs-intro-icon" />
          <p className="gs-intro-text">
            Choose a property above. Conditions are reported for a place — either this
            property&apos;s own point or its climate zone — so there is no company-wide
            answer to show.
          </p>
        </div>
      </div>
    );
  }

  const site = data?.site;

  return (
    <div className="gs">
      {/* The summary header, in My Site's shape: the place, its coordinates,
          and what it is compared against. A Grow property always has a name, so
          unlike My Site this renders before a site exists — the coordinates
          line is what changes. */}
      <div className="gs-summary">
        <h2>
          <MapPin size={18} aria-hidden="true" />
          {data?.property_name || selectedProperty?.name || 'This property'}
        </h2>
        <p>
          {site
            ? <>{site.latitude.toFixed(4)}, {site.longitude.toFixed(4)}</>
            : 'No climate site — conditions are reported for the region'}
          {data?.as_of && <> · to {fmtDate(data.as_of)}</>}
        </p>
      </div>

      {/* THE THREE SITE STATES, the same three My Site has. The panel had none
          of these before: it inferred readiness from whether a track happened
          to be present, so a site that FAILED looked identical to one that had
          never been created. */}
      {site?.status === 'failed' && (
        <div className="gs-refusal" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <div>
            <p>We could not build the climate record for this property&apos;s point.</p>
            {site.status_detail && <p className="gs-detail">{site.status_detail}</p>}
            <p className="gs-detail">
              Its region&apos;s figures are shown below in the meantime.
            </p>
          </div>
        </div>
      )}

      {site?.status === 'populating' && (
        <section className="gs-waiting">
          <Loader size={22} className="gs-spin" aria-hidden="true" />
          <h2>Building the climate history for {site.label || data?.property_name}</h2>
          <p>
            We&rsquo;re reading every month from 1986 to 2023 at this property&rsquo;s point
            and working out its own normals. It usually takes a few minutes — you can
            leave this page and come back. Its region&rsquo;s figures are below in the
            meantime.
          </p>
        </section>
      )}

      <div className="gs-intro">
        <Info size={16} className="gs-intro-icon" />
        <p className="gs-intro-text">
          Weather, disease pressure and growth stage for{' '}
          <strong>{data?.property_name || selectedProperty?.name}</strong>. Each figure says
          whether it is this property&apos;s own point or its region&apos;s average — a
          regional figure can cover 60 km, which matters when you act on it.
        </p>
      </div>

      <div className="gs-chips">
        {SECTIONS.map((s) => {
          const { Icon } = s;
          return (
            <button
              key={s.key}
              className={`gs-chip${section === s.key ? ' is-active' : ''}`}
              onClick={() => setSection(s.key)}
            >
              <Icon size={14} /> {s.label}
            </button>
          );
        })}
      </div>

      {/* Phenology has its own loader and its own property call — it is the
          panel from phase 3, reused whole rather than reimplemented here. */}
      {section === 'phenology' ? (
        <PhenologyPanel
          selectedPropertyId={selectedPropertyId}
          selectedProperty={selectedProperty}
        />
      ) : loading ? (
        <p className="gs-intro-text">Loading conditions…</p>
      ) : failed ? (
        <p className="gs-intro-text">
          Could not load conditions. <button className="btn-ghost" onClick={load}>Retry</button>
        </p>
      ) : !data ? null : section === 'weather' ? (
        <WeatherSection data={data} />
      ) : (
        <DiseaseSection data={data} />
      )}
    </div>
  );
}
