// components/climate/PropertyClimateHistory.jsx — one property's own climate
// record, inside the zone it belongs to.
//
// The accordion above this is REGIONAL: every property in a zone reads the same
// history. This is the property's own 500 m cell, 1986 to 2023, which is the
// thing the zone view cannot say. It replaces the "Property-level climate coming
// soon" placeholder that has sat in that card since 2026-05-30.
//
// ## The three states, and why none of them is an error
//
// A property with no climate site is the NORMAL case — most have none — so the
// API answers 200 with `available: false` and a reason, and this renders the
// reason plus the route to fixing it. A site still building says so. Only a
// failed extraction is a fault, and it shows the pipeline's own words. Same
// vocabulary as the Manage → Weather cell and Insights' My Site, deliberately:
// a customer looking at one point on three of our pages should not meet three
// accounts of its state.
//
// ## Lazy, per property
//
// A zone can hold a dozen properties and each one costs two queries over 456
// months of history. Nothing is fetched until the card is opened.
import { useState, useCallback, useEffect } from 'react';
import { ChevronDown, ChevronUp, Loader, AlertTriangle, Info } from 'lucide-react';
import { propertyService } from '@vineyard/shared';
import PropertySeasonChart from './PropertySeasonChart';
import PropertyMonthlyChart from './PropertyMonthlyChart';
import './PropertyCharts.css';

// The metrics worth charting, in the order a grower reads them. Mirrors
// `SITE_METRICS` in the Insights Pro service. `r99p` is absent because the API
// omits it per site and says why in `meta.omitted` — showing it computed a
// different way from the regional figure would compare methods, not places.
// `frost_days` is deliberately absent. Over a Sep-Apr season almost every frost
// IS a spring frost, so it and `early_frost_days` carry the same number in
// 2,095 of 2,880 site-seasons (73%) and differ only when one lands late in
// autumn. Two chips that mostly agree read as two findings; the spring count is
// the one a grower acts on, so it is the one kept.
//
// Both are still stored, and both remain REGIONAL-ONLY on this chart — the site
// value is withheld because the count is thresholded off a lapse-retrended Tmin
// field that inverts on exactly the nights that make it. See the standing note
// in the metric definitions.
const METRICS = [
  { key: 'gdd10', label: 'Growing degree days' },
  { key: 'tmean', label: 'Mean temperature' },
  { key: 'rain', label: 'Growing-season rainfall' },
  { key: 'early_frost_days', label: 'Spring frost days' },
  { key: 'last_spring_frost_doy', label: 'Last spring frost' },
  { key: 'hot_days_25', label: 'Days over 25' },
  { key: 'rx1day', label: 'Wettest day' },
];

// Temperature is a mean of monthly means; rainfall is a sum. The statistic is
// not the caller's choice — it belongs to the variable, and a mismatched pair is
// a band the site does not hold.
const VARIABLES = [
  { key: 'temp_mean', statistic: 'mean', label: 'Temperature' },
  { key: 'rainfall', statistic: 'sum', label: 'Rainfall' },
];

// The two charts are alternatives, not a sequence: one asks how seasons differ
// from each other, the other how months differ from their own normal.
const VIEWS = [
  { key: 'seasons', label: 'Season by season' },
  { key: 'monthly', label: 'Month by month' },
];

