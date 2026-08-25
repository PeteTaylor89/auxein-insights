// components/explore/IndustryPills.jsx — the industry axis of the page scope.
//
// Phase 4 of docs/plans/COUNTRY_INDUSTRY_REGIONS_2026-08-24.md.
//
// NOT THE SAME COMPONENT AS `home/IndustryChips`, and the difference is the
// point. Chips are a marketing row: "here is what Insights covers", and a
// pending one links to the contact form. Pills are a CONTROL — the active one
// determines which regions and which models the page below is showing, so it
// has to navigate, carry selected state, and be reachable from a keyboard as a
// tab-like group.
//
// Both read the same `industries` table, so they cannot disagree about what is
// live. Only wine is active today.
//
// Switching industry drops any region slug on purpose: a wine "Marlborough" and
// a kiwifruit "Bay of Plenty" are different zone rows with different polygons,
// so carrying a slug across industries would 404 about as often as it worked.
import { useNavigate } from 'react-router-dom';
import { Grape, Apple, Cherry, Leaf, Sprout, Wheat } from 'lucide-react';
import { useCountryIndustry, scopePath } from '../../contexts/CountryIndustryContext';
import './explore.css';

// A lucide component cannot be stored in a database row, so the table holds the
// export NAME and this maps it back. An unmapped icon falls through rather than
// white-screening the page the moment someone seeds a new industry.
const ICONS = { Grape, Leaf, Apple, Cherry, Sprout, Wheat };
const FALLBACK_ICON = Sprout;

/**
 * @param {string}   [value]     override the active key (unscoped pages)
 * @param {Function} [onSelect]  called with the key INSTEAD of navigating
 *
 * The home page is deliberately unscoped — `/` has no country or industry in
 * the URL and must not gain one, because a redirect there would drop the
 * `#insights_sso=` fragment Grow opens the site with. So it drives the pills
 * with local state via `value`/`onSelect`, and only a region click navigates
 * to a real scoped URL. Everywhere else the pills read the scope from the URL
 * and navigate, which is the normal case and stays the default.
 */
function IndustryPills({ value, onSelect }) {
  const { industries, industry: scopedIndustry, country, loading } =
    useCountryIndustry();
  const industry = value || scopedIndustry;
  const navigate = useNavigate();

  // Nothing to render before the registry lands. A single wine pill flashing in
  // is worse than the row appearing complete.
  if (loading && !industries.length) {
    return <div className="pills pills--loading" aria-hidden="true" />;
  }
  if (!industries.length) return null;

  return (
    <div className="pills" role="tablist" aria-label="Industry">
      {industries.map((row) => {
        const Icon = ICONS[row.icon] || FALLBACK_ICON;
        const current = row.key === industry;
        const live = row.is_active;
        return (
          <button
            key={row.key}
            type="button"
            role="tab"
            aria-selected={current}
            // A pending industry is reachable — its page explains itself and is
            // a real destination — but it is not presented as equivalent.
            className={`pill${current ? ' pill--on' : ''}${live ? '' : ' pill--pending'}`}
            onClick={() => {
              if (current) return;
              if (onSelect) { onSelect(row.key); return; }
              navigate(scopePath(country, row.key));
            }}
          >
            <Icon size={16} aria-hidden="true" />
            <span>{row.name}</span>
            {!live && <span className="pill__tag">Soon</span>}
          </button>
        );
      })}
    </div>
  );
}

export default IndustryPills;
