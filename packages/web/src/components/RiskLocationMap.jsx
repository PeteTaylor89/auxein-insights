import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useAuth } from '@vineyard/shared';
import {blocksService, spatialAreasService} from '@vineyard/shared';


// Set your Mapbox token
mapboxgl.accessToken = 'pk.eyJ1IjoicGV0ZXRheWxvciIsImEiOiJjbTRtaHNxcHAwZDZ4MmxwbjZkeXNneTZnIn0.RJ9B3Q3-t_-gFrEkgshH9Q';

function RiskLocationMap({ isOpen, onClose, onLocationSet, initialLocation = null }) {
  const { user } = useAuth();
  const mapContainer = useRef(null);
  const map = useRef(null);
  const drawControl = useRef(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [locationType, setLocationType] = useState('point'); // 'point' or 'area'
  const [currentLocation, setCurrentLocation] = useState(initialLocation);
  const [status, setStatus] = useState('Click on the map to place a location marker');

  // Initialize map when modal opens
  useEffect(() => {
    if (!isOpen || map.current) return;

    const initializeMap = async () => {
      try {
        setLoading(true);
        setError(null);

        // Create map
        map.current = new mapboxgl.Map({
          container: mapContainer.current,
          style: 'mapbox://styles/mapbox/satellite-streets-v12',
          center: [172.6148, -43.5272], // New Zealand center
          zoom: 8
        });

        // Add navigation controls
        map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

        // Wait for map to load
        map.current.on('load', async () => {
          try {
            // Load company data for context
            await loadCompanyData();
            
            // Set up drawing controls
            setupDrawControls();
            
            // If there's an initial location, display it
            if (initialLocation) {
              displayInitialLocation();
            }
            
            setLoading(false);
            
          } catch (error) {
            console.error('Error setting up map:', error);
            setError('Failed to load map data');
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
      if (map.current) {
        map.current.remove();
        map.current = null;
        drawControl.current = null;
      }
    };
  }, [isOpen]);

  // Load company blocks and spatial areas for context
  const loadCompanyData = async () => {
    try {
      // Load blocks
      const blocksData = await blocksService.getBlocksGeoJSON();
      if (blocksData && blocksData.features) {
        addBlocksLayer(blocksData);
      }

      // Load spatial areas  
      const spatialData = await spatialAreasService.getSpatialAreasGeoJSON();
      if (spatialData && spatialData.features) {
        addSpatialAreasLayer(spatialData);
      }

    } catch (error) {
      console.warn('Could not load company data:', error);
      // Don't fail the whole component if context data fails
    }
  };

  // Add blocks layer for context
  const addBlocksLayer = (geojsonData) => {
    if (!map.current) return;

    try {
      // Filter to user's company
      const userCompanyId = user?.company_id;
      const companyBlocks = {
        ...geojsonData,
        features: geojsonData.features.filter(
          feature => Number(feature.properties.company_id) === Number(userCompanyId)
        )
      };

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

      // Add labels
      map.current.addLayer({
        id: 'company-blocks-labels',
        type: 'symbol',
        source: 'company-blocks',
        minzoom: 12,
        layout: {
          'text-field': ['get', 'block_name'],
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
          'text-size': 12,
          'text-anchor': 'center'
        },
        paint: {
          'text-color': '#1f2937',
          'text-halo-color': '#ffffff',
          'text-halo-width': 2
        }
      });

      // Fit map to company blocks if available
      if (companyBlocks.features.length > 0) {
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
      console.warn('Error adding blocks layer:', error);
    }
  };

  // Add spatial areas layer for context
  const addSpatialAreasLayer = (geojsonData) => {
    if (!map.current) return;

    try {
      // Filter to user's company
      const userCompanyId = user?.company_id;
      const companySpatialAreas = {
        ...geojsonData,
        features: geojsonData.features.filter(
          feature => Number(feature.properties.company_id) === Number(userCompanyId)
        )
      };

      map.current.addSource('company-spatial-areas', {
        type: 'geojson',
        data: companySpatialAreas
      });

      // Add fill layer with different colors by type
      map.current.addLayer({
        id: 'company-spatial-areas-fill',
        type: 'fill',
        source: 'company-spatial-areas',
        paint: {
          'fill-color': [
            'match',
            ['get', 'area_type'],
            'paddock', '#22c55e',
            'orchard', '#f59e0b', 
            'infrastructure_zone', '#6b7280',
            'waterway', '#3b82f6',
            '#9ca3af' // default
          ],
          'fill-opacity': 0.2
        }
      }, 'company-blocks-fill'); // Insert before blocks

      // Add outline
      map.current.addLayer({
        id: 'company-spatial-areas-outline',
        type: 'line',
        source: 'company-spatial-areas',
        paint: {
          'line-color': '#1f2937',
          'line-width': 1,
          'line-opacity': 0.5,
          'line-dasharray': [2, 2]
        }
      }, 'company-blocks-fill');

    } catch (error) {
      console.warn('Error adding spatial areas layer:', error);
    }
  };

  // Setup drawing controls
  const setupDrawControls = () => {
    if (!map.current) return;

    // Create draw control
    drawControl.current = new MapboxDraw({
      displayControlsDefault: false,
      controls: {
        point: locationType === 'point',
        polygon: locationType === 'area'
      },
      styles: [
        // Point styles
        {
          id: 'gl-draw-point-active',
          type: 'circle',
          filter: ['all', ['==', '$type', 'Point'], ['==', 'active', 'true']],
          paint: {
            'circle-radius': 8,
            'circle-color': '#ef4444',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff'
          }
        },
        {
          id: 'gl-draw-point-inactive',
          type: 'circle',
          filter: ['all', ['==', '$type', 'Point'], ['==', 'active', 'false']],
          paint: {
            'circle-radius': 6,
            'circle-color': '#ef4444',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff'
          }
        },
        // Polygon styles
        {
          id: 'gl-draw-polygon-fill-active',
          type: 'fill',
          filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
          paint: {
            'fill-color': '#ef4444',
            'fill-opacity': 0.3
          }
        },
        {
          id: 'gl-draw-polygon-fill-inactive',
          type: 'fill',
          filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon']],
          paint: {
            'fill-color': '#ef4444',
            'fill-opacity': 0.3
          }
        },
        {
          id: 'gl-draw-line-active',
          type: 'line',
          filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
          layout: {
            'line-cap': 'round',
            'line-join': 'round'
          },
          paint: {
            'line-color': '#ef4444',
            'line-width': 2
          }
        },
        {
          id: 'gl-draw-line-inactive',
          type: 'line',
          filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon']],
          layout: {
            'line-cap': 'round',
            'line-join': 'round'
          },
          paint: {
            'line-color': '#ef4444',
            'line-width': 2
          }
        },
        // Vertex styles
        {
          id: 'gl-draw-polygon-vertex-active',
          type: 'circle',
          filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'vertex']],
          paint: {
            'circle-radius': 4,
            'circle-color': '#ffffff',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ef4444'
          }
        }
      ]
    });

    map.current.addControl(drawControl.current, 'top-left');

    // Handle drawing events
    map.current.on('draw.create', handleDrawCreate);
    map.current.on('draw.update', handleDrawUpdate);
    map.current.on('draw.delete', handleDrawDelete);

    // Handle direct map clicks for point placement
    if (locationType === 'point') {
      map.current.on('click', handleMapClick);
    }
  };

  // Handle map click for point placement
  const handleMapClick = (e) => {
    if (locationType !== 'point') return;

    // Clear existing drawings
    if (drawControl.current) {
      drawControl.current.deleteAll();
    }

    // Create point at click location
    const point = {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [e.lngLat.lng, e.lngLat.lat]
      }
    };

    drawControl.current.add(point);
    setCurrentLocation(point.geometry);
    setStatus(`Point placed at ${e.lngLat.lat.toFixed(6)}, ${e.lngLat.lng.toFixed(6)}`);
  };

  // Handle draw events
  const handleDrawCreate = (e) => {
    if (e.features.length > 0) {
      const feature = e.features[0];
      setCurrentLocation(feature.geometry);
      
      if (feature.geometry.type === 'Point') {
        const [lng, lat] = feature.geometry.coordinates;
        setStatus(`Point placed at ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
      } else if (feature.geometry.type === 'Polygon') {
        setStatus('Area drawn successfully');
      }
    }
  };

  const handleDrawUpdate = (e) => {
    if (e.features.length > 0) {
      const feature = e.features[0];
      setCurrentLocation(feature.geometry);
      setStatus('Location updated');
    }
  };

  const handleDrawDelete = () => {
    setCurrentLocation(null);
    setStatus('Location removed');
  };

  // Display initial location if provided
  const displayInitialLocation = () => {
    if (!initialLocation || !drawControl.current) return;

    try {
      const feature = {
        type: 'Feature',
        geometry: initialLocation
      };

      drawControl.current.add(feature);
      setCurrentLocation(initialLocation);

      // Center map on the location
      if (initialLocation.type === 'Point') {
        map.current.flyTo({
          center: initialLocation.coordinates,
          zoom: 15
        });
      } else if (initialLocation.type === 'Polygon') {
        const bounds = new mapboxgl.LngLatBounds();
        initialLocation.coordinates[0].forEach(coord => {
          bounds.extend(coord);
        });
        map.current.fitBounds(bounds, { padding: 50 });
      }

      setStatus('Existing location loaded');
    } catch (error) {
      console.warn('Error displaying initial location:', error);
    }
  };

  // Handle location type change
  const handleLocationTypeChange = (newType) => {
    setLocationType(newType);
    
    // Clear existing drawings
    if (drawControl.current) {
      drawControl.current.deleteAll();
    }
    setCurrentLocation(null);

    // Remove and re-add draw control with new type
    if (map.current && drawControl.current) {
      map.current.removeControl(drawControl.current);
      
      // Remove map click handler
      map.current.off('click', handleMapClick);
      
      setTimeout(() => {
        setupDrawControls();
        if (newType === 'point') {
          setStatus('Click on the map to place a location marker');
        } else {
          setStatus('Click the polygon tool and draw an area on the map');
        }
      }, 100);
    }
  };

  // Handle confirm location
  const handleConfirmLocation = () => {
    if (!currentLocation) {
      setStatus('Please place a location first');
      return;
    }

    onLocationSet(currentLocation);
    onClose();
  };

  // Handle remove location
  const handleRemoveLocation = () => {
    if (drawControl.current) {
      drawControl.current.deleteAll();
    }
    setCurrentLocation(null);
    setStatus('Location removed');
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000
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
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)'
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
            Set Risk Location
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
          
          {/* Location Type Toggle */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '0.5rem', 
              fontSize: '0.875rem',
              fontWeight: '500',
              color: '#374151'
            }}>
              Location Type:
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => handleLocationTypeChange('point')}
                style={{
                  padding: '0.5rem 1rem',
                  border: '1px solid #d1d5db',
                  background: locationType === 'point' ? '#3b82f6' : 'white',
                  color: locationType === 'point' ? 'white' : '#374151',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500'
                }}
              >
                📍 Point Location
              </button>
              <button
                onClick={() => handleLocationTypeChange('area')}
                style={{
                  padding: '0.5rem 1rem',
                  border: '1px solid #d1d5db',
                  background: locationType === 'area' ? '#3b82f6' : 'white',
                  color: locationType === 'area' ? 'white' : '#374151',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500'
                }}
              >
                📐 Area Risk
              </button>
            </div>
          </div>

          {/* Status */}
          <div style={{
            padding: '0.75rem',
            background: '#e0f2fe',
            border: '1px solid #0ea5e9',
            borderRadius: '6px',
            fontSize: '0.875rem',
            color: '#0369a1'
          }}>
            {status}
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
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>❌</div>
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
            {currentLocation && (
              <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                {currentLocation.type === 'Point' ? (
                  `Point: ${currentLocation.coordinates[1].toFixed(6)}, ${currentLocation.coordinates[0].toFixed(6)}`
                ) : (
                  'Area polygon drawn'
                )}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            
            {currentLocation && (
              <button
                onClick={handleRemoveLocation}
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
                Remove Location
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
              onClick={handleConfirmLocation}
              disabled={!currentLocation}
              style={{
                padding: '0.5rem 1rem',
                border: 'none',
                background: currentLocation ? '#3b82f6' : '#9ca3af',
                color: 'white',
                borderRadius: '6px',
                cursor: currentLocation ? 'pointer' : 'not-allowed',
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
}

export default RiskLocationMap;