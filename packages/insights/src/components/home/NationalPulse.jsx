// components/home/NationalPulse.jsx — the national stat strip on the home page.
//
// The first thing a visitor sees, and the only chance to show that this site
// knows something. Every tile is a real number from a real place, named, with
// the time it came from — not a marketing figure.
//
// TWO SOURCES, DELIBERATELY
// The strip mixes two feeds with different freshness, and that is why each
// tile carries its own timestamp rather than the section carrying one.
//
//   Warmest / Coldest / Wettest   /live-extremes — RAW station observations.
//                                 One named station, minutes to hours old.
//   Most heat / Season vs normal  /regional-overview — zone aggregates, a day
//                                 or two behind because they are daily rollups.
//
// Before 2026-08-20 the whole strip read the aggregates, so the headline
// numbers were routinely two days old and named a region rather than a
// station. The point of the change is the impression of a live network, which
// only raw observations can give.
//
// MAINLAND, AND ANY STATION ON IT
// A station is allowed to headline whether or not it sits in a wine zone — the
// network runs well past the wine regions and that reach is worth showing.
// Offshore territories are NOT included: Raoul Island in the Kermadecs is
// subtropical and took the national high every single day, which tells a New
// Zealand grower nothing. The server draws that line; see the bounding box in
// realtime_climate.py. Tiles only link when the server hands back a zone slug,
// which is the minority.
//
// EVERY TILE CARRIES ITS OWN CLOCK
// The server sends `label` and `window_hours` per reading and this component
// prints them rather than deciding them. Temperature is a state — the warmest
// place right now, from each station's latest reading inside 2 hours — while
// rainfall is an accumulation with no instantaneous value, so it is a 24 hour
// total. "Warmest now" beside "Wettest 24h" is the server being explicit that
// those two numbers do not describe the same moment. Do not collapse them to a
// single heading.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Thermometer, Snowflake, CloudRain, TrendingUp, Sprout, Radio } from 'lucide-react';
import { getRegionalOverview, getLiveExtremes } from '../../services/realtimeClimateService';
import './NationalPulse.css';
import { useCountryIndustry } from '../../contexts/CountryIndustryContext';

const ICONS = {
  warmest: <Thermometer size={18} />,
  coldest: <Snowflake size={18} />,
  wettest: <CloudRain size={18} />,
};

const TONES = {
  warmest: 'warm',
  coldest: 'cool',
  wettest: 'wet',
};

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'long' });
}

/**
 * "42 minutes ago" / "3 hours ago" / "yesterday, 4:10pm".
 *
 * Relative for anything inside a day, because that is what carries the sense
 * of a live feed. Beyond that it becomes a real date and time: "31 hours ago"
 * is arithmetic the reader should not have to do.
 */
