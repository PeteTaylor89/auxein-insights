// components/pro/SiteDashboard.jsx — what a subscriber sees on opening a site.
//
// TWO SOURCES, KEPT APART. The tiles are this cell's own 1986-2023 record from
// the surface archive. The season strip is station data aggregated to the
// REGION, because there is no live surface yet. They are drawn as two panels
// with two headings and two source lines, and no number is ever computed across
// the boundary — the server does not merge them and neither does this.
//
// Everything numeric here is server-computed. Normals, anomalies and trends
// arrive ready; re-deriving any of them in the browser is how the site's normal
// and the chart's normal start to disagree.
import { useEffect, useState } from 'react';
import {
  TrendingUp, TrendingDown, Minus, Info, Loader, Radio,
} from 'lucide-react';
import { getSiteDashboard } from '../../services/proSiteService';
import './SiteDashboard.css';

// Day-of-year reads as a number and means a date. 288 is not a quantity of
// anything a grower recognises; "15 October" is.
function doyLabel(doy) {
  if (doy == null) return '—';
  // A non-leap reference year: the metric is a climatological average day, so
  // the exact leap-day offset is noise against its spread.
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
// the number is shown identically either way.
function toneFor(anomaly, direction) {
  if (anomaly == null || direction == null || Math.abs(anomaly) < 1e-9) return 'flat';
  const worse = direction === 'up' ? anomaly < 0 : anomaly > 0;
  return worse ? 'bad' : 'good';
}

// Per-metric wording, because one generic phrase gets it WRONG rather than
// merely vague. "Warmer / higher" on a frost-nights tile says the opposite of
// what the number means — more frost nights is colder — and on rainfall it is
// not a temperature statement at all.
const POSITION_COPY = {
  gdd10: { above: 'Warmer', below: 'Cooler' },
  tmean: { above: 'Warmer', below: 'Cooler' },
  rain: { above: 'Wetter', below: 'Drier' },
  frost_days: { above: 'More frost-prone', below: 'Less frost-prone' },
  hot_days_25: { above: 'Hotter', below: 'Cooler' },
  last_spring_frost_doy: { above: 'Frosts later', below: 'Frosts earlier' },
};

const WITHIN_COPY = 'Inside the range 90% of the region sits in';

function positionCopy(metric, position) {
  if (position === 'within') return WITHIN_COPY;
  const words = POSITION_COPY[metric];
  if (!words) {
    // A metric added to the tiles without a phrase gets a true statement
    // rather than a wrong one.
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
    <article className="site-tile">
      <h4 className="site-tile__label">{tile.label}</h4>

      <p className="site-tile__value">
        {format(tile.normal, unit)}
        <span className="site-tile__unit">{unit === 'date' ? '' : ` ${unit}`}</span>
      </p>
      <p className="site-tile__caption">
        typical season · {tile.n_seasons} seasons
      </p>

      <dl className="site-tile__rows">
        <div>
          <dt>{tile.latest.vintage}</dt>
          <dd>
            {format(tile.latest.value, unit)}
            {tile.anomaly != null && (
              <span className={`site-tile__delta is-${tone}`}>
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
            <span className="site-tile__muted">
              {' '}({tile.coolest.vintage}–{tile.warmest.vintage})
            </span>
          </dd>
        </div>
        {tile.trend_per_decade != null && (
          <div>
            <dt>Trend</dt>
            <dd>
              {signed(tile.trend_per_decade, unit)} per decade
            </dd>
          </div>
        )}
      </dl>

      {tile.zone?.position && (
        <p className={`site-tile__position is-${tile.zone.position}`}>
          {positionCopy(tile.metric, tile.zone.position)}
        </p>
      )}
    </article>
  );
}

function SeasonStrip({ strip }) {
  if (!strip) return null;

  if (!strip.available) {
    return (
      <div className="season-strip season-strip--empty">
        <p><Info size={15} aria-hidden="true" /> {strip.reason}</p>
      </div>
    );
  }

  return (
    <section className="season-strip" aria-labelledby="season-strip-heading">
      <header className="season-strip__head">
        <h3 id="season-strip-heading">
          <Radio size={16} aria-hidden="true" />
          {strip.zone_name} · {strip.vintage} season
          <span className="season-strip__state">
            {strip.complete ? 'complete' : 'in progress'}
          </span>
        </h3>
        {/* The scale difference is the point of this line. A grower reading a
            regional number as their own site's is the failure this panel has to
            prevent, and it cannot be prevented by layout alone. */}
        <p className="season-strip__scope">
          Measured at {strip.stations.min === strip.stations.max
            ? `${strip.stations.max} stations`
            : `${strip.stations.min}–${strip.stations.max} stations`}{' '}
          across the whole region — not at your site. {strip.n_days} days to{' '}
          {dayLabel(strip.through)}.
        </p>
      </header>

      <div className="season-strip__metrics">
        {strip.metrics.map((m) => {
          const delta = (m.value != null && m.normal != null)
            ? m.value - m.normal
            : null;
          return (
            <div key={m.metric} className="season-strip__metric">
              <p className="season-strip__metric-label">{m.label}</p>
              <p className="season-strip__metric-value">
                {format(m.value, m.unit)}
                <span className="site-tile__unit"> {m.unit}</span>
              </p>
              {m.normal != null && (
                <p className="season-strip__metric-normal">
                  usual {format(m.normal, m.unit)}
                  {delta != null && (
                    <span className="season-strip__metric-delta">
                      {' '}({signed(delta, m.unit)})
                    </span>
                  )}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <p className="season-strip__note">
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

/**
 * @param {number} siteId  a site that is `ready`. The endpoint 409s otherwise,
 *   which the page above already handles by showing the populating state.
 */
function SiteDashboard({ siteId, baseline }) {
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading');

  useEffect(() => {
    if (!siteId) return undefined;
    let live = true;
    setState('loading');
    getSiteDashboard(siteId, { baseline })
      .then((res) => { if (live) { setData(res); setState('ready'); } })
      .catch(() => { if (live) setState('error'); });
    return () => { live = false; };
  }, [siteId, baseline]);

  if (state === 'loading') {
    return (
      <p className="site-dashboard__loading">
        <Loader size={16} className="spin" aria-hidden="true" /> Loading your site…
      </p>
    );
  }
  if (state === 'error' || !data) {
    return <p className="site-dashboard__error">Could not load the summary for this site.</p>;
  }

  return (
    <div className="site-dashboard">
      <SeasonStrip strip={data.season_to_date} />

      <section aria-labelledby="climatology-heading">
        <header className="site-dashboard__head">
          <h3 id="climatology-heading">What this site usually does</h3>
          <p>
            Your own 500 m cell, every season from 1986 to 2023. Typical values
            are the {data.baseline} average.
          </p>
        </header>

        <div className="site-dashboard__tiles">
          {data.tiles.map((tile) => <Tile key={tile.metric} tile={tile} />)}
        </div>
      </section>
    </div>
  );
}

export default SiteDashboard;
