// components/surfaces/ConfidenceBadge.jsx — the honest number beside every value.
//
// First-class, not an admin afterthought (PLATFORM_PLAN_2026-08-02 §5.3). It is
// the differentiator: anyone can draw a coloured map, almost nobody says how
// wrong it might be.
//
// What the numbers mean (SURFACE_CONTRACT_V2 §3.3, §3.4):
//   cv_rmse        shuffled 10-fold cross-validated error for the whole
//                  surface. Honest and always available. THIS is what we publish.
//   expected_error error banded by how isolated this particular point is —
//                  1.10 degC within 5 km of a station, 2.04 beyond 80 km. A
//                  single national number is a lie at both ends, so prefer this
//                  when it is present.
//   t_rmse/n_test  declustered holdout. Only meaningful when n_test >= 10; the
//                  holdout only exists where near-colocated stations happen to
//                  exist, so it is a fit-stabilisation device first and a test
//                  set only opportunistically. Suppressed below the threshold
//                  rather than shown small — a confident-looking 0.11 from
//                  n_test=2 is worse than saying nothing.
//
// NEVER render the in-sample `rmse` here. At the CV-selected smoothing the
// spline near-interpolates its own training points, giving 0.002-0.24 degC.
// It is not accuracy and publishing it would be dishonest.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import './ConfidenceBadge.css';

// n_test below this and the holdout figure is noise, not evidence. Contract §3.3.
const MIN_N_TEST = 10;

function fmt(v, digits = 2) {
  return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : null;
}

/**
 * @param {object}  confidence  the `confidence` block from a §5.1 point
 * @param {string}  unit        'C' | 'mm' | '%'
 * @param {boolean} synthetic   stub-generated value; must be visible, never hidden
 * @param {'inline'|'block'} variant
 */
function ConfidenceBadge({ confidence, unit = 'C', synthetic = false, variant = 'inline' }) {
  const [open, setOpen] = useState(false);
  if (!confidence && !synthetic) return null;

  const { cv_rmse, expected_error, distance_to_nearest_station_km, t_rmse, n_test } =
    confidence || {};

  // Prefer the banded figure — it describes THIS point rather than the average
  // of every point on the surface.
  const headline = fmt(expected_error) ?? fmt(cv_rmse);
  const isBanded = fmt(expected_error) != null;
  const holdoutUsable = typeof n_test === 'number' && n_test >= MIN_N_TEST && fmt(t_rmse) != null;

  if (!headline && !synthetic) return null;

  return (
    <span className={`confidence-badge confidence-badge--${variant}`}>
      {synthetic && (
        <span className="confidence-badge__synthetic" title="Modelled placeholder, not a measurement">
          demo data
        </span>
      )}

      {headline && (
        <button
          type="button"
          className="confidence-badge__chip"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          title={isBanded ? 'Expected error at this location' : 'Surface-wide cross-validated error'}
        >
          ±{headline}{unit === 'C' ? '°C' : ` ${unit}`}
        </button>
      )}

      {open && (
        <span className="confidence-badge__detail" role="note">
          <span className="confidence-badge__row">
            <strong>±{headline}{unit === 'C' ? '°C' : ` ${unit}`}</strong>{' '}
            {isBanded ? 'expected error here' : 'cross-validated error'}
          </span>

          {isBanded && distance_to_nearest_station_km != null && (
            <span className="confidence-badge__row">
              {fmt(distance_to_nearest_station_km, 1)} km to the nearest weather station.
              {distance_to_nearest_station_km > 80 && (
                <> Beyond 80 km the surface also runs about 0.6°C cold.</>
              )}
            </span>
          )}

          {isBanded && fmt(cv_rmse) && (
            <span className="confidence-badge__row confidence-badge__row--muted">
              Surface-wide: ±{fmt(cv_rmse)}{unit === 'C' ? '°C' : ` ${unit}`}
            </span>
          )}

          {holdoutUsable && (
            <span className="confidence-badge__row confidence-badge__row--muted">
              Independent check: ±{fmt(t_rmse)} over {n_test} held-out stations
            </span>
          )}

          <Link to="/methodology" className="confidence-badge__link">
            How this is measured
          </Link>
        </span>
      )}
    </span>
  );
}

export default ConfidenceBadge;
