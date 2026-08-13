// pages/RegionsPage.jsx — the region index.
//
// The destination of "Select your wine region". Every zone gets a real,
// crawlable URL here for the first time; until now a zone was only selector
// state inside a component, invisible to search engines and impossible to link
// to. These are expected to be among the highest-value URLs on the site, so
// they are plain <Link>s to real routes, not a JS-driven picker.
//
// Free and ungated, deliberately: regional overviews stay open (2026-08-13
// decision). Only point sampling on the Atlas is a paid action.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, ArrowRight } from 'lucide-react';
import SiteHeader from '../components/SiteHeader';
import SiteFooter from '../components/SiteFooter';
import AuthModal from '../components/auth/AuthModal';
import useDocumentMeta from '../hooks/useDocumentMeta';
import { getZones } from '../services/publicClimateService';
import './RegionsPage.css';

function RegionsPage() {
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  useDocumentMeta({
    title: 'New Zealand wine regions',
    description:
      'Climate data for every New Zealand wine region — current season, phenology, disease pressure, history and projections.',
    path: '/regions',
  });

  useEffect(() => {
    let cancelled = false;
    getZones()
      .then((data) => { if (!cancelled) setZones(data?.zones || []); })
      .catch((err) => { if (!cancelled) setError(err.message || 'Could not load regions'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Group by parent region so the list reads geographically rather than as a
  // flat alphabetical wall of 30-odd zone names.
  const grouped = useMemo(() => {
    const map = new Map();
    zones.forEach((z) => {
      const key = z.region_name || 'Other';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(z);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [zones]);

  return (
    <div className="regions-page">
      <SiteHeader
        subtitle="Regional Intelligence"
        onSignInClick={() => setAuthModalOpen(true)}
      />

      <main className="regions-main">
        <header className="regions-intro">
          <h1>Wine regions</h1>
          <p>
            Pick a region for its current season, phenology, disease pressure,
            climate history and projections.
          </p>
        </header>

        {loading && (
          <div className="regions-grid">
            {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="region-tile region-tile--skeleton" />)}
          </div>
        )}

        {error && !loading && <p className="regions-error">{error}</p>}

        {!loading && !error && grouped.map(([regionName, regionZones]) => (
          <section key={regionName} className="regions-group">
            <h2>{regionName}</h2>
            <div className="regions-grid">
              {regionZones.map((z) => (
                <Link key={z.id} to={`/regions/${z.slug}`} className="region-tile">
                  <MapPin size={17} aria-hidden="true" className="region-tile__pin" />
                  <span className="region-tile__name">{z.name}</span>
                  <ArrowRight size={16} aria-hidden="true" className="region-tile__arrow" />
                </Link>
              ))}
            </div>
          </section>
        ))}
      </main>

      <SiteFooter />
      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} context="regions" />
    </div>
  );
}

export default RegionsPage;
