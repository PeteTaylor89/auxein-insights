import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchZoneSeason, isSurfacesUnavailable } from '../../services/surfaceService';
import './ZoneOverviewCard.css';
import { useCountryIndustry } from '../../contexts/CountryIndustryContext';

// The headline set for a zone click. Deliberately small — this is a stepping
// stone to the region page, not a dashboard.
const METRICS = ['gdd10', 'tmean', 'rain', 'frost_days'];

const LABELS = {
  gdd10: 'Growing degree days',
  tmean: 'Mean temperature',
  rain: 'Rainfall',
  frost_days: 'Frost days',
};

// Long-term window used for the "vs usual" comparison. Ends in 2016 so the
// recent seasons being compared are not also inside the baseline.
const BASE_FROM = 1987;
const BASE_TO = 2016;

function format(metric, value) {
  if (value == null || !Number.isFinite(value)) return '--';
  if (metric === 'tmean') return `${value.toFixed(1)}°C`;
  if (metric === 'rain') return `${Math.round(value)} mm`;
  if (metric === 'gdd10') return Math.round(value).toLocaleString();
  return value.toFixed(1);
}

/**
 * @param {number|null} vintage  the season the MAP is showing. The card follows
 *   it: opening a zone while the Atlas is on 2014 must summarise 2014. A card
 *   that always showed the newest season would silently contradict the surface
 *   it was opened from, and the contradiction is invisible — both numbers look
 *   plausible. When the requested vintage is not published the card falls back
 *   to the newest and SAYS which one it is showing.
 */
function ZoneOverviewCard({ zone, vintage, onClose }) {
  // Region links carry the current (country, industry) scope. Outside a
  // scoped route this falls back to the visitor's last scope, then to
  // New Zealand wine — so no link has to bounce through the /regions redirect.
  const { path } = useCountryIndustry();

  const [data, setData] = useState(null);
  const [state, setState] = useState('loading');

  useEffect(() => {
    if (!zone?.slug) return undefined;
    let live = true;
    setState('loading');
    fetchZoneSeason(zone.slug, METRICS)
      .then((res) => {
        if (!live) return;
        setData(res);
        setState('ready');
      })
      .catch((err) => {
        if (!live) return;
        setState(isSurfacesUnavailable(err) ? 'unavailable' : 'error');
      });
    return () => { live = false; };
  }, [zone?.slug]);

  if (!zone) return null;

  const series = data?.series ?? [];
  const shown = series.reduce((acc, s) => {
    const points = s.points ?? [];
    if (!points.length) return acc;
    const wanted = vintage != null
      ? points.find((p) => p.vintage_year === vintage)
      : null;
    const last = wanted || points[points.length - 1];
    const baseline = points.filter(
      (p) => p.vintage_year >= BASE_FROM && p.vintage_year <= BASE_TO && p.mean != null,
    );
    const base = baseline.length
      ? baseline.reduce((sum, p) => sum + p.mean, 0) / baseline.length
      : null;
    acc[s.metric] = { last, base, unit: s.unit };
    return acc;
  }, {});

  // What is actually on the card, which is not always what was asked for — the
  // zone season table ends before the monthly surfaces do.
  const shownVintage = Object.values(shown)[0]?.last?.vintage_year ?? null;
  const missedVintage =
    vintage != null && shownVintage != null && shownVintage !== vintage;

  return (
    <aside className="zone-card" aria-label={`${zone.name} overview`}>
      <div className="zone-card__head">
        <div>
          <h3 className="zone-card__title">{zone.name}</h3>
          <p className="zone-card__sub">
            {shownVintage
              ? `${shownVintage - 1}/${String(shownVintage).slice(2)} season`
              : 'Growing season'}
            {zone.planted_ha ? ` · ${Math.round(zone.planted_ha).toLocaleString()} ha planted` : ''}
          </p>
        </div>
        <button type="button" className="zone-card__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      {state === 'loading' && <p className="zone-card__note">Loading…</p>}
      {state === 'unavailable' && <p className="zone-card__note">Zone statistics are not available.</p>}
      {state === 'error' && <p className="zone-card__note">Could not load this zone.</p>}

      {state === 'ready' && (
        <>
          <dl className="zone-card__stats">
            {METRICS.map((metric) => {
              const entry = shown[metric];
              if (!entry) return null;
              const delta = entry.base != null && entry.last?.mean != null
                ? entry.last.mean - entry.base
                : null;
              return (
                <div key={metric} className="zone-card__stat">
                  <dt>{LABELS[metric]}</dt>
                  <dd>
                    {format(metric, entry.last?.mean)}
                    {delta != null && (
                      <span className={`zone-card__delta${delta >= 0 ? ' is-up' : ' is-down'}`}>
                        {delta >= 0 ? '+' : '−'}{format(metric, Math.abs(delta))} vs {BASE_FROM}–{BASE_TO}
                      </span>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>

          {/* The range across real vineyards is the honest companion to the
              mean — a zone number without it implies a uniformity that a zone
              spanning 3.4 degC does not have. */}
          {shown.tmean?.last?.min != null && shown.tmean?.last?.max != null && (
            <p className="zone-card__spread">
              Across vineyards in this zone: {shown.tmean.last.min.toFixed(1)}°C to{' '}
              {shown.tmean.last.max.toFixed(1)}°C
            </p>
          )}

          {/* Say it rather than quietly showing a different year from the map. */}
          {missedVintage && (
            <p className="zone-card__note">
              The {vintage} season is not published yet — showing {shownVintage}.
            </p>
          )}

          <Link className="zone-card__cta" to={path(zone.slug)}>
            Explore {zone.name} →
          </Link>
        </>
      )}
    </aside>
  );
}

export default ZoneOverviewCard;
