// components/pro/SiteDashboard.jsx — what a subscriber sees on opening a site.
//
// FOUR BLOCKS, THREE SCALES, KEPT APART. Reading order is the order the
// questions get asked:
//
//   season_current   this season, at the site's OWN cell, against that cell's
//                    own 1986-2005 curve. Both sides describe one place.
//   season_previous  the season just finished, at the REGION, from stations —
//                    a finished season is only fully recorded at station scale.
//   tiles            what this cell usually does, 1986-2023 surface archive.
//   projections      this cell under each emissions scenario, against its own
//                    1986-2005 baseline. Sampled from the projection surfaces
//                    since 2026-08-31; it was a placeholder before those existed.
//
// No number is ever computed across those boundaries — the server does not
// merge them and neither does this. Everything numeric arrives ready: normals,
// anomalies and trends are all server-computed, because the moment the browser
// starts summing days it can disagree with the server about which days counted.
import { useEffect, useState } from 'react';
import {
  TrendingUp, TrendingDown, Minus, Info, Loader, Radio,
} from 'lucide-react';
import { getSiteDashboard } from '../../services/proSiteService';
import BaselineNote from './BaselineNote';
import CurrentSeasonPanel from './CurrentSeasonPanel';
import ProjectionsPanel from './ProjectionsPanel';
import RegionalModelsPanel from './RegionalModelsPanel';
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
//
// FROST IS ABSENT FROM THIS MAP ON PURPOSE. The server no longer sends a `zone`
// block for frost metrics, so no phrase here could ever render — and leaving
// "More frost-prone than 90% of the vineyards in this region" sitting in the
// file is an invitation to switch it back on. Our surfaces model no cold-air
// drainage; that sentence is the one claim they cannot make.
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
      {/* The count under the normal must be the count the NORMAL was averaged
          over, not the length of the whole series. They differ: a site's record
          runs 37 seasons but the 1986-2005 normal is built from 19 of them. The
          range and trend below still come from all 37. */}
      <p className="site-tile__caption">
        typical season at this site · {tile.normal_years} seasons
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
                  {/* The tiles below say "usual" too, for THIS SITE, and the
                      numbers differ because the places differ. Naming the scale
                      on the number itself is the only thing that stops the two
                      reading as a contradiction — the scope paragraph in the
                      header is too far from the figure to do that work. */}
                  <span className="season-strip__metric-scope">
                    across {strip.zone_name || 'the region'}
                    {m.normal_years ? ` · ${m.normal_years} seasons` : ''}
                  </span>
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
      {/* Once, at the top. Every panel below names its own baseline; only this
          one explains why the page sits on a period that ends in 2005. */}
      <BaselineNote baseline={data.baseline} />

      {/* Reading order is the order the questions get asked: what is happening
          now, what happened last season, what usually happens. The first two
          are different SHAPES on purpose — the current season is this cell
          against its own record, the previous one is the region from stations,
          because a finished season is only fully recorded at station scale. */}
      <CurrentSeasonPanel season={data.season_current} siteId={siteId} />

      <SeasonStrip strip={data.season_previous} />

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

      {/* Regional models, below the site's own record because that is the order
          of confidence: everything above is this cell, these two are the region
          around it. */}
      {/* siteId so the phenology block can fetch the POINT model; the
          regional payload stays as its fallback. */}
      <RegionalModelsPanel models={data.models} siteId={siteId} />

      {/* Last, because it is the only block that answers a question about the
          future rather than the record.

          It fetches its own data rather than reading it off this payload. The
          grid is ~112 rows per season and the season is a control the reader
          changes, so folding it in here would make every site open pay for a
          panel most visits scroll past, and changing season would refetch the
          whole dashboard. `projections` is still passed for the regional link
          and its vocabulary, which do come from this payload. */}
      <ProjectionsPanel siteId={siteId} projections={data.projections} />
    </div>
  );
}

export default SiteDashboard;
