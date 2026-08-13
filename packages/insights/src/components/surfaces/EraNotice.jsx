// components/surfaces/EraNotice.jsx — flag a series that spans resolutions.
//
// PLATFORM_PLAN_2026-08-02, honesty requirements: "never silently mix 5 km
// history with 500 m new data in one chart". A series legitimately can span
// them — the historical archive is coarser than the modern surfaces — but the
// step change between eras is an artefact of the method, not of the climate,
// and a trend line drawn through it is measuring our own pipeline.
//
// This component does not prevent the mixing. It makes it visible.
import { Info } from 'lucide-react';
import './EraNotice.css';

/** Distinct resolution_m values present in a set of §5.1 series. */
export function resolutionsIn(series = []) {
  const found = new Set();
  series.forEach((s) => (s.points || []).forEach((p) => {
    if (p?.resolution_m != null && p.value != null) found.add(p.resolution_m);
  }));
  return [...found].sort((a, b) => a - b);
}

function label(m) {
  return m >= 1000 ? `${m / 1000} km` : `${m} m`;
}

/**
 * @param {Array}  series      §5.1 series array
 * @param {string} className
 */
function EraNotice({ series = [], className = '' }) {
  const resolutions = resolutionsIn(series);
  if (resolutions.length < 2) return null;

  return (
    <div className={`era-notice ${className}`} role="note">
      <Info size={15} className="era-notice__icon" aria-hidden="true" />
      <span>
        This series mixes grid resolutions ({resolutions.map(label).join(' and ')}).
        Coarser eras smooth local detail, so part of any step between them is the
        method rather than the weather.
      </span>
    </div>
  );
}

export default EraNotice;
