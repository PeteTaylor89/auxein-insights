// pages/MapExplorer.jsx — Full-page map explorer
//
// THE PAGE IS OPEN. It used to be a full-page sign-in wall, which dead-ended
// the home hero and hid the only thing on the site that shows the product.
// The gate moved down to the data (2026-08-18):
//
//   Climate surface  open, at the newest month of every layer. The archive
//                    behind it needs a free account, enforced by the server
//                    trimming `/available` — see surfaces.py `_gate_steps`.
//   Wine regions     needs an account. Blocks and GIs are the regional
//                    product, not the free taste.
import { useState } from 'react';
import { usePublicAuth } from '../contexts/PublicAuthContext';
import RegionalMap from '../components/RegionalMap';
import SurfaceMap from '../components/surfaces/SurfaceMap';
import SiteHeader from '../components/SiteHeader';
import SiteFooter from '../components/SiteFooter';
import AuthModal from '../components/auth/AuthModal';
import AccessGate from '../components/auth/AccessGate';
import { isRegistered } from '../utils/entitlements';
import useDocumentMeta from '../hooks/useDocumentMeta';
import './MapExplorer.css';

const featuredRegions = [
  { id: 'marlborough', name: 'Marlborough', temp: '15.2°C', gdd: 1250, lat: -41.5, lon: 173.9 },
  { id: 'central-otago', name: 'Central Otago', temp: '11.8°C', gdd: 1050, lat: -45.0, lon: 169.1 },
  { id: 'waipara', name: 'Waipara', temp: '13.5°C', gdd: 1150, lat: -43.0, lon: 172.7 },
  { id: 'hawkes-bay', name: 'Hawke\'s Bay', temp: '15.8°C', gdd: 1400, lat: -39.6, lon: 176.9 }
];

const REGIONS_GATE_PREVIEW = [
  'Every wine region and sub-region boundary',
  'Vineyard blocks and geographical indications',
  'Regional climate statistics, weighted by planted area',
];

function MapExplorer() {
  const { user, isAuthenticated } = usePublicAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [view, setView] = useState('surface');

  const registered = isRegistered(user) || isAuthenticated;

  useDocumentMeta({
    title: 'Vine Atlas — NZ Wine Region Map',
    description: 'Explore New Zealand wine regions, vineyard blocks, and geographical indications on an interactive map.',
    path: '/map',
  });

  return (
    <div className="map-explorer-page">
      <SiteHeader
        subtitle="Regional Intelligence"
        onSignInClick={() => setAuthModalOpen(true)}
      />

      {/* Two genuinely different maps, not two styles of one. The climate
          surface is the interpolated 500 m national field; the region map is
          vector boundaries and blocks. Defaulting to the surface because it is
          the product this page exists to show. */}
      <div className="map-explorer-tabs" role="tablist" aria-label="Map">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'surface'}
          className={`map-explorer-tab${view === 'surface' ? ' is-active' : ''}`}
          onClick={() => setView('surface')}
        >
          Climate surface
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'regions'}
          className={`map-explorer-tab${view === 'regions' ? ' is-active' : ''}`}
          onClick={() => setView('regions')}
        >
          Wine regions
        </button>
      </div>

      <div className="map-explorer-container">
        {view === 'surface' ? (
          <SurfaceMap onSignInRequired={() => setAuthModalOpen(true)} />
        ) : (
          <AccessGate
            require="registration"
            allowed={registered}
            onAction={() => setAuthModalOpen(true)}
            title="See every region, block and GI"
            preview={REGIONS_GATE_PREVIEW}
          >
            <RegionalMap regions={featuredRegions} />
          </AccessGate>
        )}
      </div>

      <SiteFooter />
      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} context="map" />
    </div>
  );
}

export default MapExplorer;
