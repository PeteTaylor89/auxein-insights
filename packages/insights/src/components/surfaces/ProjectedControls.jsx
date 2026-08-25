// components/surfaces/ProjectedControls.jsx — the Atlas in Projected mode.
//
// Split out of SurfaceMap because it shares almost nothing with the measured
// controls. A measurement is addressed by a DATE and scrubbed through a series;
// a projection is addressed by (scenario, period, season) and has no series at
// all, so there is no slider, no play button and no confidence figure.
//
// FOUR THINGS HERE ARE LOAD-BEARING
//
// 1. **The matrix is not full.** 16 of the 18 (scenario, period) pairs are
//    published, because only SSP3-7.0 reaches +3 C. Every period chip is
//    checked against `combinations` and disabled when the pair does not exist —
//    rendering the axes as a cross product would offer two chips that 404.
//
// 2. **Periods and warming levels are two different things.** "2041-2060" is a
//    date range; "+2 C" is a threshold that different scenarios cross in
//    different decades. They are grouped and labelled separately, because a
//    single undifferentiated row invites reading +3 C as a fourth time period.
//
// 3. **The attribution is not optional.** The MfE 2024 projections are CC BY
//    4.0 and the licence REQUIRES attribution to travel with the work. The
//    string comes from the server (`surface_projection_run.source`) rather than
//    being written here, so it cannot drift from what was published.
//
// 4. **The change is stated against the baseline, always signed.** A map of
//    2090 shows absolute values; what a grower wants is the difference from the
//    normal they know, and "+1.8 C on the 1986-2005 normal" is that sentence.
import { Lock, Info } from 'lucide-react';
import './ProjectedControls.css';

/** Period chips split into their two kinds, each keeping the server's order. */
function byKind(periods) {
  return {
    period: periods.filter((p) => p.kind !== 'warming'),
    warming: periods.filter((p) => p.kind === 'warming'),
  };
}

