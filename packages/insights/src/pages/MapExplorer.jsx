// pages/MapExplorer.jsx — Full-page map explorer
import { useState } from 'react';
import { usePublicAuth } from '../contexts/PublicAuthContext';
import RegionalMap from '../components/RegionalMap';
import SiteHeader from '../components/SiteHeader';
import AuthModal from '../components/auth/AuthModal';
import './MapExplorer.css';

const featuredRegions = [
  { id: 'marlborough', name: 'Marlborough', temp: '15.2°C', gdd: 1250, lat: -41.5, lon: 173.9 },
  { id: 'central-otago', name: 'Central Otago', temp: '11.8°C', gdd: 1050, lat: -45.0, lon: 169.1 },
  { id: 'waipara', name: 'Waipara', temp: '13.5°C', gdd: 1150, lat: -43.0, lon: 172.7 },
  { id: 'hawkes-bay', name: 'Hawke\'s Bay', temp: '15.8°C', gdd: 1400, lat: -39.6, lon: 176.9 }
];

function MapExplorer() {
  const { isAuthenticated } = usePublicAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);

  if (!isAuthenticated) {
    return (
      <div className="map-explorer-page">
        <SiteHeader
          subtitle="Regional Intelligence"
          onSignInClick={() => setAuthModalOpen(true)}
        />
        <div className="map-explorer-locked">
          <div className="map-explorer-locked-content">
            <h2>Vine Atlas</h2>
            <p>Sign in to explore New Zealand wine regions, blocks, and geographical indications.</p>
            <button className="map-explorer-signin-btn" onClick={() => setAuthModalOpen(true)}>
              Sign in free to explore
            </button>
          </div>
        </div>
        <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} context="map" />
      </div>
    );
  }

  return (
    <div className="map-explorer-page">
      <SiteHeader
        subtitle="Regional Intelligence"
        onSignInClick={() => setAuthModalOpen(true)}
      />
      <div className="map-explorer-container">
        <RegionalMap regions={featuredRegions} />
      </div>
      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} context="map" />
    </div>
  );
}

export default MapExplorer;
