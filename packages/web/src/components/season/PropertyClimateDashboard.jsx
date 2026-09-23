// components/season/PropertyClimateDashboard.jsx — the My Site dashboard, for a
// Grow property. Ported 2026-09-23 from the Insights Pro page's SiteDashboard.
//
// THREE BLOCKS, THREE SCALES, KEPT APART. Reading order is the order the
// questions get asked:
//
//   season_current   this season, at the property's OWN cell, against that
//                    cell's own 1986-2005 curve. Both sides are one place.
//   season_previous  the season just finished, at the REGION, from stations —
//                    a finished season is only fully recorded at station scale.
//   tiles            what this cell usually does, 1986-2023 surface archive.
//
// No number is computed across those boundaries: the server does not merge them
// and neither does this. Everything numeric arrives ready — normals, anomalies
// and trends are all server-computed, because the moment the browser starts
// summing days it can disagree with the server about which days counted. The
// only arithmetic here is the progress bar's percentage.
import { useEffect, useState } from 'react';
import {
  TrendingUp, TrendingDown, Minus, Info, Loader, Radio, Sprout,
} from 'lucide-react';
import { propertyService } from '@vineyard/shared';
import PropertySeasonProgress from './PropertySeasonProgress';
import './PropertyClimateDashboard.css';