function ProjectedControls({
  layers, layer, onLayer,
  scenarios, periods, seasons, combinations,
  scenario, period, season,
  onScenario, onPeriod, onSeason,
  step, baselineStep, view, onView,
  unit, baseline, source, baselineSource, domain,
  loading, unavailable, locked, unlock, onSignInRequired,
}) {
  if (unavailable) {
    return (
      <p className="surface-map__error">
        The climate projections are not available right now.
      </p>
    );
  }

  // Signed in is what opens the matrix; the layer list arrives either way, so
  // the offer can name what is behind it rather than showing an empty panel.
  if (locked) {
    return (
      <div className="surface-map__unlock">
        <Lock size={15} aria-hidden="true" />
        <p>
          {unlock || 'Sign in free to open the climate projections.'}
          {layers?.length > 0 && (
            <>
              {' '}
              <strong>{layers.length} layers</strong> across three emissions
              scenarios and six horizons, at 500 m.
            </>
          )}
        </p>
        <button
          type="button"
          className="surface-map__unlock-cta"
          onClick={onSignInRequired}
          disabled={!onSignInRequired}
        >
          Sign in free to open them
        </button>
      </div>
    );
  }

  const kinds = byKind(periods);
  const pairExists = (sc, pe) => combinations.has(`${sc}|${pe}`);
  const delta = step?.delta_median;
  const spread = step?.delta_p5 != null && step?.delta_p95 != null
    ? [step.delta_p5, step.delta_p95] : null;

  // What the chips currently say, in words, so the projected row names its own
  // horizon instead of leaving the reader to look back up at the controls.
  const scenarioLabel = scenarios.find((o) => o.value === scenario)?.label || scenario;
  const periodLabel = periods.find((o) => o.value === period)?.label || period;

  // Which of the two rows the CANVAS is currently drawing. The readout keeps
  // showing both numbers either way — the point of the pair is the comparison,
  // and hiding one of them the moment you look at it would defeat that. The
  // marker just says which one the colours belong to.
  const onBaseline = view === 'baseline' && !!baselineStep;

  const periodGroup = (list, label) => (list.length > 0 && (
    <div className="proj__subgroup">
      <span className="proj__sublabel">{label}</span>
      <div className="surface-map__group" role="group" aria-label={label}>
        {list.map((p) => {
          // Not published for the CURRENT scenario. Disabled rather than
          // hidden: a chip that vanishes when you change scenario reads as a
          // rendering fault, while a greyed one says "this combination does
          // not exist", which is the truth.
          const missing = !pairExists(scenario, p.value);
          return (
            <button
              key={p.value}
              type="button"
              className={`surface-map__chip surface-map__chip--sub${
                p.value === period ? ' is-active' : ''}`}
              onClick={() => onPeriod(p.value)}
              disabled={missing}
              title={missing
                ? `${p.label} is not published for this scenario`
                : undefined}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  ));

  return (
    <div className="surface-map__row proj">
      <div className="proj__subgroup">
        <span className="proj__sublabel">Layer</span>
        <div className="surface-map__group" role="group" aria-label="Layer">
          {layers.map((l) => {
            const on = layer
              && l.variable === layer.variable
              && l.statistic === layer.statistic;
            return (
              <button
                key={`${l.variable}/${l.statistic}`}
                type="button"
                className={`surface-map__chip${on ? ' is-active' : ''}`}
                onClick={() => onLayer({ variable: l.variable, statistic: l.statistic })}
              >
                {l.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="proj__subgroup">
        <span className="proj__sublabel">Emissions scenario</span>
        <div className="surface-map__group" role="group" aria-label="Emissions scenario">
          {scenarios.map((sc) => (
            <button
              key={sc.value}
              type="button"
              className={`surface-map__chip surface-map__chip--sub${
                sc.value === scenario ? ' is-active' : ''}`}
              onClick={() => onScenario(sc.value)}
              title={sc.detail}
            >
              {sc.label}
            </button>
          ))}
        </div>
      </div>

      {periodGroup(kinds.period, 'Period')}
      {periodGroup(kinds.warming, 'Warming level')}

      <div className="proj__subgroup">
        <span className="proj__sublabel">Season</span>
        <div className="surface-map__group" role="group" aria-label="Season">
          {seasons.map((se) => (
            <button
              key={se.value}
              type="button"
              className={`surface-map__chip surface-map__chip--sub${
                se.value === season ? ' is-active' : ''}`}
              onClick={() => onSeason(se.value)}
              title={se.detail}
            >
              {se.label}
            </button>
          ))}
        </div>
      </div>

      {/* FROM WHAT, TO WHAT, BY HOW MUCH.
          The map shows absolute values under a scenario, which is a number with
          nothing to measure itself against — 13.4 C means nothing unless you
          already know the region reads 10.3 today. So the baseline is stated
          FIRST, on its own row, and the change is derived beneath the pair
          rather than floating alone.

          EVERY FIGURE HERE IS A NATIONAL MEDIAN. `baseline_median` is the
          median of our own 1986-2005 normal over the whole country, not the
          value anywhere in particular, and a reader who takes it for their own
          region will be wrong by more than the change being shown. The label
          says so once, plainly, rather than hiding it in a tooltip. */}
      <div className="proj__readout">
        {loading && <span className="proj__pending">Loading…</span>}
        {!loading && step && (
          <>
            <button
              type="button"
              className={`proj__pair${onBaseline ? ' is-showing' : ''}`}
              onClick={() => onView?.('baseline')}
              disabled={!baselineStep || !onView}
              aria-pressed={onBaseline}
              title={baselineStep ? 'Draw the 1986-2005 normal' : undefined}
            >
              <span className="proj__pair-label">{baseline || '1986-2005'} normal</span>
              <span className="proj__pair-value">
                {formatValue(step.baseline_median, unit)}
              </span>
            </button>
            <button
              type="button"
              className={`proj__pair proj__pair--projected${
                onBaseline ? '' : ' is-showing'}`}
              onClick={() => onView?.('projected')}
              disabled={!onView}
              aria-pressed={!onBaseline}
              title="Draw the projection"
            >
              <span className="proj__pair-label">{periodLabel} · {scenarioLabel}</span>
              <span className="proj__pair-value">
                {formatValue(step.projected_median, unit)}
              </span>
            </button>
            <div className="proj__change">
              <strong className="proj__delta">{formatDelta(delta, unit)}</strong>
              {spread && (
                <span className="proj__spread">
                  {/* NOT a confidence interval. It is the range of the change
                      ACROSS THE COUNTRY, which is a different claim entirely —
                      the CMIP6 model spread is not carried by a multi-model
                      mean and we have not computed it. */}
                  {formatDelta(spread[0], unit)} to {formatDelta(spread[1], unit)}{' '}
                  across the country
                </span>
              )}
            </div>
            <span className="proj__basis">National medians</span>
          </>
        )}
        {!loading && !step && season && (
          <span className="proj__pending">
            No projection published for this combination.
          </span>
        )}
      </div>

      {/* A season the archive holds but that has no MEASURED display domain.
          Refusing to draw it is deliberate — the alternative is a
          plausible-looking map at an invented scale. */}
      {season && domain === null && (
        <p className="proj__note">
          <Info size={13} aria-hidden="true" />
          This season has no measured colour scale yet, so the map is not drawn.
        </p>
      )}

      {domain && domain.shared_with_measured === false && (
        <p className="proj__note">
          <Info size={13} aria-hidden="true" />
          This layer uses its own colour scale, not the measured Atlas scale —
          the two maps are not comparable by colour.
        </p>
      )}

      {source && <p className="proj__source">{source}</p>}
      {/* The baseline's OWN credit, separate from MfE's. It is our surface,
          reduced from our own published archive, and rendering it under
          someone else's licence notice would attribute our work to them. */}
      {baselineSource && baselineStep && (
        <p className="proj__source proj__source--ours">{baselineSource}</p>
      )}
    </div>
  );
}

/**
 * Decimals by magnitude, with one exception: a COUNT of days does not deserve
 * two. "7.80 days over 25 C" claims a hundredth of a day and reads as a
 * spreadsheet artefact; a temperature at 10.27 C genuinely needs both, because
 * the changes being shown beside it are of the order of one degree.
 */
function decimals(value, unit) {
  const n = Math.abs(value);
  if (unit === 'days') return n >= 100 ? 0 : 1;
  return n >= 100 ? 0 : n >= 10 ? 1 : 2;
}

/** An absolute reading, in the layer's unit. Never signed — it is a level. */
function formatValue(value, unit) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(decimals(n, unit))} ${unit}`;
}

/** Signed, in the layer's unit. Kept here so the readout and the spread agree. */
function formatDelta(value, unit) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}${Math.abs(n).toFixed(decimals(n, unit))} ${unit}`;
}

export default ProjectedControls;
