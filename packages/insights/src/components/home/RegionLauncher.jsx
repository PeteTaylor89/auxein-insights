// components/home/RegionLauncher.jsx — the entry point into regional data.
//
// Sits under the stat strip in the hero's left column, so the left side reads
// "here is what is happening / here is how to look it up" against the map on
// the right.
//
// Clicking reveals the regions inline and picking one navigates straight to
// /regions/:slug, which renders with that region already selected — one step,
// no intermediate index page, and the destination is still a real shareable
// URL rather than modal state.
//
// The industry row is a deliberate placeholder. Insights is wine-only today,
// but the surfaces underneath are national and industry-agnostic. Showing the
// others as visibly pending is more honest than implying wine is the whole
// product.
//
// GROUPING (2026-08-20)
// The list is 23 zones across 10 wine regions, and it used to render flat in
// whatever order the server returned — which was insertion order, so South
// Coast sat under Central Otago rather than with the rest of Marlborough. The
// order now comes from the DB (`wine_regions.display_order`, north to south,
// migration `zone_display_order`) and this component only has to preserve it.
//
// Groups are built from the FULL list, never the filtered one. The first zone
// in each region is its region-level zone — that is what display_order 0 means
// — and it becomes the group's clickable header. Deriving that from a filtered
// list would promote whichever sub-zone happened to match the search.
//
// Mobile-native: 48px primary control, 44px rows, the open list is capped and
// scrolls rather than pushing the page, and nothing depends on hover.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Grape, ChevronDown, Search } from 'lucide-react';
import { getZones } from '../../services/publicClimateService';
import IndustryChips from './IndustryChips';
import './RegionLauncher.css';

// Above this many rows the list gets a filter box; below it, scanning is
// faster than typing. Counted across all zones, not groups.
const FILTER_THRESHOLD = 12;

/**
 * Collapse the server's flat, region-contiguous list into groups, keeping the
 * server order for both the groups and the zones inside them.
 *
 * The region-level zone is taken as the first row of its group rather than by
 * matching slugs: two of them do not match. The "waitaki" zone belongs to the
 * "waitaki-valley" region, and the zone "Hawkes Bay" is missing the apostrophe
 * that its region "Hawke's Bay" has.
 */
function groupByRegion(zones) {
  const groups = [];
  const index = new Map();

  zones.forEach((zone) => {
    // A zone with no region still has to appear. It gets its own group under
    // its own name rather than being silently dropped.
    const key = zone.region_slug || `zone:${zone.slug}`;
    let group = index.get(key);
    if (!group) {
      group = {
        key,
        regionName: zone.region_name || zone.name,
        primary: zone,
        subZones: [],
      };
      index.set(key, group);
      groups.push(group);
    } else {
      group.subZones.push(zone);
    }
  });

  return groups;
}

function matches(zone, q) {
  if (!q) return true;
  return (
    zone.name?.toLowerCase().includes(q) ||
    zone.region_name?.toLowerCase().includes(q)
  );
}

function RegionLauncher() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef(null);

  // Fetched on first open, not on mount: most home page visits never touch it,
  // and the hero already has two network calls in flight.
  useEffect(() => {
    if (!open || zones.length || loading) return;
    setLoading(true);
    getZones()
      .then((data) => setZones(data?.zones || []))
      .catch(() => setLoadFailed(true))
      .finally(() => setLoading(false));
  }, [open, zones.length, loading]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const groups = useMemo(() => groupByRegion(zones), [zones]);

  // Filter inside the groups the full list produced, so a search that only
  // matches a sub-zone still shows it under the right region heading.
  const visibleGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;

    return groups
      .map((g) => ({
        ...g,
        // The header keeps its place as a label even when the region-level
        // zone itself does not match, so the sub-zone below it stays anchored
        // to a region name.
        primaryMatches: matches(g.primary, q),
        subZones: g.subZones.filter((z) => matches(z, q)),
      }))
      .filter((g) => g.primaryMatches || g.subZones.length > 0);
  }, [groups, query]);

  const totalZones = zones.length;
  const nothingMatches = !loading && !loadFailed && totalZones > 0 && visibleGroups.length === 0;

  const choose = (slug) => {
    setOpen(false);
    navigate(`/regions/${slug}`);
  };

  return (
    <section className="region-launcher" aria-labelledby="region-launcher-heading">
      <h2 id="region-launcher-heading" className="region-launcher__heading">
        Your region, in detail
      </h2>
      <p className="region-launcher__blurb">
        Current season, phenology, disease pressure, climate history and
        projections.
      </p>

      <div className="region-launcher__picker" ref={wrapRef}>
        <button
          type="button"
          className={`region-launcher__cta ${open ? 'region-launcher__cta--open' : ''}`}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="listbox"
        >
          <Grape size={19} aria-hidden="true" />
          <span>Select your wine region</span>
          <ChevronDown size={18} aria-hidden="true" className="region-launcher__cta-arrow" />
        </button>

        {open && (
          <div className="region-menu" role="listbox" aria-label="Wine regions">
            {totalZones > FILTER_THRESHOLD && (
              <div className="region-menu__search">
                <Search size={15} aria-hidden="true" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Find a region"
                  aria-label="Filter regions"
                  autoFocus
                />
              </div>
            )}

            <div className="region-menu__list">
              {loading && <p className="region-menu__note">Loading regions…</p>}
              {loadFailed && !loading && (
                <p className="region-menu__note">Could not load regions just now.</p>
              )}
              {nothingMatches && (
                <p className="region-menu__note">No region matches “{query}”.</p>
              )}

              {visibleGroups.map((group) => {
                const showPrimary = group.primaryMatches !== false;
                return (
                  <div className="region-menu__group" key={group.key} role="group">
                    {showPrimary ? (
                      <button
                        type="button"
                        role="option"
                        aria-selected="false"
                        className="region-menu__item region-menu__item--region"
                        onClick={() => choose(group.primary.slug)}
                      >
                        <span className="region-menu__name">{group.primary.name}</span>
                        {group.subZones.length > 0 && (
                          <span className="region-menu__count">
                            {group.subZones.length} sub-region
                            {group.subZones.length === 1 ? '' : 's'}
                          </span>
                        )}
                      </button>
                    ) : (
                      // The region-level zone was filtered out but a sub-zone
                      // survived. The heading stays so the row underneath is
                      // not an orphaned name with no context.
                      <p className="region-menu__label">{group.regionName}</p>
                    )}

                    {group.subZones.map((z) => (
                      <button
                        type="button"
                        key={z.id}
                        role="option"
                        aria-selected="false"
                        className="region-menu__item region-menu__item--sub"
                        onClick={() => choose(z.slug)}
                      >
                        <span className="region-menu__name">{z.name}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="region-launcher__industries">
        <IndustryChips variant="compact" />
      </div>
    </section>
  );
}

export default RegionLauncher;
