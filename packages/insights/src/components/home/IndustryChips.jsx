// components/home/IndustryChips.jsx — which industries Insights covers.
//
// Wine is live; the rest are visibly pending. Insights is wine-only today, but
// the surfaces underneath are national and industry-agnostic, so saying so is
// more honest than implying wine is the whole product — and it sets the
// expectation that a kiwifruit grower should check back.
//
// The pending chips are NOT controls. No pointer, no hover, no click handler:
// a disabled-looking thing that navigates is worse than no thing at all.
import { Grape, Apple, Cherry, Leaf, Sprout } from 'lucide-react';
import './IndustryChips.css';

export const INDUSTRIES = [
  { key: 'wine', label: 'Wine', icon: Grape, available: true },
  { key: 'kiwifruit', label: 'Kiwifruit', icon: Leaf, available: false },
  { key: 'apples', label: 'Apples', icon: Apple, available: false },
  { key: 'cherries', label: 'Cherries', icon: Cherry, available: false },
  { key: 'hops', label: 'Hops', icon: Sprout, available: false },
];

/**
 * @param {'compact'|'labelled'} variant
 *        compact  — chips only, with a single note underneath (home hero)
 *        labelled — each pending chip carries its own "Coming soon" tag, for
 *                   places where the chips stand alone and the note would be
 *                   too far from what it explains (region pages)
 * @param {boolean} showNote
 */
function IndustryChips({ variant = 'compact', showNote = true, heading }) {
  return (
    <div className={`industry-chips industry-chips--${variant}`}>
      {heading && <h3 className="industry-chips__heading">{heading}</h3>}

      <div className="industry-chips__row" role="list" aria-label="Industries">
        {INDUSTRIES.map(({ key, label, icon: Icon, available }) => (
          <span
            key={key}
            role="listitem"
            className={`industry-chip ${available ? 'industry-chip--live' : 'industry-chip--soon'}`}
            aria-disabled={available ? undefined : 'true'}
          >
            <Icon size={16} aria-hidden="true" />
            {label}
            {!available && variant === 'labelled' && (
              <span className="industry-chip__tag">Coming soon</span>
            )}
          </span>
        ))}
      </div>

      {showNote && variant === 'compact' && (
        <p className="industry-chips__note">More industries coming</p>
      )}
    </div>
  );
}

export default IndustryChips;
