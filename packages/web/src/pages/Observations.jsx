import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@vineyard/shared';
import MobileNavigation from '../components/MobileNavigation';
import AppBar from '../components/AppBar';
import SlidingObservationForm from '../components/SlidingObservationForm';
import { observationsService, blocksService } from '@vineyard/shared';

function Observations() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Core state (files/images removed)
  const [observations, setObservations] = useState([]);
  const [blocks, setBlocks] = useState({});
  const [blocksArray, setBlocksArray] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedObservation, setSelectedObservation] = useState(null);
  const [showMapView, setShowMapView] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [showObservationForm, setShowObservationForm] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);

  useEffect(() => {
    loadObservationsAndBlocks();
    getCurrentLocation();
  }, []);

  const getCurrentLocation = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCurrentLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (error) => {
          console.warn('Could not get location:', error.message);
        }
      );
    }
  };

  const loadObservationsAndBlocks = async () => {
    try {
      setLoading(true);

      // Use observationsService methods only (files removed)
      const allObservations = await observationsService.getAllObservations();

      // Blocks for mapping/naming
      const blocksData = await blocksService.getCompanyBlocks();
      const blocksMap = {};
      const companyBlockIds = [];
      const blocksForForm = [];

      if (blocksData?.blocks) {
        blocksData.blocks.forEach((block) => {
          blocksMap[block.id] = block;
          companyBlockIds.push(block.id);
          blocksForForm.push({
            properties: {
              id: block.id,
              block_name: block.block_name,
              variety: block.variety || 'Unknown',
            },
            geometry: block.geometry,
          });
        });
      }

      const companyObservations = (allObservations || [])
        .filter((obs) => companyBlockIds.includes(obs.block_id))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      setObservations(companyObservations);
      setBlocks(blocksMap);
      setBlocksArray(blocksForForm);
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load observations');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-NZ', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleViewOnMap = (observation) => {
    setSelectedObservation(observation);
    setShowMapView(true);
    navigate('/maps', {
      state: {
        observation: observation,
        showObservationPin: true,
      },
    });
  };

  const toggleDebugMode = () => {
    setDebugMode((prev) => !prev);
  };

  const handleObservationSubmit = async (newObservation) => {
    // After create, reload from API using observationsService
    await loadObservationsAndBlocks();
  };

  return (
    <div className="observations-page">
      <AppBar />

      <div className="page-header">
        <h1>Observations</h1>
        <div className="header-buttons">
          <button
            className="create-observation-button"
            onClick={() => setShowObservationForm(true)}
          >
            + New Observation
          </button>
          <button
            className="debug-toggle-button"
            onClick={toggleDebugMode}
            style={{ background: debugMode ? '#ef4444' : '#6b7280', marginLeft: '0.5rem' }}
            title="Toggle debug info"
          >
            🔍
          </button>
        </div>
      </div>

      <div className="observations-content">
        {loading ? (
          <div className="loading-state">Loading observations...</div>
        ) : error ? (
          <div className="error-state">
            {error}
            <button onClick={loadObservationsAndBlocks} style={{ marginLeft: '1rem' }}>
              Retry
            </button>
          </div>
        ) : observations.length === 0 ? (
          <div className="empty-state">
            <p>No observations yet</p>
            <button
              onClick={() => setShowObservationForm(true)}
              className="create-button"
            >
              Create Your First Observation
            </button>
            <button onClick={() => navigate('/maps')} className="create-button secondary">
              Create from Map
            </button>
          </div>
        ) : (
          <div className="observations-grid">
            {observations.map((observation) => (
              <div key={observation.id} className="observation-card">
                {/* Thumbnail area removed (no files/images) */}
                <div className="observation-image placeholder">
                  <div className="no-image">📝</div>
                </div>

                <div className="observation-details">
                  <div className="observation-header">
                    <h3>{observation.observation_type}</h3>
                    <div className="header-actions">
                      {debugMode && (
                        <span className="debug-pill" title="Debug info">
                          ID: {observation.id}
                        </span>
                      )}
                      <button
                        className="map-pin-btn"
                        onClick={() => handleViewOnMap(observation)}
                        title="View on map"
                      >
                        📍
                      </button>
                    </div>
                  </div>

                  <div className="observation-meta">
                    <div className="observation-date">{formatDate(observation.created_at)}</div>
                    <div className="observation-block">
                      {blocks[observation.block_id]?.block_name || `Block ${observation.block_id}`}
                    </div>
                  </div>

                  <div className="observation-notes">{observation.notes}</div>

                  {/* No file attachments UI */}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <SlidingObservationForm
        isOpen={showObservationForm}
        onClose={() => setShowObservationForm(false)}
        blocks={blocksArray}
        currentLocation={currentLocation}
        user={user}
        onSubmit={handleObservationSubmit}
      />

      <MobileNavigation />

      <style jsx>{`
        .observations-page {
          min-height: 100vh;
          background: #f8fafc;
          display: flex;
          flex-direction: column;
        }
        .page-header {
          padding: 1rem;
          padding-top: 70px;
          max-width: 1200px;
          margin: 0 auto;
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .page-header h1 {
          margin: 0;
          font-size: 1.5rem;
          font-weight: 600;
          color: #111827;
        }
        .header-buttons { display: flex; align-items: center; gap: 0.5rem; }
        .create-observation-button {
          background: #446145; color: white; border: none; padding: 0.75rem 1rem;
          border-radius: 8px; font-size: 0.875rem; font-weight: 600; cursor: pointer;
          transition: background-color 0.2s ease;
        }
        .create-observation-button:hover { background: #374532; }
        .observations-content { flex: 1; padding: 1rem; max-width: 1200px; margin: 0 auto; width: 100%; padding-bottom: 80px; }
        .observations-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 1.5rem; }
        .observation-card { background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); display: flex; height: 150px; }
        .observation-image { width: 150px; flex-shrink: 0; background: #f3f4f6; display:flex; align-items:center; justify-content:center; }
        .observation-image.placeholder .no-image { color: #6b7280; font-size: 1.25rem; }
        .observation-details { flex: 1; padding: 1rem; display: flex; flex-direction: column; }
        .observation-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem; }
        .observation-header h3 { margin: 0; font-size: 1rem; font-weight: 600; text-transform: capitalize; }
        .header-actions { display: flex; gap: 0.25rem; align-items: center; }
        .map-pin-btn { background: #3b82f6; color: white; border: none; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.875rem; }
        .debug-pill { background: #f59e0b; color: white; padding: 2px 6px; border-radius: 9999px; font-size: 0.7rem; }
        .observation-meta { display: flex; gap: 1rem; font-size: 0.75rem; color: #6b7280; margin-bottom: 0.5rem; }
        .observation-notes { font-size: 0.875rem; color: #4b5563; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; flex: 1; }
        .loading-state, .error-state, .empty-state { text-align: center; padding: 3rem; color: #6b7280; }
        .empty-state { display: flex; flex-direction: column; align-items: center; gap: 1rem; }
        .create-button { background: #446145; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; font-size: 0.875rem; font-weight: 600; cursor: pointer; transition: background-color 0.2s ease; }
        .create-button:hover { background: #374532; }
        .create-button.secondary { background: #3b82f6; }
        .create-button.secondary:hover { background: #2563eb; }
        @media (max-width: 768px) {
          .observations-grid { grid-template-columns: 1fr; }
          .page-header { flex-direction: column; align-items: flex-start; gap: 1rem; }
          .header-buttons { width: 100%; justify-content: flex-start; }
        }
      `}</style>
    </div>
  );
}

export default Observations;
