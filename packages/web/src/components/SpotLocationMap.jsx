import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useAuth } from '@vineyard/shared';
import {blocksService, spatialAreasService} from '@vineyard/shared';


// Set your Mapbox token
mapboxgl.accessToken = 'pk.eyJ1IjoicGV0ZXRheWxvciIsImEiOiJjbTRtaHNxcHAwZDZ4MmxwbjZkeXNneTZnIn0.RJ9B3Q3-t_-gFrEkgshH9Q';



function SpotLocationMap({ isOpen, onClose, onLocationSet, initialCoordinates = null }) {
  const { user } = useAuth();
  const mapContainer = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentCoords, setCurrentCoords] = useState(initialCoordinates);

  // Initialize map when modal opens
  useEffect(() => {
    if (!isOpen || map.current || !mapContainer.current) return;

    const initializeMap = async () => {
      try {
        setLoading(true);
        setError(null);

        // Wait a tick to ensure the DOM is ready
        await new Promise(resolve => setTimeout(resolve, 0));
        
        if (!mapContainer.current) {
          console.error('Map container not found');
          setError('Failed to initialize map container');
          setLoading(false);
          return;
        }

        // Create map
        map.current = new mapboxgl.Map({
          container: mapContainer.current,
          style: 'mapbox://styles/mapbox/satellite-streets-v12',
          center: initialCoordinates ? [initialCoordinates.longitude, initialCoordinates.latitude] : [172.6148, -43.5272],
          zoom: initialCoordinates ? 15 : 8
        });

        // Add navigation controls
        map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

        // Wait for map to load
        map.current.on('load', async () => {
          try {
            // Load company blocks for context
            await loadCompanyBlocks();
            
            // Set up initial marker if coordinates provided
            if (initialCoordinates) {
              addMarker(initialCoordinates.longitude, initialCoordinates.latitude);
            }
            
            // Handle map clicks to place marker
            map.current.on('click', handleMapClick);
            
            setLoading(false);
            
          } catch (error) {
            console.error('Error setting up map:', error);
            setLoading(false);
          }
        });

      } catch (error) {
        console.error('Error initializing map:', error);
        setError('Failed to initialize map');
        setLoading(false);
      }
    };

    initializeMap();

    // Cleanup when modal closes
    return () => {
      if (marker.current) {
        marker.current.remove();
        marker.current = null;
      }
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [isOpen]);

  // Load company blocks for context
  const loadCompanyBlocks = async () => {
    try {
      const blocksData = await blocksService.getBlocksGeoJSON();
      if (!blocksData || !blocksData.features) return;

      const userCompanyId = user?.company_id;
      const companyBlocks = {
        ...blocksData,
        features: blocksData.features.filter(
          feature => Number(feature.properties.company_id) === Number(userCompanyId)
        )
      };

      if (companyBlocks.features.length === 0) return;

      map.current.addSource('company-blocks', {
        type: 'geojson',
        data: companyBlocks
      });

      // Add fill layer
      map.current.addLayer({
        id: 'company-blocks-fill',
        type: 'fill',
        source: 'company-blocks',
        paint: {
          'fill-color': '#58e23c',
          'fill-opacity': 0.3
        }
      });

      // Add outline layer
      map.current.addLayer({
        id: 'company-blocks-outline',
        type: 'line',
        source: 'company-blocks',
        paint: {
          'line-color': '#58e23c',
          'line-width': 2,
          'line-opacity': 0.8
        }
      });

      // Fit map to company blocks if no initial coordinates
      if (!initialCoordinates) {
        const bounds = new mapboxgl.LngLatBounds();
        companyBlocks.features.forEach(feature => {
          if (feature.geometry.type === 'Polygon') {
            feature.geometry.coordinates[0].forEach(coord => {
              bounds.extend(coord);
            });
          }
        });
        
        map.current.fitBounds(bounds, { 
          padding: 50,
          maxZoom: 15
        });
      }

    } catch (error) {
      console.warn('Could not load company blocks:', error);
    }
  };

  // Handle map click to place marker
  const handleMapClick = (e) => {
    const lng = e.lngLat.lng;
    const lat = e.lngLat.lat;
    
    addMarker(lng, lat);
    setCurrentCoords({ longitude: lng, latitude: lat });
  };

  // Add or update marker
  const addMarker = (lng, lat) => {
    // Remove existing marker
    if (marker.current) {
      marker.current.remove();
    }

    // Create new marker
    marker.current = new mapboxgl.Marker({
      color: '#ef4444',
      draggable: true
    })
      .setLngLat([lng, lat])
      .addTo(map.current);

    // Handle marker drag
    marker.current.on('dragend', () => {
      const lngLat = marker.current.getLngLat();
      setCurrentCoords({ longitude: lngLat.lng, latitude: lngLat.lat });
    });
  };

  // Use current device location
  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }

    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lng = position.coords.longitude;
        const lat = position.coords.latitude;
        
        addMarker(lng, lat);
        setCurrentCoords({ longitude: lng, latitude: lat });
        
        map.current.flyTo({
          center: [lng, lat],
          zoom: 16
        });
        
        setLoading(false);
      },
      (error) => {
        console.error('Error getting location:', error);
        alert(`Failed to get location: ${error.message}`);
        setLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  };

  // Handle confirm
  const handleConfirm = () => {
    if (!currentCoords) {
      alert('Please place a marker first');
      return;
    }
    onLocationSet(currentCoords);
    onClose();
  };

  // Handle remove
  const handleRemove = () => {
    if (marker.current) {
      marker.current.remove();
      marker.current = null;
    }
    setCurrentCoords(null);
  };

  if (!isOpen) return null;

  const modalContent = (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: '100vw',
      height: '100vh',
      background: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100000,
      pointerEvents: 'auto'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '12px',
        width: '90vw',
        height: '80vh',
        maxWidth: '900px',
        maxHeight: '700px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
        pointerEvents: 'auto'
      }}>
        
        {/* Header */}
        <div style={{
          padding: '1rem 1.5rem',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '600' }}>
            Set Spot Location
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: '0.25rem',
              color: '#6b7280'
            }}
          >
            ×
          </button>
        </div>

        {/* Controls */}
        <div style={{
          padding: '1rem 1.5rem',
          borderBottom: '1px solid #e5e7eb',
          background: '#f8fafc'
        }}>
          
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem'
          }}>
            <div style={{
              padding: '0.75rem',
              background: '#e0f2fe',
              border: '1px solid #0ea5e9',
              borderRadius: '6px',
              fontSize: '0.875rem',
              color: '#0369a1',
              flex: 1
            }}>
              Click on the map to place a marker, or use your current location
            </div>

            <button
              onClick={useCurrentLocation}
              disabled={loading}
              style={{
                padding: '0.5rem 1rem',
                border: '1px solid #3b82f6',
                background: 'white',
                color: '#3b82f6',
                borderRadius: '6px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500',
                whiteSpace: 'nowrap'
              }}
            >
              📍 Use Current Location
            </button>
          </div>
        </div>

        {/* Map Container */}
        <div style={{ flex: 1, position: 'relative' }}>
          {loading && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#f8fafc',
              zIndex: 1000
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🗺️</div>
                <div>Loading map...</div>
              </div>
            </div>
          )}
          
          {error && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#fef2f2',
              zIndex: 1000
            }}>
              <div style={{ textAlign: 'center', color: '#dc2626' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⚠️</div>
                <div>{error}</div>
              </div>
            </div>
          )}

          <div
            ref={mapContainer}
            style={{
              width: '100%',
              height: '100%',
              borderRadius: '0'
            }}
          />
        </div>

        {/* Footer Actions */}
        <div style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#f8fafc'
        }}>
          
          {/* Location Info */}
          <div style={{ flex: 1 }}>
            {currentCoords ? (
              <div style={{ fontSize: '0.875rem', color: '#374151' }}>
                <strong>Coordinates:</strong> {currentCoords.latitude.toFixed(6)}, {currentCoords.longitude.toFixed(6)}
              </div>
            ) : (
              <div style={{ fontSize: '0.875rem', color: '#9ca3af' }}>
                No location selected
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            
            {currentCoords && (
              <button
                onClick={handleRemove}
                style={{
                  padding: '0.5rem 1rem',
                  border: '1px solid #dc2626',
                  background: 'white',
                  color: '#dc2626',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.875rem'
                }}
              >
                Remove Marker
              </button>
            )}

            <button
              onClick={onClose}
              style={{
                padding: '0.5rem 1rem',
                border: '1px solid #d1d5db',
                background: 'white',
                color: '#374151',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem'
              }}
            >
              Cancel
            </button>

            <button
              onClick={handleConfirm}
              disabled={!currentCoords}
              style={{
                padding: '0.5rem 1rem',
                border: 'none',
                background: currentCoords ? '#3b82f6' : '#9ca3af',
                color: 'white',
                borderRadius: '6px',
                cursor: currentCoords ? 'pointer' : 'not-allowed',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}
            >
              Confirm Location
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

export default SpotLocationMap;