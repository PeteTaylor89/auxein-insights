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
import PropertyClimateDashboard from './PropertyClimateDashboard';
import PropertyDiseaseDetail from './PropertyDiseaseDetail';
import './ThisSeasonPanel.css';

const SECTIONS = [
  { key: 'weather', label: 'Weather', Icon: CloudSun },
  { key: 'disease', label: 'Disease', Icon: ShieldCheck },
  { key: 'phenology', label: 'Phenology', Icon: Grape },
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

// Weather is now the property's own record and nothing else.
//
// This used to open on four REGIONAL tiles and a table of the last completed
// season, with the property's own dashboard below them — three summaries of the
// same season before the reader reached a chart. Pete, 2026-09-23: drop the
// tiles, lead with the season in progress.
//
// THE REGIONAL FALLBACK SURVIVES, for the case that needs it. A property with
// no climate site has nothing of its own to show, and the regional figures need
// no setup at all — so they still render, but only then, and labelled. Without
// that, switching to a property that has not been set up would leave the tab
// empty of everything except an instruction.
function WeatherSection({ data }) {
  const regional = data.season?.regional;
  const hasSite = Boolean(data.site?.is_ready);
  const s = regional?.season;

  return (
    <div className="gs-panel">
      {!hasSite && s && (
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

      {!hasSite && !s && (
        <p className="gs-reason">{data.season?.reason || data.zone_reason}</p>
      )}

      {/* The season in progress at this property's own cell, the season just
          finished at its region, and what the cell usually does — chosen by
          pills inside, each labelled with its own scale. */}
      <PropertyClimateDashboard
        propertyId={data.property_id}
        propertyName={data.property_name}
      />
    </div>
  );
}

// Disease is the models' own curves now — Pete, 2026-09-23: "can we only do
// the graphs for disease pressures".
//
// Gone: the three risk badges and the 14-day colour strip. Both said the same
// thing as the charts in a coarser vocabulary — a strip of green squares is a
// banded index with the numbers taken out — and the strip in particular invited
// reading a run of colours as a trend when the underlying indices had barely
// moved. What is kept from the old panel is the humidity caveat, which the
// charts cannot say for themselves, and the scope tag.
function DiseaseSection({ data }) {
  const d = data.disease || {};
  const active = d.site || d.regional;

  return (
    <div className="gs-panel">
      {/* The caveat rides above the charts rather than inside one: it applies
          to every model on the tab, and botrytis in particular is a wetness
          model that cannot see what it is missing. */}
      {active && active.humidity_available === false && (
        <p className="gs-reason">
          <strong>No humidity data for this period.</strong> The mildew and
          botrytis models are wetness-driven, so these read low more often than
          they should.
        </p>
      )}

      {!active && (
        <p className="gs-reason">{d.reason || data.zone_reason}</p>
      )}

      <PropertyDiseaseDetail propertyId={data.property_id} />
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
