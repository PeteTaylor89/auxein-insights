// components/home/IndustryChips.jsx — which industries Insights covers.
//
// Wine is live; the rest are visibly pending. Insights is wine-only today, but
// the surfaces underneath are national and industry-agnostic, so saying so is
// more honest than implying wine is the whole product — and it sets the
// expectation that a kiwifruit grower should check back.
//
// The pending chips used to be inert announcements on the reasoning that a
// disabled-looking thing which responds is worse than one that does not. That
// changed 2026-08-20: a grower who sees their industry listed is a lead, and
// the chip is the only place on the page that knows it. They are now links to
// the contact form on the marketing site, with the tooltip carrying the
// invitation so the chip still reads as pending rather than available.
//
// The tooltip is hover/focus only, which means it never appears on touch — so
// the tap target must stand on its own. It does: the chip goes straight to the
// contact form, which is the same destination the tooltip advertises.
import { Grape, Apple, Cherry, Leaf, Sprout } from 'lucide-react';
import './IndustryChips.css';

// The marketing site's contact form, same target as the footer's "Contact".
const CONTACT_URL = 'https://auxein.co.nz/contact/';

const SOON_TOOLTIP = 'Coming soon - get in touch to register your interest';

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
        {INDUSTRIES.map(({ key, label, icon: Icon, available }) => {
          const content = (
            <>
              <Icon size={16} aria-hidden="true" />
              {label}
              {!available && variant === 'labelled' && (
                <span className="industry-chip__tag">Coming soon</span>
              )}
            </>
          );

          if (available) {
            return (
              <span key={key} role="listitem" className="industry-chip industry-chip--live">
                {content}
              </span>
            );
          }

          return (
            <span key={key} role="listitem" className="industry-chip__slot">
              <a
                href={CONTACT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="industry-chip industry-chip--soon"
                data-tooltip={SOON_TOOLTIP}
                // The visible label is just "Kiwifruit", which on its own reads
                // as a live filter. Screen readers get the full promise.
                aria-label={`${label} — ${SOON_TOOLTIP}`}
              >
                {content}
              </a>
              <span className="industry-chip__tooltip" role="tooltip" aria-hidden="true">
                {SOON_TOOLTIP}
              </span>
            </span>
          );
        })}
      </div>

      {showNote && variant === 'compact' && (
        <p className="industry-chips__note">More industries coming</p>
      )}
    </div>
  );
}

export default IndustryChips;
