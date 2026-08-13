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
// Mobile-native: 48px primary control, 44px rows, the open list is capped and
// scrolls rather than pushing the page, and nothing depends on hover.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Grape, ChevronDown, Search } from 'lucide-react';
import { getZones } from '../../services/publicClimateService';
import IndustryChips from './IndustryChips';
import './RegionLauncher.css';

// Above this many regions the list gets a filter box; below it, scanning is
// faster than typing.
const FILTER_THRESHOLD = 12;

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return zones;
    return zones.filter(
      (z) => z.name?.toLowerCase().includes(q) || z.region_name?.toLowerCase().includes(q),
    );
  }, [zones, query]);

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
            {zones.length > FILTER_THRESHOLD && (
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
              {!loading && !loadFailed && filtered.length === 0 && (
                <p className="region-menu__note">No region matches “{query}”.</p>
              )}
              {filtered.map((z) => (
                <button
                  type="button"
                  key={z.id}
                  role="option"
                  aria-selected="false"
                  className="region-menu__item"
                  onClick={() => choose(z.slug)}
                >
                  <span className="region-menu__name">{z.name}</span>
                  {z.region_name && z.region_name !== z.name && (
                    <span className="region-menu__parent">{z.region_name}</span>
                  )}
                </button>
              ))}
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
