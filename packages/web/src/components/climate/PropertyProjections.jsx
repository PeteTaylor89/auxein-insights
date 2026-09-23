// components/climate/PropertyProjections.jsx — this property's projected climate.
//
// Fills the "Climate Projections" pill, which has been in the pill row with no
// switch case behind it: clicking it highlighted the pill and rendered nothing.
// Ported from the Insights Pro page's ProjectionsPanel on 2026-09-23, same
// payload, same rules.
//
// ## The number on the cell is the DELTA, not the projected absolute
//
// `delta = projected - baseline`, both read from the same raster family at the
// same cell. That is what makes it the change MfE published rather than an
// artefact of two different baselines. The absolute is on the cell's tooltip,
// because "will I still be able to grow pinot here" is a question about the
// absolute and "how much is this moving" is a question about the change — the
// change is the headline, the absolute is one hover away.
//
// ## A missing cell is missing, never zero
//
// `wl3` is published for ssp3-7.0 alone, so the warming-level grid is genuinely
// ragged. An absent combination renders hatched with a dash. Filling it with
// 0.0 would read as "no change projected", which is the opposite of the truth.
//
// ## Horizons and warming levels are separate views
//
// Not one grid with six columns. A warming level says "when the world reaches
// +2 degC", not "in the 2050s", and interleaving them invites a reader to
// compare a date against a temperature.
import { Fragment, useEffect, useMemo, useState } from 'react';
import { ArrowRight, LineChart, Loader, AlertTriangle, Info, MapPin } from 'lucide-react';
import { propertyService } from '@vineyard/shared';
import './PropertyProjections.css';

// The three emissions pathways, least to most. Labels carry the shorthand
// growers hear in the trade press, because "ssp245" means nothing outside a
// modelling group.
const SCENARIOS = [
  { key: 'ssp126', label: 'ssp1-2.6', detail: 'Strong mitigation' },
  { key: 'ssp245', label: 'ssp2-4.5', detail: 'Middle of the road' },
  { key: 'ssp370', label: 'ssp3-7.0', detail: 'High emissions' },
];

const HORIZONS = [
  { key: 'fp2021-2040', label: '2021-2040', note: 'Now' },
  { key: 'fp2041-2060', label: '2041-2060', note: 'A vine planted today' },
  { key: 'fp2080-2099', label: '2080-2099', note: 'End of century' },
];

const WARMING = [
  { key: 'wl1.5', label: '+1.5 °C', note: 'Global warming level' },
  { key: 'wl2', label: '+2 °C', note: 'Global warming level' },
  { key: 'wl3', label: '+3 °C', note: 'ssp3-7.0 only' },
];

// (variable, statistic) -> what a grower calls it. Keyed as a pair because
// `temp_max` alone is three different products depending on the statistic.
const BANDS = [
  { v: 'temp_mean', s: 'mean', label: 'Mean temperature', dp: 1 },
  { v: 'gdd10', s: 'cumulative', label: 'Growing degree days', dp: 0 },
  { v: 'temp_max', s: 'mean', label: 'Mean daily max', dp: 1 },
  { v: 'temp_min', s: 'mean', label: 'Mean daily min', dp: 1 },
  { v: 'temp_min', s: 'frost_days', label: 'Frost days', dp: 1 },
  { v: 'temp_max', s: 'days_over_25', label: 'Days over 25', dp: 1 },
  { v: 'temp_max', s: 'days_over_30', label: 'Days over 30', dp: 1 },
  { v: 'rainfall', s: 'sum', label: 'Rainfall', dp: 0 },
];

const SEASON_LABEL = {
  ANN: 'Whole year',
  SEPAPR: 'Growing season',
  DJF: 'Summer',
  MAM: 'Autumn',
  JJA: 'Winter',
  SON: 'Spring',
};

const bandKey = (v, s) => `${v}.${s}`;

const fmt = (value, dp) => {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return `${n > 0 ? '+' : ''}${n.toFixed(dp)}`;
};