function fmtAgo(iso) {
  if (!iso) return '';
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';

  const mins = Math.round((Date.now() - then.getTime()) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} minutes ago`;

  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  return then.toLocaleString('en-NZ', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  });
}

/** Highest non-null `key` across zones. Nulls are absent readings, not zeros. */
function extremeBy(zones, key, direction = 'max') {
  const withValue = zones
    .map((z) => ({ zone: z, value: z[key] == null ? null : Number(z[key]) }))
    .filter((r) => r.value != null && Number.isFinite(r.value));
  if (!withValue.length) return null;
  return withValue.reduce((best, r) =>
    (direction === 'max' ? r.value > best.value : r.value < best.value) ? r : best);
}

/**
 * The three live tiles, straight from the server's `extremes` array.
 *
 * The order is the server's. It returns warmest, coldest, wettest and the
 * strip reads in that order, so re-sorting here would only create a second
 * place for that decision to live.
 */
function buildLiveTiles(live) {
  const extremes = live?.extremes ?? [];

  return extremes.map((e) => {
    const value = Number(e.value);
    const isTemp = e.unit !== 'mm';

    return {
      key: e.key,
      icon: ICONS[e.key] ?? <Thermometer size={18} />,
      // "Warmest now" -> "Warmest". The server label is right for an API
      // consumer reading it cold; on the strip the live dot beside it already
      // says "now", and the word was being repeated on all three tiles.
      // "Wettest 24h" keeps its qualifier — that one is a window, not an
      // instant, and dropping it would make the number mean something else.
      label: String(e.label).replace(/\s+now$/i, ''),
      value: isTemp ? `${value.toFixed(1)}°C` : `${value.toFixed(1)} mm`,
      // The station is the detail, not the region. "Omaka at Ramshead Saddle"
      // is a specific claim; "Marlborough" is the one the aggregates already
      // made, and less interesting for it.
      detail: e.station_name,
      // Regions repeat the station's context without repeating its name. Many
      // stations have none — the network runs past the wine regions — and an
      // empty string renders as nothing rather than as a gap.
      context: e.station_region || '',
      timestamp: e.observed_at,
      // Only present when the station falls inside a wine zone. Everything
      // else is a tile with no link, which is correct: there is no page for a
      // station in the Kermadecs.
      slug: e.zone_slug || null,
      tone: TONES[e.key] ?? 'warm',
      // A sub-zero overnight low in the growing season is the single most
      // consequential number on this strip, so it gets called out.
      flag: e.key === 'coldest' && value <= 0 ? 'Frost' : null,
      live: true,
    };
  });
}

/**
 * The two season tiles, still from the zone aggregates.
 *
 * These have no raw equivalent: GDD accumulation and a baseline comparison are
 * both season-to-date sums over a zone, so there is no single station reading
 * that could stand for either. They keep the aggregates' own date.
 */
function buildSeasonTiles(overview) {
  const zones = overview?.zones ?? [];
  if (!zones.length) return [];

  const tiles = [];
  const asOf = overview?.latest_data_date || null;

  const leader = extremeBy(zones, 'gdd_cumulative', 'max');
  if (leader) {
    tiles.push({
      key: 'gdd',
      icon: <Sprout size={18} />,
      label: 'Most heat this season',
      value: `${Math.round(leader.value).toLocaleString('en-NZ')} GDD`,
      detail: leader.zone.zone_name,
      context: '',
      slug: leader.zone.zone_slug,
      tone: 'grow',
      asOf,
    });
  }

  // National season position. Averaged across zones that have a baseline
  // comparison — zones without one are excluded rather than counted as 0%.
  const vsBaseline = zones
    .map((z) => (z.gdd_vs_baseline_pct == null ? null : Number(z.gdd_vs_baseline_pct)))
    .filter((v) => v != null && Number.isFinite(v));
  if (vsBaseline.length) {
    const avg = vsBaseline.reduce((a, b) => a + b, 0) / vsBaseline.length;
    tiles.push({
      key: 'baseline',
      icon: <TrendingUp size={18} />,
      label: 'Season vs normal',
      value: `${avg >= 0 ? '+' : ''}${avg.toFixed(1)}%`,
      detail: `across ${vsBaseline.length} zone${vsBaseline.length === 1 ? '' : 's'}`,
      context: '',
      tone: avg >= 0 ? 'warm' : 'cool',
      asOf,
    });
  }

  return tiles;
}

/**
 * @param {boolean} [compact]  tighter tiles, for a hero column rather than a
 *                             full-width strip
 * @param {number}  [limit]    cap the number of tiles
 *
 * The compact form exists because the home hero became three even columns on
 * 2026-08-24: the clickable region map takes the left, and this sits above
 * ProTeaser in the middle. At full size it made the middle column taller than
 * the other two, which is the thing the three-column layout is for.
 */
function NationalPulse({ compact = false, limit }) {
  // Region links carry the current (country, industry) scope. Outside a
  // scoped route this falls back to the visitor's last scope, then to
  // New Zealand wine — so no link has to bounce through the /regions redirect.
  const { path } = useCountryIndustry();

  const [live, setLive] = useState(null);
  const [overview, setOverview] = useState(null);
  // Only the LIVE call gates the skeleton. Measured 2026-08-20: /live-extremes
  // answers in 3ms warm while /regional-overview takes 9.5s, so awaiting both
  // held the fresh station readings — the entire reason this strip exists —
  // behind a legacy aggregate for nine seconds. The season tiles now appear
  // when they arrive, which is what independent feeds should do anyway.
  const [liveSettled, setLiveSettled] = useState(false);

  useEffect(() => {
    let cancelled = false;

    getLiveExtremes()
      .then((data) => { if (!cancelled) setLive(data); })
      // A failure is not an error state here: the strip simply has fewer
      // tiles, and the season pair may still arrive.
      .catch(() => {})
      .finally(() => { if (!cancelled) setLiveSettled(true); });

    getRegionalOverview()
      .then((data) => { if (!cancelled) setOverview(data); })
      .catch(() => {});

    return () => { cancelled = true; };
  }, []);

  if (!liveSettled) {
    return (
      <div className={`national-pulse national-pulse--loading${
        compact ? ' national-pulse--compact' : ''}`} aria-busy="true">
        {Array.from({ length: limit || 4 }, (_, i) => i).map((i) => (
          <div key={i} className="pulse-tile pulse-tile--skeleton" />))}
      </div>
    );
  }

  // Live tiles lead, because they are the ones that change hour to hour and the
  // reason the strip exists. A `limit` therefore trims the season tiles first.
  const allTiles = [...buildLiveTiles(live), ...buildSeasonTiles(overview)];
  const tiles = limit ? allTiles.slice(0, limit) : allTiles;

  // Nothing to say is better than an empty frame with an error in it. The home
  // page still has the map and the articles.
  if (!tiles.length) return null;

  const stationCount = live?.reporting_stations;
  const networkAge = fmtAgo(live?.network_latest_at);

  return (
    <section className="national-pulse-section" aria-label="Current national conditions">
      <div className={`national-pulse${compact ? ' national-pulse--compact' : ''}`}>
        {tiles.map((t) => {
          const body = (
            <>
              {/* Icon and label share a line. Stacked, the label sat under the
                  icon and the tile read as two unrelated things. */}
              <span className="pulse-tile__head">
                <span className={`pulse-tile__icon pulse-tile__icon--${t.tone}`}>{t.icon}</span>
                <span className="pulse-tile__label">{t.label}</span>
                {/* Replaces the word "now" that used to be in every label. */}
                {t.live && <span className="pulse-tile__live" title="Live station reading" aria-label="live" />}
              </span>
              <span className="pulse-tile__body">
                <span className="pulse-tile__value">
                  {t.value}
                  {t.flag && <span className="pulse-tile__flag">{t.flag}</span>}
                </span>
                {/* THE STATION NAME. Without it the tile is an unattributed
                    number that links somewhere unexplained — "coldest" landing
                    on Lower Wairau reads as a bug until you can see it is
                    Blenheim Bowling Club, which really is in Lower Wairau. */}
                <span className="pulse-tile__detail" title={t.detail}>{t.detail}</span>
                {/* Every tile says how old it is, because they are not all the
                    same age. A single date on the section would be wrong for
                    at least one of them. */}
                <span className="pulse-tile__when">
                  {t.live ? fmtAgo(t.timestamp) : (t.asOf ? fmtDate(t.asOf) : '')}
                  {t.context && <span className="pulse-tile__where">{t.context}</span>}
                </span>
              </span>
            </>
          );

          return t.slug ? (
            <Link key={t.key} to={path(t.slug)} className="pulse-tile pulse-tile--link">
              {body}
            </Link>
          ) : (
            <div key={t.key} className="pulse-tile">{body}</div>
          );
        })}
      </div>

      <p className="national-pulse__footnote">
        {stationCount > 0 && (
          <span className="national-pulse__livemark">
            <Radio size={13} aria-hidden="true" />
            {stationCount.toLocaleString('en-NZ')} stations reporting
            {networkAge && <> &middot; latest reading {networkAge}</>}
          </span>
        )}{' '}
      </p>
    </section>
  );
}

export default NationalPulse;
