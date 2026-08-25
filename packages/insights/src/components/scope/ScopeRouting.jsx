// components/scope/ScopeRouting.jsx — the /{country}/{industry}/... route shell
// and the redirects from the old /regions paths.
//
// Phase 2 of docs/plans/COUNTRY_INDUSTRY_REGIONS_2026-08-24.md.
//
// WHY THE URLS MOVED AT ALL
// `/regions` and `/regions/:slug` were built on 2026-08-13 and have never been
// published — the live bundle is still dated 2026-08-11. They have never been
// crawled, so restructuring them costs nothing today and would cost redirect
// debt on every one of the site's strongest organic-search URLs tomorrow. This
// was the last moment it was free.
//
// ROUTE RANKING, which is what makes a bare `/:country/:industry` safe
// React Router ranks a static segment above a dynamic one, so `/articles/foo`
// still matches `/articles/:slug` and never `/:country/:industry`. The dynamic
// pair only catches what nothing else claimed. Anything that reaches it and is
// not a real scope becomes a 404 below — which is correct, and is why the guard
// cannot be skipped.
import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import {
  CountryIndustryProvider,
  DEFAULT_COUNTRY,
  DEFAULT_INDUSTRY,
  readScopeHint,
  scopePath,
  useCountryIndustry,
} from '../../contexts/CountryIndustryContext';
import NotFound from '../../pages/NotFound';

/**
 * Turns an unknown scope into a 404 and lets a known-but-inactive one through.
 *
 * The distinction matters. `/xx/wine` is a genuinely missing page. `/au/wine`
 * is a real place we intend to cover, and the right answer is a page that says
 * so and can rank — not a hole. Pages decide how to render an inactive scope;
 * this guard only refuses the unknown.
 *
 * While the registries are loading `known` is true, so a cold load renders the
 * page rather than flashing "not found" on every valid URL.
 */
function ScopeGuard({ children }) {
  const { known, canonical, canonicalCountry, industry } = useCountryIndustry();
  const { slug } = useParams();
  const location = useLocation();

  if (!known) return <NotFound />;

  // `/aus/wine/...` -> `/au/wine/...`. The ISO3 form is accepted so a guessable
  // URL does not 404, but it must not become a second indexable address for
  // the same page. `replace` keeps the alias out of history, and the query
  // string travels because `?view=` deep links have to survive it.
  if (!canonical) {
    return (
      <Navigate
        replace
        to={scopePath(canonicalCountry, industry, slug) + location.search}
      />
    );
  }

  return children;
}

/** The element for `/:country/:industry`. Everything scoped renders inside it. */
export function ScopedLayout() {
  return (
    <CountryIndustryProvider>
      <ScopeGuard>
        <Outlet />
      </ScopeGuard>
    </CountryIndustryProvider>
  );
}

/**
 * `/regions` -> `/nz/wine` (or wherever this visitor last was).
 *
 * `replace` so the dead URL does not sit in history behind the real one. The
 * remembered scope is consulted here and NOT on `/`: redirecting the landing
 * page would drop the `#insights_sso=` fragment that Grow opens the site with,
 * and would put a redirect on the highest-value URL on the domain.
 */
export function LegacyRegionsRedirect() {
  const hint = readScopeHint();
  return (
    <Navigate
      replace
      to={scopePath(hint?.country || DEFAULT_COUNTRY,
                    hint?.industry || DEFAULT_INDUSTRY)}
    />
  );
}

/**
 * `/regions/:slug` -> `/nz/wine/:slug`, preserving `?view=` deep links.
 *
 * Those query strings are live in `ClimateZonePanel` and in email that has
 * already been sent, so they have to survive two redirects now rather than one.
 */
export function LegacyRegionDetailRedirect() {
  const { slug } = useParams();
  const hint = readScopeHint();
  const search = typeof window !== 'undefined' ? window.location.search : '';
  return (
    <Navigate
      replace
      to={scopePath(hint?.country || DEFAULT_COUNTRY,
                    hint?.industry || DEFAULT_INDUSTRY,
                    slug) + search}
    />
  );
}
