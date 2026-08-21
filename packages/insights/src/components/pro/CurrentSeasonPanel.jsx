// components/pro/CurrentSeasonPanel.jsx — the season in progress, at YOUR cell.
//
// This is the one panel on the page where both numbers describe the same place:
// the season so far is read from the site's own 500 m cell in the live daily
// surface, and the "usual" beside it is that same cell's 1986-2005 record. The
// regional strip below it is a different shape for a good reason — a finished
// season is only fully recorded at station scale — and the two must not be made
// to look alike.
//
// THREE STATES, and the first is not an edge case. Sep-Apr means that for four
// months of every year there is no season under way at all, so `not_started` is
// what a subscriber sees from May to August — including on the day this ships.
// It renders the countdown and what a usual season looks like, never an empty
// chart and never a spinner.
//
// Nothing here is computed from the payload beyond a percentage for the bar.
// Values, normals and anomalies all arrive ready, because the moment the browser
// starts summing days it can disagree with the server about which days counted.
import { Info, Loader, Sprout, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import './CurrentSeasonPanel.css';

function format(value, unit) {
  if (value == null || Number.isNaN(value)) return '—';
  if (unit === 'GDD' || unit === 'mm') return Math.round(value).toLocaleString();
  if (unit === 'nights' || unit === 'days') return value.toFixed(1);
  return value.toFixed(1);
}

function signed(value, unit) {
  if (value == null) return null;
  return `${value >= 0 ? '+' : '−'}${format(Math.abs(value), unit)}`;
}

function dayLabel(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}

// Colour only. The number reads identically either way — direction says which
// way costs a grower money, not which way is "good".
function toneFor(anomaly, direction) {
  if (anomaly == null || direction == null || Math.abs(anomaly) < 1e-9) return 'flat';
  const worse = direction === 'up' ? anomaly < 0 : anomaly > 0;
  return worse ? 'bad' : 'good';
}

function Header({ season }) {
  const pct = season.days_total
    ? Math.min(100, Math.max(0, (season.days_elapsed / season.days_total) * 100))
    : 0;

  return (
    <header className="current-season__head">
      <h3 id="current-season-heading">
        <Sprout size={16} aria-hidden="true" />
        {season.vintage} season
        <span className={`current-season__state is-${season.state}`}>
          {season.state === 'not_started' ? 'not started'
            : season.state === 'complete' ? 'complete' : 'in progress'}
        </span>
      </h3>

      {season.state === 'not_started' ? (
        <p className="current-season__scope">
          Starts {dayLabel(season.from)}
          {season.starts_in_days > 0 && ` · ${season.starts_in_days} `}
          {season.starts_in_days > 0 && (season.starts_in_days === 1 ? 'day away' : 'days away')}
        </p>
      ) : (
        <>
          <p className="current-season__scope">
            Day {season.days_elapsed} of {season.days_total}
            {season.data_to && ` · measured to ${dayLabel(season.data_to)}`}
          </p>
          {/* The bar exists so a to-date number is never read as a season
              total. Two months of GDD looks like a catastrophe next to a
              season normal, and only the elapsed fraction says otherwise. */}
          <div className="current-season__progress" role="presentation">
            <span style={{ width: `${pct}%` }} />
          </div>
        </>
      )}
    </header>
  );
}

// What a usual season looks like here, shown before one is under way. It is a
// climatology, not a forecast, and the wording has to keep that clear.
function UsualSeason({ totals }) {
  if (!totals) return null;
  const items = [
    ['Growing degree days', totals.gdd10, 'GDD'],
    ['Rainfall', totals.rain, 'mm'],
    ['Frost nights', totals.frost_nights, 'nights'],
    ['Days over 25°C', totals.hot_days, 'days'],
  ];
  return (
    <div className="current-season__usual">
      <p className="current-season__usual-label">A usual season at this site</p>
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

function Metric({ metric }) {
  const tone = toneFor(metric.anomaly, metric.direction);
  const Arrow = tone === 'flat' ? Minus : (metric.anomaly > 0 ? TrendingUp : TrendingDown);

  return (
    <div className="current-season__metric">
      <p className="current-season__metric-label">{metric.label}</p>
      <p className="current-season__metric-value">
        {format(metric.value, metric.unit)}
        <span className="current-season__metric-unit"> {metric.unit}</span>
      </p>
      {metric.normal != null && (
        <p className="current-season__metric-normal">
          usual by now {format(metric.normal, metric.unit)}
          {metric.anomaly != null && (
            <span className={`current-season__delta is-${tone}`}>
              <Arrow size={12} aria-hidden="true" />
              {signed(metric.anomaly, metric.unit)}
            </span>
          )}
        </p>
      )}
      {/* Days used, not days elapsed. They differ whenever the surface had a
          hole, and the difference is the honest caveat on the comparison. */}
      <p className="current-season__metric-days">
        {metric.days_used} {metric.days_used === 1 ? 'day' : 'days'}
      </p>
    </div>
  );
}

function CurrentSeasonPanel({ season }) {
  if (!season) return null;

  if (!season.available) {
    return (
      <section className="current-season current-season--pending"
               aria-labelledby="current-season-heading">
        <Header season={season} />
        <p className="current-season__reason">
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
    <section className="current-season" aria-labelledby="current-season-heading">
      <Header season={season} />

      <div className="current-season__metrics">
        {season.metrics.map((m) => <Metric key={m.metric} metric={m} />)}
      </div>

      <p className="current-season__note">
        <Info size={14} aria-hidden="true" />
        {season.note}
        {season.baseline && ` Normal is the ${season.baseline} average for the same days.`}
      </p>

      {/* The era difference is DISCLOSED, not corrected out of the numbers, and
          the two terms are given separately because they have different causes
          and different futures — one is a definition and will not move, the
          other is network density and will. */}
      {season.era?.terms?.length > 0 && (
        <details className="current-season__era">
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

export default CurrentSeasonPanel;
