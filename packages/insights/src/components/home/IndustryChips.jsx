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
import { Grape, Apple, Cherry, Leaf, Sprout, Wheat } from 'lucide-react';
import { useCountryIndustry } from '../../contexts/CountryIndustryContext';
import './IndustryChips.css';

// The marketing site's contact form, same target as the footer's "Contact".
const CONTACT_URL = 'https://auxein.co.nz/contact/';

const SOON_TOOLTIP = 'Coming soon - get in touch to register your interest';

// The list now comes from the `industries` table (2026-08-24) — `is_active`
// there is what makes a chip live, so an industry launches by flipping a
// boolean rather than by shipping a bundle.
//
// Only the ICONS stay in the frontend, because a lucide component cannot be
// serialised into a database row. The table stores the export NAME and this
// maps it back. An unmapped icon falls through to Sprout rather than crashing,
// so seeding a new industry never white-screens the home page.
const ICONS = { Grape, Leaf, Apple, Cherry, Sprout, Wheat };
const FALLBACK_ICON = Sprout;

// The pre-2026-08-24 hardcoded list, kept as the render used while the registry
// request is in flight and if it fails outright. Without it the home hero and
// every region page lose their industry row on a slow or failed fetch, which
// looks like a bug rather than like loading.
const FALLBACK_INDUSTRIES = [
  { key: 'wine', name: 'Wine', icon: 'Grape', is_active: true },
  { key: 'kiwifruit', name: 'Kiwifruit', icon: 'Leaf', is_active: false },
  { key: 'apples', name: 'Apples', icon: 'Apple', is_active: false },
  { key: 'cherries', name: 'Cherries', icon: 'Cherry', is_active: false },
  { key: 'hops', name: 'Hops', icon: 'Sprout', is_active: false },
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
  const { industries } = useCountryIndustry();
  const list = industries.length ? industries : FALLBACK_INDUSTRIES;

  return (
    <div className={`industry-chips industry-chips--${variant}`}>
      {heading && <h3 className="industry-chips__heading">{heading}</h3>}

      <div className="industry-chips__row" role="list" aria-label="Industries">
        {list.map((row) => {
          const { key, is_active: available } = row;
          const label = row.name;
          const Icon = ICONS[row.icon] || FALLBACK_ICON;
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