function PropertyClimateHistory({ property, embedded = false }) {
  // `embedded`: chosen by a pill upstream, so it opens immediately and renders
  // no header of its own. The accordion mode is kept for any caller that still
  // stacks several properties at once.
  const [open, setOpen] = useState(embedded);
  const [view, setView] = useState('seasons');
  const [seasons, setSeasons] = useState(null);
  const [monthly, setMonthly] = useState(null);
  const [metric, setMetric] = useState('gdd10');
  const [variable, setVariable] = useState('temp_mean');
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const loadSeasons = useCallback(() => {
    setLoading(true);
    setFailed(false);
    propertyService.getClimateSeasons(property.id)
      .then(setSeasons)
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [property.id]);

  // Month by month reloads on the variable chips; season by season does not,
  // because every metric arrives in one payload.
  const loadMonthly = useCallback((v) => {
    const spec = VARIABLES.find((x) => x.key === v) || VARIABLES[0];
    setMonthly(null);
    propertyService.getClimateMonthly(property.id, {
      variable: spec.key, statistic: spec.statistic,
    }).then(setMonthly).catch(() => setMonthly({ available: false,
      reason: 'Could not load this property’s monthly record.' }));
  }, [property.id]);

  // TWO EFFECTS, EACH KEYED ON WHAT ACTUALLY TRIGGERS IT — not one effect that
  // tests for null payloads. The single-effect version fired `monthly` twice on
  // every open: the seasons response re-rendered while the monthly request was
  // still in flight, `monthly` was still null, and the guard let it through
  // again. `open` and `variable` are the real triggers, and each fires once.
  useEffect(() => {
    if (open && seasons === null) loadSeasons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) loadMonthly(variable);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, variable]);

  const seriesFor = (key) =>
    (seasons?.series || []).find((s) => s.metric === key) || null;

  // Only offer a metric the payload actually carries.
  const available = METRICS.filter((m) => seriesFor(m.key));

  const unavailable = seasons && seasons.available === false ? seasons : null;

  return (
    <div className={`pch-card${open ? ' is-open' : ''}${embedded ? ' pch-card--embedded' : ''}`}>
      {!embedded && (
        <button type="button" className="pch-card-head"
                onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span className="pch-card-title">{property.name}</span>
          <span className="pch-card-cue">
            {open ? 'Hide' : 'Its own record'}
            {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </span>
        </button>
      )}

      {open && (
        <div className="pch-card-body">
          {loading && (
            <p className="pch-loading">
              <Loader size={15} className="pch-spin" /> Reading 1986&ndash;2023 at
              this property&rsquo;s point&hellip;
            </p>
          )}

          {failed && !loading && (
            <p className="pch-note">
              Could not load this property&rsquo;s climate record.{' '}
              <button type="button" className="pch-link" onClick={loadSeasons}>
                Try again
              </button>
            </p>
          )}

          {/* No site, still building, or a failed extraction. The reason is the
              server's, not a message invented here. */}
          {unavailable && (
            <div className="pch-absent" role="note">
              {unavailable.site?.status === 'failed'
                ? <AlertTriangle size={15} aria-hidden="true" />
                : <Info size={15} aria-hidden="true" />}
              <p>{unavailable.reason}</p>
            </div>
          )}

          {seasons?.available && (
            <>
              {/* One view at a time. Both charts stacked made the card taller
                  than a screen, and the second was found by scrolling past the
                  first rather than by choosing it. */}
              <div className="pch-views" role="group" aria-label="View">
                {VIEWS.map((v) => (
                  <button key={v.key} type="button"
                          className={`pch-view${view === v.key ? ' is-active' : ''}`}
                          onClick={() => setView(v.key)}>
                    {v.label}
                  </button>
                ))}
              </div>

              <p className="pch-baseline">
                <Info size={14} aria-hidden="true" />
                <span>
                  Its own 500 m cell, every season from 1986 to 2023. Typical
                  values are the <strong>1986&ndash;2005</strong> average — the
                  period the climate projections are measured from, and the only
                  one with a daily record.
                </span>
              </p>

              {view === 'seasons' && (
              <section className="pch-panel">
                <div className="pch-chips" role="group" aria-label="Metric">
                  {available.map((m) => (
                    <button key={m.key} type="button"
                            className={`pch-chip${m.key === metric ? ' is-active' : ''}`}
                            onClick={() => setMetric(m.key)}>
                      {m.label}
                    </button>
                  ))}
                </div>
                <PropertySeasonChart
                  series={seriesFor(metric)}
                  propertyName={property.name}
                  zoneName={seasons.site?.zone_name}
                />
                {seasons.meta?.omitted?.length > 0 && (
                  <p className="pch-note">
                    Not shown for a single property yet:{' '}
                    {seasons.meta.omitted.join(', ')}. {seasons.meta.omitted_reason}
                  </p>
                )}
              </section>
              )}

              {view === 'monthly' && (
              <section className="pch-panel">
                <div className="pch-chips" role="group" aria-label="Variable">
                  {VARIABLES.map((v) => (
                    <button key={v.key} type="button"
                            className={`pch-chip${v.key === variable ? ' is-active' : ''}`}
                            onClick={() => setVariable(v.key)}>
                      {v.label}
                    </button>
                  ))}
                </div>
                {monthly === null ? (
                  <p className="pch-loading"><Loader size={15} className="pch-spin" /> Loading&hellip;</p>
                ) : monthly.available === false ? (
                  <p className="pch-note">{monthly.reason}</p>
                ) : (
                  <PropertyMonthlyChart payload={monthly} />
                )}
              </section>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default PropertyClimateHistory;
