// components/explore/RegionSelect.jsx — the region dropdown.
//
// Phase 4 of docs/plans/COUNTRY_INDUSTRY_REGIONS_2026-08-24.md.
//
// ALL ZONES ARE LISTED PLAINLY. Every one has a region page carrying climate
// history, projections and a description, and those pages are the site's
// strongest organic-search assets, so the list has always been complete.
//
// It used to also MARK the zones without a live season, read off
// `/public/realtime/zones` (the zones with `climate_zone_daily` rows). That tag
// came off on 2026-08-26 because it had stopped describing anything a visitor
// could see. It was measuring one table's coverage, not the page: Bannockburn
// was tagged "no live data" while serving disease pressure, and for an
// anonymous visitor the only block that actually differed was Recent
// conditions, which is behind a flag. Each block on the region page states its
// own reason — "the 2027 season starts on 1 September", "sign in to see this
// region's history" — which is more accurate than one tag on the picker could
// ever be, because it is the block's own answer rather than a proxy for it.
//
// The real fix is upstream and is being done separately: sampling the daily
// national surface at `climate_zone_cell_mask` gives all 23 zones a
// `climate_zone_daily` record, at which point the distinction disappears.
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

function RegionSelect({ zones, currentSlug, loading }) {
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
                  {shown.map((z) => (
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
                    </button>
                  ))}
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
