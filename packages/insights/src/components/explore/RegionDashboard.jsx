// components/explore/RegionDashboard.jsx — the four blocks, one payload.
//
// Phase 4 of docs/plans/COUNTRY_INDUSTRY_REGIONS_2026-08-24.md.
//
// Lighter than the Pro site dashboard and deliberately so: a graph, a table, a
// graph, and two rows of figures. The heavyweight explorers still exist and are
// one click away — this is the overview a grower reads first, not a replacement
// for browsing.
//
// EVERY BLOCK DECIDES FOR ITSELF WHETHER IT HAS ANYTHING TO SAY. Thirteen of 23
// zones have a live season, 12 have disease, 13 phenology, 21 history, 23
// projections — so a region showing a season curve, no phenology and full
// projections is a normal response and not a degraded one. The server resolves
// coverage and writes the reason; this component renders whichever it is
// handed. It never infers "no data" from an empty array, because an empty array
// and a withheld value are different claims.
import { useEffect, useState } from 'react';
import {
  Activity, CalendarRange, CloudSunRain, History, LineChart, Sprout,
  TriangleAlert,
} from 'lucide-react';
import RecentConditions from './RecentConditions';
import SeasonProgressChart from './SeasonProgressChart';
import PhenologyTable from './PhenologyTable';
import DiseaseChart from './DiseaseChart';
import { HistorySummary, ProjectionsSummary } from './ClimateSummary';
import { getRegionDashboard } from '../../services/regionDashboardService';
import './explore.css';

function Block({ icon: Icon, title, subtitle, children, aside }) {
  return (
    <section className="block">
      <header className="block__head">
        <h2><Icon size={17} aria-hidden="true" /> {title}</h2>
        {subtitle && <p className="block__sub">{subtitle}</p>}
        {aside}
      </header>
      {children}
    </section>
  );
}

function Skeleton() {
  return (
    <div className="dash" aria-busy="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="block block--skeleton" />
      ))}
    </div>
  );
}

// HIDDEN, NOT DELETED (Pete, 2026-08-25).
//
// Recent conditions reads `climate_zone_daily`, which only 13 of 23 zones
// carry, so the block was absent or thin on nearly half the regions — and it is
// the FIRST thing on the page, which made the whole dashboard look
// half-finished on the regions it was most important to impress. It comes back
// when the daily surfaces cover every zone from 2026-09-01.
//
// A flag rather than a comment-out or a deletion: the block, its subtitle, its
// import and `RecentConditions` itself all stay live and type-check, so turning
// it back on is one word. Commented-out JSX rots because nothing compiles it.
const SHOW_RECENT_CONDITIONS = false;

function RegionDashboard({ slug, onSignInRequired }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState('gdd10');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    getRegionDashboard(slug)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug]);

  if (loading) return <Skeleton />;

  if (error) {
    return (
      <p className="block__absent block__absent--error">
        <TriangleAlert size={15} aria-hidden="true" />
        {error.status === 404
          ? 'That region does not exist.'
          : 'The regional dashboard could not be loaded.'}
      </p>
    );
  }
  if (!data) return null;

  const { recent, season, phenology, disease, history, projections } = data;

  return (
    <div className="dash">
      {/* THE OPEN TIER, in the order a grower reads it: where the season
          stands, what is coming, what to spray for. Everything here is
          actionable now and none of it needs an account.

          History and projections follow. They answer what this region IS and
          what it is becoming — neither a decision anyone takes this week — and
          since 2026-08-25 they need a FREE ACCOUNT rather than Pro. Splitting
          on time horizon is what makes the open page worth landing on; asking
          for a sign-up at the point where someone wants the forty-year record
          is where the ask is natural. */}
      {SHOW_RECENT_CONDITIONS && (
        <Block
          icon={CloudSunRain}
          title="Recent conditions"
          subtitle={recent?.available
            ? `Measured at ${recent.series[recent.series.length - 1]?.stations ?? '—'} stations, last ${recent.window_days} days`
            : undefined}
        >
          <RecentConditions recent={recent} />
        </Block>
      )}

      <Block
        icon={LineChart}
        title="Current season"
        subtitle={season.available
          ? `${data.vintage} season against the ${data.baseline} normal, to ${
            new Date(season.through).toLocaleDateString('en-NZ',
              { day: 'numeric', month: 'long' })}`
          : `The ${data.vintage} season`}
        aside={season.available && (
          <div className="block__toggle" role="tablist" aria-label="Metric">
            {[['gdd10', 'Growing degree days'], ['rain', 'Rainfall']].map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={metric === k}
                className={metric === k ? 'on' : ''}
                onClick={() => setMetric(k)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      >
        <SeasonProgressChart season={season} metric={metric} />
        {/* The totals table was removed on 2026-08-24. It compared a live
            station aggregate against a surface-archive normal — two different
            instruments — and every row of it needed a caveat. The chart above
            says the same thing about GDD without one, and now carries the
            year-to-year spread so "ahead of normal" can be read against how
            much seasons actually differ. */}
      </Block>

      <Block
        icon={Sprout}
        title="Phenology"
        subtitle={phenology.available
          ? `${phenology.variety_count} varieties, ${phenology.vintage_year} season`
          : undefined}
      >
        <PhenologyTable phenology={phenology} />
        {data.models_disclaimer && phenology.available && (
          <p className="block__note block__note--quiet">{data.models_disclaimer}</p>
        )}
      </Block>

      <Block
        icon={Activity}
        title="Disease pressure"
        subtitle={disease.available
          ? `Last ${disease.window_days} days`
          : undefined}
      >
        <DiseaseChart disease={disease} />
      </Block>

      <Block icon={History} title="Climate history">
        <HistorySummary history={history} onSignInRequired={onSignInRequired} />
      </Block>

      <Block icon={CalendarRange} title="Projections">
        <ProjectionsSummary
          projections={projections}
          onSignInRequired={onSignInRequired}
        />
      </Block>
    </div>
  );
}

export default RegionDashboard;