// Direction only, never magnitude. One scale across bands would have to span
// 3 °C and 300 mm, and a colour meaning "a lot" for one would mean "nothing"
// for the other. Nothing here implies good or bad either: more rain is a
// problem in Marlborough and a relief in Central Otago.
const toneOf = (delta) => {
  if (delta === null || delta === undefined) return 'none';
  if (delta > 0) return 'up';
  if (delta < 0) return 'down';
  return 'flat';
};

/** The region's own projections page, carrying the Grow session across. */
function regionUrl(zone) {
  const base = import.meta.env.VITE_INSIGHTS_URL || 'https://insights.auxein.co.nz';
  const country = zone.country || 'nz';
  const industry = zone.industry || 'wine';
  // The SSO fragment must come LAST: the Insights SPA reads `#insights_sso=`
  // on mount and clears it. Without it a Grow user lands on a signed-out page,
  // which is the open item from the SSO work — a deep link with no token.
  const token = localStorage.getItem('accessToken');
  const path = `${base}/${country}/${industry}/${zone.slug}?view=projections`;
  return token ? `${path}#insights_sso=${token}` : path;
}

function PropertyProjections({ selectedPropertyId, selectedProperty }) {
  const [season, setSeason] = useState('ANN');
  const [band, setBand] = useState('temp_mean.mean');
  const [axis, setAxis] = useState('horizon');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedPropertyId) { setData(null); return undefined; }
    let live = true;
    setLoading(true);
    setError(null);
    propertyService.getClimateProjections(selectedPropertyId, season)
      .then((d) => { if (live) setData(d); })
      .catch(() => { if (live) setError('Could not load projections.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [selectedPropertyId, season]);

  // Index by scenario/period for the selected band. Built from the response
  // rather than assumed, so a band this site does not hold produces an empty
  // grid instead of a grid of zeroes.
  const cells = useMemo(() => {
    const out = new Map();
    for (const p of data?.points || []) {
      if (bandKey(p.variable, p.statistic) !== band) continue;
      out.set(`${p.scenario}|${p.period}`, p);
    }
    return out;
  }, [data, band]);

  // Only bands this site actually carries for this season. SEPAPR holds gdd10
  // alone, so a fixed chip row would offer seven dead buttons on that season.
  const available = useMemo(() => {
    const held = new Set((data?.points || [])
      .map((p) => bandKey(p.variable, p.statistic)));
    return BANDS.filter((b) => held.has(bandKey(b.v, b.s)));
  }, [data]);

  useEffect(() => {
    if (available.length && !available.some((b) => bandKey(b.v, b.s) === band)) {
      setBand(bandKey(available[0].v, available[0].s));
    }
  }, [available, band]);

  if (!selectedPropertyId) {
    return (
      <div className="pcj">
        <div className="pcj-intro">
          <MapPin size={16} className="pcj-intro-icon" />
          <p>
            Choose a property above. Projections are read at a property&rsquo;s own
            point, so there is no company-wide answer to show.
          </p>
        </div>
      </div>
    );
  }

  // No climate site, or one still building. The reason is the server's.
  if (data && data.available === false) {
    return (
      <div className="pcj">
        <div className="pcj-absent" role="note">
          <Info size={15} aria-hidden="true" />
          <p>{data.reason}</p>
        </div>
      </div>
    );
  }

  const columns = axis === 'horizon' ? HORIZONS : WARMING;
  const meta = BANDS.find((b) => bandKey(b.v, b.s) === band) || BANDS[0];
  const unit = cells.size ? [...cells.values()][0].unit : '';
  const seasons = data?.seasons || ['ANN'];
  const zone = data?.zone;

  return (
    <section className="pcj" aria-labelledby="pcj-heading">
      <header className="pcj-head">
        <h3 id="pcj-heading">
          <LineChart size={16} aria-hidden="true" />
          {selectedProperty?.name || 'This property'}
        </h3>
        <p className="pcj-scope">
          Change at this property&rsquo;s own point against its{' '}
          {data?.baseline_period || '1986-2005'} normal, sampled from the same
          surfaces.
        </p>
      </header>

      {data?.stale_cells?.length > 0 && (
        <p className="pcj-stale">
          <AlertTriangle size={14} aria-hidden="true" />
          Some values were read at a previous location for this property. Move
          its climate site in Manage &rarr; Weather to refresh them.
        </p>
      )}

      <div className="pcj-controls">
        <div className="pcj-chips" role="group" aria-label="Measure">
          {available.map((b) => (
            <button
              key={bandKey(b.v, b.s)}
              type="button"
              className={`pcj-chip${bandKey(b.v, b.s) === band ? ' is-active' : ''}`}
              onClick={() => setBand(bandKey(b.v, b.s))}
            >
              {b.label}
            </button>
          ))}
        </div>
        <div className="pcj-selects">
          <label>
            <span className="pcj-sronly">Season</span>
            <select value={season} onChange={(e) => setSeason(e.target.value)}>
              {seasons.map((s) => (
                <option key={s} value={s}>{SEASON_LABEL[s] || s}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="pcj-sronly">Axis</span>
            <select value={axis} onChange={(e) => setAxis(e.target.value)}>
              <option value="horizon">By time horizon</option>
              <option value="warming">By warming level</option>
            </select>
          </label>
        </div>
      </div>

      {loading && (
        <p className="pcj-loading">
          <Loader size={16} className="pcj-spin" aria-hidden="true" /> Loading…
        </p>
      )}
      {error && <p className="pcj-error">{error}</p>}

      {!loading && !error && data && (
        <>
          <div className="pcj-grid">
            <div className="pcj-corner">{unit && <small>{unit}</small>}</div>
            {columns.map((c) => (
              <div key={c.key} className="pcj-period">
                <span>{c.label}</span>
                <small>{c.note}</small>
              </div>
            ))}

            {SCENARIOS.map((s) => (
              <Fragment key={s.key}>
                <div className="pcj-scenario">
                  <span>{s.label}</span>
                  <small>{s.detail}</small>
                </div>
                {columns.map((c) => {
                  const p = cells.get(`${s.key}|${c.key}`);
                  const shown = p ? fmt(p.delta, meta.dp) : null;
                  const title = p
                    ? [
                      `${s.label}, ${c.label}`,
                      `Projected ${Number(p.projected).toFixed(meta.dp)} ${p.unit}`,
                      `Baseline ${Number(p.baseline).toFixed(meta.dp)} ${p.unit}`,
                      p.zone_delta === null || p.zone_delta === undefined
                        ? null
                        : `Region ${fmt(p.zone_delta, meta.dp)} ${p.unit}`,
                    ].filter(Boolean).join('\n')
                    : 'Not published for this scenario';
                  return (
                    <div
                      key={`${s.key}-${c.key}`}
                      className={`pcj-cell pcj-cell--${toneOf(p?.delta)}`}
                      title={title}
                    >
                      {/* A dash, never a zero. An absent combination and no
                          projected change are different facts. */}
                      <b>{shown ?? '—'}</b>
                      {p && p.zone_delta !== null && p.zone_delta !== undefined && (
                        <small>region {fmt(p.zone_delta, meta.dp)}</small>
                      )}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>

          <p className="pcj-reason">
            Each cell is the change in {meta.label.toLowerCase()} at this
            property, against its own {data?.baseline_period || '1986-2005'}{' '}
            normal. The smaller figure is the same change for the surrounding
            region — a property is not its region, but for a change signal the
            two sit very close together.
          </p>
        </>
      )}

      {zone?.regional_available && zone?.slug && (
        <p className="pcj-link">
          {/* Opens Insights signed in. `noreferrer` would strip nothing that
              matters here, but `noopener` is what stops the new tab reaching
              back into this one. */}
          <a href={regionUrl(zone)} target="_blank" rel="noopener noreferrer">
            See the full projections for {zone.name}
            <ArrowRight size={14} aria-hidden="true" />
          </a>
        </p>
      )}
    </section>
  );
}

export default PropertyProjections;
