// components/explore/RegionSelect.jsx — the region dropdown.
//
// Phase 4 of docs/plans/COUNTRY_INDUSTRY_REGIONS_2026-08-24.md.
//
// COVERAGE IS THE WHOLE DESIGN PROBLEM. Thirteen of 23 zones have a live season
// and ten do not, so a plain list of 23 sends a third of visitors to a page of
// explanations. The alternative — listing only the 13 — is worse: those region
// pages are the site's strongest organic-search assets and they still carry
// climate history, projections and a description. So all 23 are listed and the
// uncovered ones are MARKED, which is the only version that is both complete
// and honest.
//
// Grouping and order come from the database. `wine_regions.display_order` runs
// north to south and `climate_zones.display_order` encodes region rank times
// 100 plus position within it, so a single sort reproduces the hierarchy — see
// the `zone_order_global` migration. The first zone in each region is its
// region-level zone; that is what position 0 means, and it becomes the group
// header rather than a sibling of its own sub-zones.
//
// Mobile-native: 48px control, 44px rows, the open list is capped and scrolls
// rather than pushing the page, and nothing depends on hover.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, MapPin, Search } from 'lucide-react';
import { useCountryIndustry } from '../../contexts/CountryIndustryContext';
import './explore.css';

function groupByRegion(zones) {
  const groups = [];
  const byName = new Map();
  zones.forEach((z) => {
    const key = z.region_name || 'Other';
    if (!byName.has(key)) {
      const g = { name: key, zones: [] };
      byName.set(key, g);
      groups.push(g);
    }
    byName.get(key).zones.push(z);
  });
  return groups;
}

function RegionSelect({ zones, covered, currentSlug, loading }) {
  const { path } = useCountryIndustry();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    // Focus search on open, but only where a keyboard is likely — focusing an
    // input on touch raises the keyboard over the list you just opened.
    if (window.innerWidth > 768) searchRef.current?.focus();
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Groups are built from the FULL list, never the filtered one — deriving them
  // from a filtered list would promote whichever sub-zone happened to match.
  const groups = useMemo(() => groupByRegion(zones), [zones]);
  const q = query.trim().toLowerCase();
  const matches = (z) => !q || z.name.toLowerCase().includes(q)
    || (z.region_name || '').toLowerCase().includes(q);

  const current = zones.find((z) => z.slug === currentSlug);
  const label = current ? current.name
    : (loading ? 'Loading regions…' : 'Choose a region');

  const go = (slug) => {
    setOpen(false);
    setQuery('');
    navigate(path(slug));
  };

  return (
    <div className="regionsel" ref={ref}>
      <button
        type="button"
        className="regionsel__button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={loading && !zones.length}
        onClick={() => setOpen((v) => !v)}
      >
        <MapPin size={17} aria-hidden="true" />
        <span className="regionsel__label">{label}</span>
        <ChevronDown size={17} aria-hidden="true"
                     className={open ? 'regionsel__chev--open' : ''} />
      </button>

      {open && (
        <div className="regionsel__menu">
          <div className="regionsel__search">
            <Search size={15} aria-hidden="true" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              placeholder="Search regions"
              aria-label="Search regions"
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <ul className="regionsel__list" role="listbox" aria-label="Regions">
            {groups.map((g) => {
              const shown = g.zones.filter(matches);
              if (!shown.length) return null;
              return (
                <li key={g.name} className="regionsel__group">
                  <div className="regionsel__group-name">{g.name}</div>
                  {shown.map((z) => {
                    // `covered` is the set with a live season. A zone missing
                    // from it still has history and projections, so it is
                    // navigable — it just says what it has.
                    const hasLive = covered.has(z.slug);
                    return (
                      <button
                        key={z.slug}
                        type="button"
                        role="option"
                        aria-selected={z.slug === currentSlug}
                        className={`regionsel__item${
                          z.slug === currentSlug ? ' regionsel__item--on' : ''}`}
                        onClick={() => go(z.slug)}
                      >
                        <span>{z.name}</span>
                        {!hasLive && (
                          <span className="regionsel__tag"
                                title="History and projections only — no live season data">
                            no live data
                          </span>
                        )}
                      </button>
                    );
                  })}
                </li>
              );
            })}
            {!groups.some((g) => g.zones.some(matches)) && (
              <li className="regionsel__empty">No region matches “{query}”.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export default RegionSelect;