// Day-of-year reads as a number and means a date. 288 is not a quantity any
// grower recognises; "15 Oct" is.
function doyLabel(doy) {
  if (doy == null) return '—';
  // A non-leap reference year: the metric is a climatological average day, so
  // the leap-day offset is noise against its spread.
  const d = new Date(Date.UTC(2001, 0, 1));
  d.setUTCDate(d.getUTCDate() + Math.round(doy) - 1);
  return d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function format(value, unit, digits = 1) {
  if (value == null || Number.isNaN(value)) return '—';
  if (unit === 'date') return doyLabel(value);
  if (unit === 'GDD' || unit === 'mm') return Math.round(value).toLocaleString();
  if (unit === 'nights' || unit === 'days') return value.toFixed(value < 10 ? 1 : 0);
  return value.toFixed(digits);
}

function signed(value, unit) {
  if (value == null) return null;
  // A day-of-year ANOMALY is a number of days, not a date — "+4 days later"
  // rather than "5 January". The tile's headline stays a date; only the
  // difference changes shape.
  const asDays = unit === 'date';
  const body = format(Math.abs(value), asDays ? 'days' : unit);
  return `${value >= 0 ? '+' : '−'}${body}${asDays ? ' days' : ''}`;
}

function dayLabel(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// Which way is "unusual in the direction that costs money". Only ever colour —
// the number reads identically either way.
function toneFor(anomaly, direction) {
  if (anomaly == null || direction == null || Math.abs(anomaly) < 1e-9) return 'flat';
  const worse = direction === 'up' ? anomaly < 0 : anomaly > 0;
  return worse ? 'bad' : 'good';
}

// Per-metric wording, because one generic phrase gets it WRONG rather than
// merely vague: "warmer" on a frost-nights tile says the opposite of what the
// number means.
//
// FROST IS ABSENT FROM THIS MAP ON PURPOSE. The server sends no `zone` block
// for frost metrics — our surfaces model no cold-air drainage, so a
// site-versus-neighbour frost claim is the one thing they cannot support — and
// leaving a phrase here would invite switching it back on.
const POSITION_COPY = {
  gdd10: { above: 'Warmer', below: 'Cooler' },
  tmean: { above: 'Warmer', below: 'Cooler' },
  rain: { above: 'Wetter', below: 'Drier' },
  hot_days_25: { above: 'Hotter', below: 'Cooler' },
};

const WITHIN_COPY = 'Inside the range 90% of the region sits in';

function positionCopy(metric, position) {
  if (position === 'within') return WITHIN_COPY;
  const words = POSITION_COPY[metric];
  if (!words) {
    // A metric added to the tiles without a phrase gets a true statement rather
    // than a wrong one.
    return position === 'above'
      ? 'Higher than 90% of the vineyards in this region'
      : 'Lower than 90% of the vineyards in this region';
  }
  return `${words[position]} than 90% of the vineyards in this region`;
}

function Tile({ tile }) {
  const { unit, direction } = tile;
  const tone = toneFor(tile.anomaly, direction);
  const Arrow = tone === 'flat' ? Minus : (tile.anomaly > 0 ? TrendingUp : TrendingDown);

  return (
    <article className="pcd-tile">
      <h4 className="pcd-tile-label">{tile.label}</h4>
      <p className="pcd-tile-value">
        {format(tile.normal, unit)}
        <span className="pcd-tile-unit">{unit === 'date' ? '' : ` ${unit}`}</span>
      </p>
      {/* The count under the normal is the count the NORMAL was averaged over,
          not the length of the whole series. They differ: the record runs 37
          seasons, the 1986-2005 normal is built from 19 of them. The range and
          trend below still come from all 37. */}
      <p className="pcd-tile-caption">
        typical season here · {tile.normal_years} seasons
      </p>

      <dl className="pcd-tile-rows">
        <div>
          <dt>{tile.latest.vintage}</dt>
          <dd>
            {format(tile.latest.value, unit)}
            {tile.anomaly != null && (
              <span className={`pcd-delta is-${tone}`}>
                <Arrow size={12} aria-hidden="true" />
                {signed(tile.anomaly, unit)}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt>Range</dt>
          <dd>
            {format(tile.coolest.value, unit)} – {format(tile.warmest.value, unit)}
            <span className="pcd-muted">
              {' '}({tile.coolest.vintage}–{tile.warmest.vintage})
            </span>
          </dd>
        </div>
        {tile.trend_per_decade != null && (
          <div>
            <dt>Trend</dt>
            <dd>{signed(tile.trend_per_decade, unit)} per decade</dd>
          </div>
        )}
      </dl>

      {tile.zone?.position && (
        <p className={`pcd-tile-position is-${tile.zone.position}`}>
          {positionCopy(tile.metric, tile.zone.position)}
        </p>
      )}
    </article>
  );
}

/** What a usual season looks like, shown before one is under way. */
function UsualSeason({ totals }) {
  if (!totals) return null;
  const items = [
    ['Growing degree days', totals.gdd10, 'GDD'],
    ['Rainfall', totals.rain, 'mm'],
    ['Frost nights', totals.frost_nights, 'nights'],
    ['Days over 25°C', totals.hot_days, 'days'],
  ];
  return (
    <div className="pcd-usual">
      <p className="pcd-usual-label">A usual season at this property</p>
      <dl>
        {items.map(([label, value, unit]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{format(value, unit)} <span>{unit}</span></dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function SeasonMetric({ metric }) {
  const tone = toneFor(metric.anomaly, metric.direction);
  const Arrow = tone === 'flat' ? Minus : (metric.anomaly > 0 ? TrendingUp : TrendingDown);
  return (
    <div className="pcd-metric">
      <p className="pcd-metric-label">{metric.label}</p>
      <p className="pcd-metric-value">
        {format(metric.value, metric.unit)}
        <span className="pcd-metric-unit"> {metric.unit}</span>
      </p>
      {metric.normal != null && (
        <p className="pcd-metric-normal">
          usual by now {format(metric.normal, metric.unit)}
          {metric.anomaly != null && (
            <span className={`pcd-delta is-${tone}`}>
              <Arrow size={12} aria-hidden="true" />
              {signed(metric.anomaly, metric.unit)}
            </span>
          )}
        </p>
      )}
      {/* Days USED, not days elapsed. They differ whenever the surface had a
          hole, and the difference is the honest caveat on the comparison. */}
      <p className="pcd-metric-days">
        {metric.days_used} {metric.days_used === 1 ? 'day' : 'days'}
      </p>
    </div>
  );
}

function CurrentSeason({ season, propertyId, propertyName }) {
  if (!season) return null;
  const pct = season.days_total
    ? Math.min(100, Math.max(0, (season.days_elapsed / season.days_total) * 100))
    : 0;

  const head = (
    <header className="pcd-head">
      <h4>
        <Sprout size={16} aria-hidden="true" />
        {season.vintage} season
        <span className={`pcd-state is-${season.state}`}>
          {season.state === 'not_started' ? 'not started'
            : season.state === 'complete' ? 'complete' : 'in progress'}
        </span>
      </h4>
      {season.state === 'not_started' ? (
        <p className="pcd-scope">
          Starts {dayLabel(season.from)}
          {season.starts_in_days > 0 && ` · ${season.starts_in_days} `}
          {season.starts_in_days > 0 && (season.starts_in_days === 1 ? 'day away' : 'days away')}
        </p>
      ) : (
        <>
          <p className="pcd-scope">
            Day {season.days_elapsed} of {season.days_total}
            {season.data_to && ` · measured to ${dayLabel(season.data_to)}`}
          </p>
          {/* The bar exists so a to-date number is never read as a season
              total. Two months of GDD looks like a catastrophe beside a season
              normal, and only the elapsed fraction says otherwise. */}
          <div className="pcd-progress" role="presentation">
            <span style={{ width: `${pct}%` }} />
          </div>
        </>
      )}
    </header>
  );

  if (!season.available) {
    return (
      <section className="pcd-panel pcd-panel--pending">
        {head}
        <p className="pcd-reason">
          {season.state === 'not_started'
            ? <Info size={15} aria-hidden="true" />
            : <Loader size={15} aria-hidden="true" />}
          {season.reason}
        </p>
        <UsualSeason totals={season.baseline_season_totals} />
      </section>
    );
  }

  return (
    <section className="pcd-panel">
      {head}
      <div className="pcd-metrics">
        {season.metrics.map((m) => <SeasonMetric key={m.metric} metric={m} />)}
      </div>

      {/* The metrics say how far ahead or behind the season is. The curve says
          WHEN it got that way, which is the question they always provoke. It
          fetches its own series rather than riding on this payload. */}
      <PropertySeasonProgress
        propertyId={propertyId}
        propertyName={propertyName}
        vintage={season.vintage}
      />

      <p className="pcd-note">
        <Info size={14} aria-hidden="true" />
        {season.note}
        {season.baseline && ` Normal is the ${season.baseline} average for the same days.`}
      </p>

      {/* The era difference is DISCLOSED, not corrected out of the numbers, and
          the terms are separate because they have different causes and
          different futures — one is a definition and will not move, the other
          is network density and will. */}
      {season.era?.terms?.length > 0 && (
        <details className="pcd-era">
          <summary>How this compares with the 1986-2005 record</summary>
          <p>{season.era.why}</p>
          <ul>
            {season.era.terms.map((t) => (
              <li key={t.variable}>
                <strong>
                  {t.variable} {t.offset_c >= 0 ? '+' : '−'}
                  {Math.abs(t.offset_c).toFixed(2)} °C
                </strong>{' '}
                ({t.kind}) — {t.note}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function SeasonStrip({ strip }) {
  if (!strip) return null;
  if (!strip.available) {
    return (
      <section className="pcd-panel pcd-panel--pending">
        <p className="pcd-reason"><Info size={15} aria-hidden="true" /> {strip.reason}</p>
      </section>
    );
  }

  return (
    <section className="pcd-panel">
      <header className="pcd-head">
        <h4>
          <Radio size={16} aria-hidden="true" />
          {strip.zone_name} · {strip.vintage} season
          <span className="pcd-state">{strip.complete ? 'complete' : 'in progress'}</span>
        </h4>
        {/* The scale difference is the point of this line. A grower reading a
            regional number as their own property's is the failure this panel
            exists to prevent, and layout alone cannot prevent it. */}
        <p className="pcd-scope">
          Measured at {strip.stations.min === strip.stations.max
            ? `${strip.stations.max} stations`
            : `${strip.stations.min}–${strip.stations.max} stations`}{' '}
          across the whole region — not at this property. {strip.n_days} days to{' '}
          {dayLabel(strip.through)}.
        </p>
      </header>

      <div className="pcd-metrics">
        {strip.metrics.map((m) => {
          const delta = (m.value != null && m.normal != null) ? m.value - m.normal : null;
          return (
            <div key={m.metric} className="pcd-metric">
              <p className="pcd-metric-label">{m.label}</p>
              <p className="pcd-metric-value">
                {format(m.value, m.unit)}
                <span className="pcd-metric-unit"> {m.unit}</span>
              </p>
              {m.normal != null && (
                <p className="pcd-metric-normal">
                  usual {format(m.normal, m.unit)}
                  {delta != null && <span className="pcd-muted"> ({signed(delta, m.unit)})</span>}
                  {/* The tiles below say "usual" too, for THIS PROPERTY, and
                      the numbers differ because the places differ. Naming the
                      scale on the figure itself is the only thing that stops
                      the two reading as a contradiction. */}
                  <span className="pcd-metric-scope">
                    across {strip.zone_name || 'the region'}
                    {m.normal_years ? ` · ${m.normal_years} seasons` : ''}
                  </span>
                </p>
              )}
            </div>
          );
        })}
      </div>

      <p className="pcd-note">
        <Info size={14} aria-hidden="true" />
        {strip.note}
        {strip.months_compared?.length > 0 && (
          <> Compared over {strip.months_compared.length} complete month
            {strip.months_compared.length === 1 ? '' : 's'}.</>
        )}
      </p>
    </section>
  );
}

// The three blocks are three ANSWERS, not three chapters — stacked, they ran to
// several screens and the tiles were reached by scrolling past everything else
// rather than by asking for them. One at a time, and the labels say which scale
// each one is.
const VIEWS = [
  { key: 'current', label: 'This season' },
  { key: 'previous', label: 'Last season · region' },
  { key: 'tiles', label: 'Usual here' },
];

function PropertyClimateDashboard({ propertyId, propertyName }) {
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading');
  const [view, setView] = useState('current');

  useEffect(() => {
    if (!propertyId) return undefined;
    let live = true;
    setState('loading');
    propertyService.getClimateOverview(propertyId)
      .then((d) => { if (live) { setData(d); setState('ready'); } })
      .catch(() => { if (live) setState('error'); });
    return () => { live = false; };
  }, [propertyId]);

  if (state === 'loading') {
    return (
      <p className="pcd-loading">
        <Loader size={15} className="pcd-spin" aria-hidden="true" /> Loading this
        property&rsquo;s own record…
      </p>
    );
  }
  if (state === 'error') {
    return <p className="pcd-note">Could not load this property&rsquo;s climate record.</p>;
  }
  // No climate site, or one still building. The reason is the server's, and the
  // regional panels above this one keep working without it.
  if (!data?.available) {
    return (
      <div className="pcd-absent" role="note">
        <Info size={15} aria-hidden="true" />
        <p>{data?.reason}</p>
      </div>
    );
  }

  return (
    <div className="pcd">
      <div className="pcd-views" role="group" aria-label="View">
        {VIEWS.map((v) => (
          <button key={v.key} type="button"
                  className={`pcd-view${view === v.key ? ' is-active' : ''}`}
                  onClick={() => setView(v.key)}>
            {v.label}
          </button>
        ))}
      </div>

      <p className="pcd-baseline">
        <Info size={14} aria-hidden="true" />
        <span>
          Normals below are the <strong>{data.baseline}</strong> average — the
          period the climate projections are measured from and the only one with
          a daily record, so every panel here compares against the same thing.
        </span>
      </p>

      {view === 'current' && (
        <CurrentSeason
          season={data.season_current}
          propertyId={propertyId}
          propertyName={propertyName}
        />
      )}

      {view === 'previous' && <SeasonStrip strip={data.season_previous} />}

      {view === 'tiles' && data.tiles?.length > 0 && (
        <section className="pcd-panel">
          <header className="pcd-head">
            <h4>What this property usually does</h4>
            <p className="pcd-scope">
              Its own 500 m cell, every season from 1986 to 2023. Typical values
              are the {data.baseline} average.
            </p>
          </header>
          <div className="pcd-tiles">
            {data.tiles.map((t) => <Tile key={t.metric} tile={t} />)}
          </div>
        </section>
      )}
    </div>
  );
}

export default PropertyClimateDashboard;
