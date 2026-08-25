// pages/Explore.jsx — the hub for one (country, industry) scope.
//
// Phase 4 of docs/plans/COUNTRY_INDUSTRY_REGIONS_2026-08-24.md. Replaces
// `RegionsPage`, which was a flat list of wine-region tiles.
//
// It is no longer "wine regions", so it is no longer called that: industry
// pills sit at the top and decide which regions and which models exist below.
// The `h1` is built from the scope rather than written out, so the page reads
// correctly for every future (country, industry) pair without a copy change.
//
// A CRAWLABLE LIST STAYS, alongside the dropdown. The dropdown is the control a
// returning grower wants; the list is what makes this page worth anything to a
// search engine — every zone is a real <Link>, which is the entire reason the
// region URLs were given their own routes. A JS-driven picker on its own would
// make them invisible again.
//
// It became PILLS rather than tiles on 2026-08-24: 23 tiles ran four rows deep
// and pushed most of the choices below the fold, so picking a region meant
// scrolling past the options.
//
// Free and ungated, deliberately: regional overviews stay open (2026-08-13
// decision). Only point sampling on the Atlas is a paid action.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import SiteHeader from '../components/SiteHeader';
import SiteFooter from '../components/SiteFooter';
import AuthModal from '../components/auth/AuthModal';
import IndustryPills from '../components/explore/IndustryPills';
import RegionSelect from '../components/explore/RegionSelect';
import useDocumentMeta from '../hooks/useDocumentMeta';
import { useCountryIndustry } from '../contexts/CountryIndustryContext';
import { getZones } from '../services/publicClimateService';
import { getZonesWithData } from '../services/realtimeClimateService';
import '../components/explore/explore.css';
import './RegionsPage.css';

function Explore() {
  const {
    country, industry, countryName, industryName, active, path,
  } = useCountryIndustry();
  const [zones, setZones] = useState([]);
  const [covered, setCovered] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const lowerIndustry = industryName.toLowerCase();

  useDocumentMeta({
    title: `${countryName} ${lowerIndustry} regions`,
    description:
      `Climate data for every ${countryName} ${lowerIndustry} region — ` +
      'current season, phenology, disease pressure, history and projections.',
    path: path(),
    // Reachable, but not submitted to search while it has no data. An empty
    // "coming soon" competing with real content for the same terms is worse
    // than not being listed; it rejoins with the same flag that gives it data.
    noindex: !active,
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    // TWO lists, and they are different questions. `getZones` is every region
    // in the scope — that is what the tiles and the dropdown must show, because
    // a region with no live season still has history, projections and a page
    // worth ranking. `getZonesWithData` is the subset with a current season,
    // which is what marks the rest as "no live data" rather than dropping them.
    Promise.all([
      getZones({ country, industry }),
      getZonesWithData({ country, industry }).catch(() => ({ zones: [] })),
    ])
      .then(([all, live]) => {
        if (cancelled) return;
        setZones(all?.zones || []);
        setCovered(new Set((live?.zones || []).map((z) => z.slug)));
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load regions');
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [country, industry]);

  // Grouped by parent region so the list reads geographically rather than as a
  // flat alphabetical wall. Order comes from the DB and is preserved, not
  // re-sorted — `climate_zones.display_order` already encodes region rank.
  const grouped = useMemo(() => {
    const map = new Map();
    zones.forEach((z) => {
      const key = z.region_name || 'Other';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(z);
    });
    return [...map.entries()];
  }, [zones]);

  return (
    <div className="regions-page">
      <SiteHeader onSignInClick={() => setAuthModalOpen(true)} />

      <main className="explore-main">
        <header className="explore-head">
          <h1>{countryName} {lowerIndustry} regions</h1>
          <p>
            Pick a region for its current season, phenology, disease pressure,
            climate history and projections.
          </p>
        </header>

        <div className="explore-controls">
          <IndustryPills />
          <RegionSelect
            zones={zones}
            covered={covered}
            currentSlug={null}
            loading={loading}
          />
        </div>

        {!active && !loading && (
          <p className="explore-pending">
            {countryName} {lowerIndustry} is not covered yet. We are working on it.
          </p>
        )}

        {loading && (
          <div className="regionpills">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <span key={i} className="regionpill regionpill--skeleton" />
            ))}
          </div>
        )}

        {error && !loading && <p className="regions-error">{error}</p>}

        {/* PILLS, not tiles (2026-08-24). The tile grid put 23 regions at three
            or four to a row and pushed the last of them below the fold, so
            choosing a region meant scrolling past most of the choices. A pill
            is the smallest thing that still reads as a place, and all 23 fit
            in the space four tiles used to take.

            Still real <Link>s, still grouped by parent region — the grouping is
            what makes a flat list of 23 legible, and these are the crawlable
            URLs the page exists to expose. */}
        {!loading && !error && grouped.map(([regionName, regionZones]) => (
          <section key={regionName} className="regions-group regions-group--pills">
            <h2>{regionName}</h2>
            <div className="regionpills">
              {regionZones.map((z) => {
                const hasLive = covered.has(z.slug);
                return (
                  <Link
                    key={z.id}
                    to={path(z.slug)}
                    className={`regionpill${hasLive ? '' : ' regionpill--quiet'}`}
                    title={hasLive ? undefined
                      : 'History and projections only — no live season data'}
                  >
                    <MapPin size={13} aria-hidden="true" />
                    {z.name}
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </main>

      <SiteFooter />
      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} context="regions" />
    </div>
  );
}

export default Explore;
