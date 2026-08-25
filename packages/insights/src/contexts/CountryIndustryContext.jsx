// contexts/CountryIndustryContext.jsx — which country and industry the site is
// currently showing.
//
// Phase 2 of docs/plans/COUNTRY_INDUSTRY_REGIONS_2026-08-24.md.
//
// THE SCOPE COMES FROM THE URL, NEVER FROM STATE.
// This is the load-bearing rule. `/nz/wine/marlborough` must render the same
// page for a crawler, for a cold-loaded bookmark and for someone who navigated
// in — so the country and industry are route params, and this context only
// reads them. If the scope lived in state, every region page would be one URL
// serving several different pages, which splits crawl equity and makes the
// strongest organic-search assets on the site unlinkable.
//
// localStorage holds a LINK HINT and nothing else: where to point region links
// that are rendered outside a scoped route. It is never used to redirect. `/`
// in particular is left alone — a redirect there would drop the
// `#insights_sso=` fragment Grow opens the site with, and would put a hop on
// the highest-value URL on the domain. A URL always wins over the hint.
//
// Anything outside a scoped route (the landing page, /articles, /about) gets
// the defaults, so nothing has to be scope-aware before it is ready to be.
import {
  createContext, useContext, useEffect, useMemo, useState,
} from 'react';
import { useParams } from 'react-router-dom';
import { getCountries, getIndustries } from '../services/taxonomyService';

// New Zealand wine is not a "sensible default" — it is the entire contents of
// the database. Any other choice would be a silent behaviour change for every
// existing page. Mirrors DEFAULT_COUNTRY / DEFAULT_INDUSTRY in backend/core/scope.py.
export const DEFAULT_COUNTRY = 'nz';
export const DEFAULT_INDUSTRY = 'wine';

const HINT_KEY = 'insights_scope_hint';

const CountryIndustryContext = createContext(null);

/** Read the remembered scope. Returns null when there is nothing usable. */
export function readScopeHint() {
  try {
    const raw = localStorage.getItem(HINT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.country || !parsed?.industry) return null;
    return { country: String(parsed.country), industry: String(parsed.industry) };
  } catch {
    // Private mode, cleared storage, or something else wrote garbage here.
    // A missing hint just means "use the defaults", which is always correct.
    return null;
  }
}

function writeScopeHint(country, industry) {
  try {
    localStorage.setItem(HINT_KEY, JSON.stringify({ country, industry }));
  } catch {
    // Non-fatal by design: the hint is a convenience, not state.
  }
}

/** `/nz/wine` — the scoped root, used for links and redirects. */
export function scopePath(country, industry, rest = '') {
  const suffix = rest ? (rest.startsWith('/') ? rest : `/${rest}`) : '';
  return `/${country}/${industry}${suffix}`;
}

