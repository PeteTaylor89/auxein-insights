// components/pro/ProjectionsPanel.jsx — this site's projected climate.
//
// Was a deliberate placeholder until 2026-08-31. Its reason for being empty was
// "there is no projection surface to sample", which stopped being true when the
// 612 projection rasters were published on 2026-08-25 and `insights_site_
// projection` began sampling them at the site's own cell.
//
// ## The number on the cell is the DELTA, not the projected absolute
//
// `delta = projected - baseline`, both read from the same raster family at the
// same cell. That is what makes it the change MfE published rather than an
// artefact of two different baselines. The absolute is on the cell's title,
// because a grower asking "will I still be able to grow pinot here" is asking
// about the absolute, and a grower asking "how much is this moving" is asking
// about the change — the change is the headline and the absolute is one hover
// away.
//
// ## A missing cell is missing, never zero
//
// `wl3` exists for ssp370 only, so the warming-level grid is genuinely ragged.
// An absent combination renders as an empty cell with a dash and a title saying
// it is not published. Filling it with 0.0 would read as "no change projected",
// which is the opposite of the truth.
//
// ## Horizons and warming levels are separate views
//
// Not one grid with six columns. A warming level is a different KIND of axis
// from a calendar period — it says "when the world reaches +2 degC", not "in
// the 2050s" — and interleaving them invites a reader to compare a date against
// a temperature. Warming levels are also where the ragged cells are.
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, LineChart, Loader, AlertTriangle } from 'lucide-react';
import { getSiteProjections } from '../../services/proSiteService';
import './ProjectionsPanel.css';
import { useCountryIndustry } from '../../contexts/CountryIndustryContext';

// The three emissions pathways, in the order a reader should meet them: least
// to most. Labels carry the shorthand growers hear in the trade press, because
// "ssp245" means nothing outside a modelling group.
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
  { key: 'wl1.5', label: '+1.5 degC', note: 'Global warming level' },
  { key: 'wl2', label: '+2 degC', note: 'Global warming level' },
  { key: 'wl3', label: '+3 degC', note: 'ssp3-7.0 only' },
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

// Direction only, never magnitude. A single scale across bands would have to
// span 3 degC and 300 mm, and a colour that means "a lot" for one band would
// mean "nothing" for another. Sign is the honest thing to encode.
const toneOf = (delta) => {
  if (delta === null || delta === undefined) return 'none';
  if (delta > 0) return 'up';
  if (delta < 0) return 'down';
  return 'flat';
};

function ProjectionsPanel({ siteId, projections }) {
  const { path } = useCountryIndustry();
  const [season, setSeason] = useState('ANN');
  const [band, setBand] = useState('temp_mean.mean');
  const [axis, setAxis] = useState('horizon');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!siteId) return undefined;
    let live = true;
    setLoading(true);
    setError(null);
    getSiteProjections(siteId, { season })
      .then((d) => { if (live) setData(d); })
      .catch((e) => {
        if (live) setError(e?.response?.data?.detail || 'Could not load projections.');
      })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [siteId, season]);

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
  // alone, so a fixed chip row would offer six dead buttons on that season.
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

  const columns = axis === 'horizon' ? HORIZONS : WARMING;
  const meta = BANDS.find((b) => bandKey(b.v, b.s) === band) || BANDS[0];
  const unit = cells.size ? [...cells.values()][0].unit : '';
  const seasons = data?.seasons || ['ANN'];

  return (
    <section className="projections" aria-labelledby="projections-heading">
      <header className="projections__head">
        <h3 id="projections-heading">
          <LineChart size={16} aria-hidden="true" />
          Climate projections
        </h3>
        <p className="projections__scope">
          Change at this site against its own {data?.baseline_period || '1986-2005'}{' '}
          normal, sampled from the same surfaces.
        </p>
      </header>

      {/* A row sampled before the site was moved describes the OLD cell. The
          numbers would look entirely reasonable, so this has to be said. */}
      {data?.stale_cells?.length > 0 && (
        <p className="projections__stale">
          <AlertTriangle size={14} aria-hidden="true" />
          Some values were read at a previous location for this site. Re-place
          the site to refresh them.
        </p>
      )}

      <div className="projections__controls">
        <div className="projections__chips" role="group" aria-label="Measure">
          {available.map((b) => (
            <button
              key={bandKey(b.v, b.s)}
              type="button"
              className={`projections__chip${bandKey(b.v, b.s) === band ? ' is-active' : ''}`}
              onClick={() => setBand(bandKey(b.v, b.s))}
            >
              {b.label}
            </button>
          ))}
        </div>
        <div className="projections__selects">
          <label>
            <span className="projections__sronly">Season</span>
            <select value={season} onChange={(e) => setSeason(e.target.value)}>
              {seasons.map((s) => (
                <option key={s} value={s}>{SEASON_LABEL[s] || s}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="projections__sronly">Axis</span>
            <select value={axis} onChange={(e) => setAxis(e.target.value)}>
              <option value="horizon">By time horizon</option>
              <option value="warming">By warming level</option>
            </select>
          </label>
        </div>
      </div>

      {loading && (
        <p className="projections__loading">
          <Loader size={16} className="spin" aria-hidden="true" /> Loading…
        </p>
      )}
      {error && <p className="projections__error">{error}</p>}

      {!loading && !error && (
        <>
          <div className="projections__grid">
            <div className="projections__corner">
              {unit && <small>{unit}</small>}
            </div>
            {columns.map((c) => (
              <div key={c.key} className="projections__period">
                <span>{c.label}</span>
                <small>{c.note}</small>
              </div>
            ))}

            {SCENARIOS.map((s) => (
              <Fragment key={s.key}>
                <div className="projections__scenario">
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
                      className={`projections__cell projections__cell--${toneOf(p?.delta)}`}
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

          <p className="projections__reason">
            Each cell is the change in {meta.label.toLowerCase()} at this site,
            against its own {data?.baseline_period || '1986-2005'} normal. The
            smaller figure is the same change for the surrounding region — a
            site is not its region, but for a change signal the two sit very
            close together.
          </p>
        </>
      )}

      {projections?.regional_available && projections?.zone_slug && (
        <p className="projections__link">
          <Link to={path(projections.zone_slug)}>
            See the full projections for {projections.zone_name}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </p>
      )}
    </section>
  );
}

export default ProjectionsPanel;
