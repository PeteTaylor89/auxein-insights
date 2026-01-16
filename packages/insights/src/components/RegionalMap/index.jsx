// src/components/RegionalMap/index.jsx
import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { usePublicAuth } from '../../contexts/PublicAuthContext';
import publicApi from '../../services/publicApi';
import BlockPopup from './BlockPopup';
import MapSidebar from './MapSidebar';
import './RegionalMap.css';

// Set MapBox token
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || '';

if (!mapboxgl.accessToken) {
  console.error('❌ Missing Mapbox token. Set VITE_MAPBOX_TOKEN in root/.env file');
} else {
  console.log('✅ Mapbox token loaded successfully');
}

// New Zealand bounding box
const NZ_BOUNDS = {
  min_lng: 166.0,
  max_lng: 179.0,
  min_lat: -47.5,
  max_lat: -34.0
};

// Block styling
const BLOCK_FILL_COLOR = '#22c55e';  // Auxein green
const BLOCK_FILL_OPACITY = 0.6;
const BLOCK_OUTLINE_COLOR = '#065f46';
const BLOCK_HOVER_COLOR = '#16a34a';

function RegionalMap({ regions = [] }) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const hoveredBlockId = useRef(null);
  const { isAuthenticated } = usePublicAuth();
  
  // State
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapStyle, setMapStyle] = useState('satellite-streets-v12');
  const [blockOpacity, setBlockOpacity] = useState(0.7);
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [blocksLoading, setBlocksLoading] = useState(false);
  const [error, setError] = useState(null);
  const [blocksData, setBlocksData] = useState(null);

  // =========================================================================
  // MAP INITIALIZATION
  // =========================================================================
  useEffect(() => {
    if (map.current) return; // Initialize only once

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: `mapbox://styles/mapbox/${mapStyle}`,
      center: [171.5, -41.5], // Center of NZ
      zoom: 5.5,
      minZoom: 5,
      maxZoom: 18,
      maxBounds: [
        [NZ_BOUNDS.min_lng - 2, NZ_BOUNDS.min_lat - 2],
        [NZ_BOUNDS.max_lng + 2, NZ_BOUNDS.max_lat + 2]
      ]
    });

    // Add navigation controls
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
    
    // Add geolocation control
    map.current.addControl(
      new mapboxgl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true
      }),
      'top-right'
    );

    map.current.on('load', () => {
      console.log('✅ Map loaded successfully');
      setMapLoaded(true);
    });

    // Cleanup
    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // =========================================================================
  // LOAD BLOCKS GEOJSON (when authenticated and map loaded)
  // =========================================================================
  useEffect(() => {
    if (!mapLoaded || !isAuthenticated || blocksData) return;

    const loadBlocks = async () => {
      setBlocksLoading(true);
      setError(null);

      try {
        console.log('📡 Fetching blocks GeoJSON...');
        const response = await publicApi.get('/public/blocks/geojson');
        
        console.log(`✅ Loaded ${response.data.features.length} blocks`);
        setBlocksData(response.data);
        
        // Add blocks to map
        addBlocksToMap(response.data);

      } catch (err) {
        console.error('❌ Error loading blocks:', err);
        if (err.response?.status === 429) {
          setError('Rate limit exceeded. Please try again later.');
        } else {
          setError('Failed to load vineyard blocks. Please refresh.');
        }
      } finally {
        setBlocksLoading(false);
      }
    };

    loadBlocks();
  }, [mapLoaded, isAuthenticated]);

  // =========================================================================
  // ADD BLOCKS TO MAP (Vector Layer)
  // =========================================================================
  const addBlocksToMap = (geojsonData) => {
    if (!map.current || !geojsonData) return;

    try {
      // Remove existing layers/sources if they exist
      if (map.current.getLayer('blocks-fill')) {
        map.current.removeLayer('blocks-fill');
      }
      if (map.current.getLayer('blocks-outline')) {
        map.current.removeLayer('blocks-outline');
      }
      if (map.current.getSource('blocks')) {
        map.current.removeSource('blocks');
      }

      // Add GeoJSON source
      map.current.addSource('blocks', {
        type: 'geojson',
        data: geojsonData,
        generateId: true  // For hover state
      });

      // Add fill layer
      map.current.addLayer({
        id: 'blocks-fill',
        type: 'fill',
        source: 'blocks',
        paint: {
          'fill-color': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            BLOCK_HOVER_COLOR,
            BLOCK_FILL_COLOR
          ],
          'fill-opacity': blockOpacity
        }
      });

      // Add outline layer
      map.current.addLayer({
        id: 'blocks-outline',
        type: 'line',
        source: 'blocks',
        paint: {
          'line-color': BLOCK_OUTLINE_COLOR,
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            2,
            1
          ]
        }
      });

      // Add click handler
      map.current.on('click', 'blocks-fill', handleBlockClick);

      // Add hover handlers
      map.current.on('mousemove', 'blocks-fill', handleBlockHover);
      map.current.on('mouseleave', 'blocks-fill', handleBlockLeave);

      // Change cursor on hover
      map.current.on('mouseenter', 'blocks-fill', () => {
        map.current.getCanvas().style.cursor = 'pointer';
      });
      map.current.on('mouseleave', 'blocks-fill', () => {
        map.current.getCanvas().style.cursor = '';
      });

      console.log('✅ Blocks layer added to map');

    } catch (err) {
      console.error('❌ Error adding blocks to map:', err);
      setError('Failed to render vineyard blocks');
    }
  };

  // =========================================================================
  // HANDLE BLOCK CLICK - Query for details
  // =========================================================================
  const handleBlockClick = async (e) => {
    if (!e.features || e.features.length === 0) return;

    const feature = e.features[0];
    const blockId = feature.properties.id;
    
    setQueryLoading(true);
    setSelectedBlock(null);
    setError(null);

    try {
      console.log(`📡 Fetching details for block ${blockId}...`);
      const response = await publicApi.get(`/public/blocks/${blockId}`);

      console.log('✅ Block details:', response.data);
      
      // Get centroid for popup positioning
      const coordinates = e.lngLat;
      
      setSelectedBlock({
        ...response.data,
        coordinates: [coordinates.lng, coordinates.lat]
      });

    } catch (err) {
      console.error('❌ Block query error:', err);
      if (err.response?.status === 404) {
        setError('Block not found.');
      } else if (err.response?.status === 429) {
        setError('Rate limit exceeded. Please wait a moment.');
      } else {
        setError('Failed to load block details.');
      }
    } finally {
      setQueryLoading(false);
    }
  };

  // =========================================================================
  // HANDLE BLOCK HOVER
  // =========================================================================
  const handleBlockHover = (e) => {
    if (e.features.length === 0) return;

    // Remove hover state from previous block
    if (hoveredBlockId.current !== null) {
      map.current.setFeatureState(
        { source: 'blocks', id: hoveredBlockId.current },
        { hover: false }
      );
    }

    // Set hover state on current block
    hoveredBlockId.current = e.features[0].id;
    map.current.setFeatureState(
      { source: 'blocks', id: hoveredBlockId.current },
      { hover: true }
    );
  };

  // =========================================================================
  // HANDLE BLOCK LEAVE
  // =========================================================================
  const handleBlockLeave = () => {
    if (hoveredBlockId.current !== null) {
      map.current.setFeatureState(
        { source: 'blocks', id: hoveredBlockId.current },
        { hover: false }
      );
    }
    hoveredBlockId.current = null;
  };

  // =========================================================================
  // MAP STYLE CHANGE
  // =========================================================================
  const handleStyleChange = (newStyle) => {
    if (!map.current || !mapLoaded) return;

    setMapStyle(newStyle);
    map.current.setStyle(`mapbox://styles/mapbox/${newStyle}`);

    // Re-add blocks after style loads
    map.current.once('style.load', () => {
      if (blocksData) {
        addBlocksToMap(blocksData);
      }
    });
  };

  // =========================================================================
  // OPACITY CHANGE
  // =========================================================================
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    if (map.current.getLayer('blocks-fill')) {
      map.current.setPaintProperty(
        'blocks-fill',
        'fill-opacity',
        blockOpacity
      );
    }
  }, [blockOpacity, mapLoaded]);

  // =========================================================================
  // FLY TO REGION
  // =========================================================================
  const flyToRegion = (region) => {
    if (!map.current || !region) return;

    if (region.bounds) {
      map.current.fitBounds([
        [region.bounds.min_lng, region.bounds.min_lat],
        [region.bounds.max_lng, region.bounds.max_lat]
      ], {
        padding: 50,
        duration: 1500
      });
    } else if (region.lat && region.lon) {
      map.current.flyTo({
        center: [region.lon, region.lat],
        zoom: 10,
        duration: 1500
      });
    }
  };

  // =========================================================================
  // RENDER
  // =========================================================================
  return (
    <div className="regional-map-container">
      {/* Map Canvas */}
      <div ref={mapContainer} className="map-canvas" />

      {/* Blocks Loading Indicator */}
      {blocksLoading && (
        <div className="blocks-loading">
          <div className="loading-spinner" />
          <span>Loading vineyard blocks...</span>
        </div>
      )}

      {/* Query Loading Indicator */}
      {queryLoading && (
        <div className="query-loading">
          <div className="loading-spinner" />
          <span>Loading block details...</span>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="query-error">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Sidebar Controls */}
      {isAuthenticated && mapLoaded && (
        <MapSidebar
          currentStyle={mapStyle}
          onStyleChange={handleStyleChange}
          opacity={blockOpacity}
          onOpacityChange={setBlockOpacity}
          regions={regions}
          onRegionClick={flyToRegion}
        />
      )}

      {/* Block Popup */}
      {selectedBlock && (
        <BlockPopup
          block={selectedBlock}
          onClose={() => setSelectedBlock(null)}
        />
      )}

      {/* Auth Message for Non-Authenticated Users */}
      {!isAuthenticated && (
        <div className="map-auth-overlay">
          <div className="auth-message">
            <h3>Sign in to explore vineyard blocks</h3>
            <p>Click anywhere on the map to discover New Zealand wine regions</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default RegionalMap;