export function CountryIndustryProvider({ children }) {
  // Present only inside a scoped route; undefined everywhere else.
  const { country: countryParam, industry: industryParam } = useParams();

  const country = (countryParam || DEFAULT_COUNTRY).toLowerCase();
  const industry = (industryParam || DEFAULT_INDUSTRY).toLowerCase();

  const [countries, setCountries] = useState([]);
  const [industries, setIndustries] = useState([]);
  const [loading, setLoading] = useState(true);

  // The registries are small, change rarely and are needed by the switcher, the
  // pills and the scope validity check, so they are fetched once for the app
  // rather than per page. A failure is non-fatal: `known` falls back to true so
  // a registry outage degrades to "render the page" rather than to a 404 storm.
  useEffect(() => {
    let cancelled = false;
    Promise.all([getCountries(), getIndustries()])
      .then(([c, i]) => {
        if (cancelled) return;
        setCountries(c?.countries || []);
        setIndustries(i?.industries || []);
      })
      .catch(() => { /* handled by the `known` fallback below */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Remember only a scope that came from the URL. Writing the defaults would
  // pin every first-time visitor to New Zealand wine before they had chosen
  // anything, which is indistinguishable from the hint doing nothing.
  useEffect(() => {
    if (countryParam && industryParam) writeScopeHint(country, industry);
  }, [countryParam, industryParam, country, industry]);

  const value = useMemo(() => {
    // ISO3 is accepted as an alias so `/aus/wine` resolves instead of 404ing.
    // It is NOT a second address for the page: `canonical` is false for it and
    // ScopedLayout redirects, so search sees one URL per scope.
    const countryRow = countries.find(
      (c) => c.iso2.toLowerCase() === country
          || (c.iso3 || '').toLowerCase() === country) || null;
    const canonicalCountry = countryRow ? countryRow.iso2.toLowerCase() : country;
    const industryRow = industries.find(
      (i) => i.key.toLowerCase() === industry) || null;

    // Until the registries load, treat the scope as known. Rendering a page
    // that turns out to be a 404 for one frame is a far smaller failure than
    // flashing "not found" on every valid page during a cold load.
    const known = loading || (!!countryRow && !!industryRow);
    const active = !!countryRow?.is_active && !!industryRow?.is_active;

    return {
      // The scope itself
      country,
      industry,
      countryRow,
      industryRow,
      isScoped: !!(countryParam && industryParam),

      // The address this scope SHOULD be at. Differs from `country` only when
      // the URL used an ISO3 alias.
      canonicalCountry,
      canonical: canonicalCountry === country,

      // Registries, for the switcher and the pills
      countries,
      industries,
      activeCountries: countries.filter((c) => c.is_active),
      activeIndustries: industries.filter((i) => i.is_active),
      loading,

      // Validity. `known` false means 404. `active` false means "coming soon",
      // which is a real page: Australia should rank before it has data.
      known,
      active,

      // Display. `countryName` is what the copy sweep uses in place of the
      // string "New Zealand", so a page reads correctly for any scope.
      countryName: countryRow?.name || 'New Zealand',
      industryName: industryRow?.name || 'Wine',

      // Season conventions. The client formats vintage labels ("2025-26") and
      // axis ranges from these; without them it re-derives a Southern
      // Hemisphere convention it has no business knowing.
      hemisphere: countryRow?.hemisphere || 'S',
      vintageStartMonth: countryRow?.vintage_start_month ?? 7,
      seasonStartMonth: countryRow?.season_start_month ?? 9,
      timezone: countryRow?.default_timezone || 'Pacific/Auckland',

      // Link helper, so no component has to know the URL grammar.
      path: (rest) => scopePath(country, industry, rest),
    };
  }, [country, industry, countryParam, industryParam, countries, industries, loading]);

  return (
    <CountryIndustryContext.Provider value={value}>
      {children}
    </CountryIndustryContext.Provider>
  );
}

/**
 * The current (country, industry) scope.
 *
 * Safe to call outside a provider — returns the defaults — so a component can
 * be scope-aware without forcing every page that renders it to be scoped.
 */
export function useCountryIndustry() {
  const ctx = useContext(CountryIndustryContext);

  // Outside a scoped route — the landing page, /articles, the footer. Fall back
  // to the scope this visitor last used so that links OFF an unscoped page land
  // where they expect, then to New Zealand wine.
  //
  // This is the whole reason `path()` lives on the context rather than being a
  // free function: every internal link to a region gets the right scope by
  // construction, and none of them has to know the URL grammar or bounce
  // through the /regions redirect.
  //
  // MEMOISED, and that is not a micro-optimisation. An unmemoised fallback
  // returns a NEW `path` identity on every render, so the first component to
  // put `path` in a dependency array would re-run its effect forever. The
  // provider's value is already memoised; this makes the two behave alike, so
  // a component cannot tell whether it is inside a scoped route or not.
  const hint = ctx ? null : readScopeHint();
  const fallbackCountry = hint?.country || DEFAULT_COUNTRY;
  const fallbackIndustry = hint?.industry || DEFAULT_INDUSTRY;

  const fallback = useMemo(() => ({
    country: fallbackCountry,
    industry: fallbackIndustry,
    countryRow: null,
    industryRow: null,
    isScoped: false,
    // Nothing outside a scoped route can be at an alias, so it is always
    // canonical. Present so a consumer never reads undefined and redirects.
    canonicalCountry: fallbackCountry,
    canonical: true,
    countries: [],
    industries: [],
    activeCountries: [],
    activeIndustries: [],
    loading: false,
    known: true,
    active: true,
    countryName: 'New Zealand',
    industryName: 'Wine',
    hemisphere: 'S',
    vintageStartMonth: 7,
    seasonStartMonth: 9,
    timezone: 'Pacific/Auckland',
    path: (rest) => scopePath(fallbackCountry, fallbackIndustry, rest),
  }), [fallbackCountry, fallbackIndustry]);

  return ctx || fallback;
}

export default CountryIndustryContext;
