// components/home/NationalPulse.jsx — the national stat strip on the home page.
//
// The first thing a visitor sees, and the only chance to show that this site
// knows something. Every tile is a real number from a real zone, named, with
// the date it came from — not a marketing figure.
//
// DATA SOURCE, AND WHY IT IS NOT SURFACES YET
// Surfaces are not published (s3://auxein-climate-surfaces does not exist and
// temp_min has not been run), so this reads /regional-overview, the existing
// zone-aggregation path. That is the freeze-then-migrate shape agreed in
// docs/plans/INSIGHTS_SITE_MAP_2026-08-13.md §0 D-B: build on what is live,
// re-point when surfaces land. The tile list is data-driven precisely so that
// migration adds entries rather than rewriting this component.
//
// When it does migrate, "warmest region" changes meaning: today it is the
// warmest ZONE AGGREGATE, and under D-C it becomes the block-intersected zone
// statistic. The numbers will move. That is expected and must be published,
// not hidden.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Thermometer, Snowflake, CloudRain, TrendingUp, Sprout } from 'lucide-react';
import { getRegionalOverview } from '../../services/realtimeClimateService';
import './NationalPulse.css';

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'long' });
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

function buildTiles(overview) {
  const zones = overview?.zones ?? [];
  if (!zones.length) return [];

  const tiles = [];

  const warmest = extremeBy(zones, 'temp_max', 'max');
  if (warmest) {
    tiles.push({
      key: 'warmest',
      icon: <Thermometer size={18} />,
      label: 'Warmest',
      value: `${warmest.value.toFixed(1)}°C`,
      detail: warmest.zone.zone_name,
      slug: warmest.zone.zone_slug,
      tone: 'warm',
    });
  }

  const coldest = extremeBy(zones, 'temp_min', 'min');
  if (coldest) {
    tiles.push({
      key: 'coldest',
      icon: <Snowflake size={18} />,
      label: 'Coldest',
      value: `${coldest.value.toFixed(1)}°C`,
      detail: coldest.zone.zone_name,
      slug: coldest.zone.zone_slug,
      tone: 'cool',
      // A sub-zero overnight low in the growing season is the single most
      // consequential number on this strip, so it gets called out.
      flag: coldest.value <= 0 ? 'Frost' : null,
    });
  }

  const wettest = extremeBy(zones, 'rainfall_mm', 'max');
  if (wettest && wettest.value > 0) {
    tiles.push({
      key: 'wettest',
      icon: <CloudRain size={18} />,
      label: 'Wettest',
      value: `${wettest.value.toFixed(1)} mm`,
      detail: wettest.zone.zone_name,
      slug: wettest.zone.zone_slug,
      tone: 'wet',
    });
  }

  const leader = extremeBy(zones, 'gdd_cumulative', 'max');
  if (leader) {
    tiles.push({
      key: 'gdd',
      icon: <Sprout size={18} />,
      label: 'Most heat this season',
      value: `${Math.round(leader.value).toLocaleString('en-NZ')} GDD`,
      detail: leader.zone.zone_name,
      slug: leader.zone.zone_slug,
      tone: 'grow',
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
      tone: avg >= 0 ? 'warm' : 'cool',
    });
  }

  return tiles;
}

function NationalPulse() {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getRegionalOverview()
      .then((data) => { if (!cancelled) setOverview(data); })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="national-pulse national-pulse--loading" aria-busy="true">
        {[0, 1, 2, 3].map((i) => <div key={i} className="pulse-tile pulse-tile--skeleton" />)}
      </div>
    );
  }

  const tiles = buildTiles(overview);

  // Nothing to say is better than an empty frame with an error in it. The home
  // page still has the map and the articles.
  if (failed || !tiles.length) return null;

  return (
    <section className="national-pulse-section" aria-label="Current national conditions">
      <div className="national-pulse">
        {tiles.map((t) => {
          const body = (
            <>
              <span className={`pulse-tile__icon pulse-tile__icon--${t.tone}`}>{t.icon}</span>
              <span className="pulse-tile__body">
                <span className="pulse-tile__label">{t.label}</span>
                <span className="pulse-tile__value">
                  {t.value}
                  {t.flag && <span className="pulse-tile__flag">{t.flag}</span>}
                </span>
                <span className="pulse-tile__detail">{t.detail}</span>
              </span>
            </>
          );
          // Zone pages do not exist yet (Pass 2). Until /regions/:slug ships,
          // these are plain tiles rather than links to a 404.
          return <div key={t.key} className="pulse-tile">{body}</div>;
        })}
      </div>

      {overview?.latest_data_date && (
        <p className="national-pulse__footnote">
          Latest readings {fmtDate(overview.latest_data_date)}, averaged across each
          region&rsquo;s weather stations.{' '}
          <Link to="/map">See the full map</Link>
        </p>
      )}
    </section>
  );
}

export default NationalPulse;
