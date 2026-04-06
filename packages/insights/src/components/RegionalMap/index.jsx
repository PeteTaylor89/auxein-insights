// src/components/RegionalMap/index.jsx
import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { usePublicAuth } from '../../contexts/PublicAuthContext';
import publicApi from '../../services/publicApi';
import BlockPopup from './BlockPopup';
import RegionPopup from './RegionPopup';
import GIPopup from './GIPopup';
import RegionStatsModal from './RegionStatsModal';
import ClimateZonePanel from './ClimateZonePanel';
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

// Layer styling
const BLOCK_FILL_COLOR = '#22c55e';
const BLOCK_FILL_OPACITY = 0.6;
const BLOCK_OUTLINE_COLOR = '#065f46';
const BLOCK_HOVER_COLOR = '#16a34a';

const REGION_FILL_COLOR = '#3b82f6';
const REGION_OUTLINE_COLOR = '#1d4ed8';

const GI_FILL_COLOR = '#8a5cf600';
const GI_OUTLINE_COLOR = '#961111';

const ZONE_FILL_COLOR = '#f59e0b';
const ZONE_OUTLINE_COLOR = '#d97706';

function RegionalMap() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const hoveredBlockId = useRef(null);
  const hoveredRegionId = useRef(null);
  const hoveredGIId = useRef(null);
  const hoveredZoneId = useRef(null);
  const { isAuthenticated } = usePublicAuth();

  // Map state
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapStyle, setMapStyle] = useState('satellite-streets-v12');

  // Data state
  const [blocksData, setBlocksData] = useState(null);
  const [regionsData, setRegionsData] = useState(null);
  const [gisData, setGisData] = useState(null);
  const [climateZonesData, setClimateZonesData] = useState(null);

  // Loading state
  const [blocksLoading, setBlocksLoading] = useState(false);
  const [queryLoading, setQueryLoading] = useState(false);
  const [error, setError] = useState(null);

  // Layer visibility — only blocks on by default; others load on first toggle
  const [showBlocks, setShowBlocks] = useState(true);
  const [showRegions, setShowRegions] = useState(false);
  const [showGIs, setShowGIs] = useState(false);
  const [showClimateZones, setShowClimateZones] = useState(false);

  // Layer opacity (0-1)
  const [blockOpacity, setBlockOpacity] = useState(0.7);
  const [regionOpacity, setRegionOpacity] = useState(0.3);
  const [giOpacity, setGIOpacity] = useState(0.0);
  const [climateZoneOpacity, setClimateZoneOpacity] = useState(0.35);

  // Selection state
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [selectedGI, setSelectedGI] = useState(null);
  const [statsModalRegion, setStatsModalRegion] = useState(null);
  const [selectedClimateZone, setSelectedClimateZone] = useState(null);

  // =========================================================================
  // MAP INITIALIZATION
  // =========================================================================
  useEffect(() => {
    if (map.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: `mapbox://styles/mapbox/${mapStyle}`,
      center: [171.5, -41.5],
      zoom: 5.5,
      minZoom: 5,
      maxZoom: 18,
      maxBounds: [
        [NZ_BOUNDS.min_lng - 2, NZ_BOUNDS.min_lat - 2],
        [NZ_BOUNDS.max_lng + 2, NZ_BOUNDS.max_lat + 2]
      ]
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
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

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // =========================================================================
  // LOAD ALL DATA (when authenticated and map loaded)
  // =========================================================================
  useEffect(() => {
    if (!mapLoaded || !isAuthenticated) return;

    // Only load blocks initially — other layers load on first toggle
    loadBlocks();
  }, [mapLoaded, isAuthenticated]);

  // Lazy-load regions when first toggled on
  useEffect(() => {
    if (showRegions && !regionsData && mapLoaded && isAuthenticated) {
      loadRegions();
    }
  }, [showRegions]);

  // Lazy-load GIs when first toggled on
  useEffect(() => {
    if (showGIs && !gisData && mapLoaded && isAuthenticated) {
      loadGIs();
    }
  }, [showGIs]);

  // Lazy-load climate zones when first toggled on
  useEffect(() => {
    if (showClimateZones && !climateZonesData && mapLoaded && isAuthenticated) {
      loadClimateZones();
    }
  }, [showClimateZones]);

  // =========================================================================
  // LOAD BLOCKS
  // =========================================================================
  const loadBlocks = async () => {
    if (blocksData) return;
    
    setBlocksLoading(true);
    setError(null);

    try {
      console.log('📡 Fetching blocks GeoJSON...');
      const response = await publicApi.get('/public/blocks/geojson');
      console.log(`✅ Loaded ${response.data.features.length} blocks`);
      setBlocksData(response.data);
    } catch (err) {
      console.error('❌ Error loading blocks:', err);
      if (err.response?.status === 429) {
        setError('Rate limit exceeded. Please try again later.');
      }
    } finally {
      setBlocksLoading(false);
    }
  };

  // =========================================================================
  // LOAD REGIONS
  // =========================================================================
  const loadRegions = async () => {
    if (regionsData) return;

    try {
      console.log('📡 Fetching regions GeoJSON...');
      const response = await publicApi.get('/public/regions/geojson');
      console.log(`✅ Loaded ${response.data.features.length} regions`);
      setRegionsData(response.data);
    } catch (err) {
      console.error('❌ Error loading regions:', err);
    }
  };

  // =========================================================================
  // LOAD GIs
  // =========================================================================
  const loadGIs = async () => {
    if (gisData) return;

    try {
      console.log('📡 Fetching GIs GeoJSON...');
      const response = await publicApi.get('/public/gis/geojson');
      console.log(`✅ Loaded ${response.data.features.length} GIs`);
      setGisData(response.data);
    } catch (err) {
      console.error('❌ Error loading GIs:', err);
    }
  };

  // =========================================================================
  // LOAD CLIMATE ZONES
  // =========================================================================
  const loadClimateZones = async () => {
    if (climateZonesData) return;

    try {
      console.log('📡 Fetching climate zones GeoJSON...');
      const response = await publicApi.get('/public/climate-zones/geojson');
      console.log(`✅ Loaded ${response.data.features.length} climate zones`);
      setClimateZonesData(response.data);
    } catch (err) {
      console.error('❌ Error loading climate zones:', err);
    }
  };

  // =========================================================================
  // ADD LAYERS TO MAP
  // =========================================================================
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    // Add regions layer (bottom)
    if (regionsData && showRegions) {
      addRegionsLayer();
    }

    // Add climate zones layer
    if (climateZonesData && showClimateZones) {
      addClimateZonesLayer();
    }

    // Add GIs layer (middle)
    if (gisData && showGIs) {
      addGIsLayer();
    }

    // Add blocks layer (top)
    if (blocksData && showBlocks) {
      addBlocksLayer();
    }
  }, [mapLoaded, blocksData, regionsData, gisData, climateZonesData]);

  // =========================================================================
  // ADD BLOCKS LAYER
  // =========================================================================
  const addBlocksLayer = () => {
    if (!map.current || !blocksData) return;

    try {
      // Remove existing
      removeLayer('blocks-fill');
      removeLayer('blocks-outline');
      removeSource('blocks');

      map.current.addSource('blocks', {
        type: 'geojson',
        data: blocksData,
        generateId: true
      });

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

      map.current.addLayer({
        id: 'blocks-outline',
        type: 'line',
        source: 'blocks',
        paint: {
          'line-color': BLOCK_OUTLINE_COLOR,
          'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 2, 1]
        }
      });

      // Click handler
      map.current.on('click', 'blocks-fill', handleBlockClick);
      
      // Hover handlers
      map.current.on('mousemove', 'blocks-fill', (e) => {
        if (e.features.length === 0) return;
        if (hoveredBlockId.current !== null) {
          map.current.setFeatureState(
            { source: 'blocks', id: hoveredBlockId.current },
            { hover: false }
          );
        }
        hoveredBlockId.current = e.features[0].id;
        map.current.setFeatureState(
          { source: 'blocks', id: hoveredBlockId.current },
          { hover: true }
        );
        map.current.getCanvas().style.cursor = 'pointer';
      });

      map.current.on('mouseleave', 'blocks-fill', () => {
        if (hoveredBlockId.current !== null) {
          map.current.setFeatureState(
            { source: 'blocks', id: hoveredBlockId.current },
            { hover: false }
          );
        }
        hoveredBlockId.current = null;
        map.current.getCanvas().style.cursor = '';
      });

      console.log('✅ Blocks layer added');
    } catch (err) {
      console.error('Error adding blocks layer:', err);
    }
  };

  // =========================================================================
  // ADD REGIONS LAYER
  // =========================================================================
  const addRegionsLayer = () => {
    if (!map.current || !regionsData) return;

    try {
      removeLayer('regions-fill');
      removeLayer('regions-outline');
      removeSource('regions');

      map.current.addSource('regions', {
        type: 'geojson',
        data: regionsData,
        generateId: true
      });

      map.current.addLayer({
        id: 'regions-fill',
        type: 'fill',
        source: 'regions',
        paint: {
          'fill-color': ['coalesce', ['get', 'color'], REGION_FILL_COLOR],
          'fill-opacity': regionOpacity
        }
      }, 'blocks-fill'); // Insert below blocks

      map.current.addLayer({
        id: 'regions-outline',
        type: 'line',
        source: 'regions',
        paint: {
          'line-color': REGION_OUTLINE_COLOR,
          'line-width': 2,
          'line-opacity': 0.8
        }
      }, 'blocks-fill');

      // Click handler
      map.current.on('click', 'regions-fill', handleRegionClick);

      // Hover
      map.current.on('mouseenter', 'regions-fill', () => {
        map.current.getCanvas().style.cursor = 'pointer';
      });
      map.current.on('mouseleave', 'regions-fill', () => {
        map.current.getCanvas().style.cursor = '';
      });

      console.log('✅ Regions layer added');
    } catch (err) {
      console.error('Error adding regions layer:', err);
    }
  };

  // =========================================================================
  // ADD GIs LAYER
  // =========================================================================
  const addGIsLayer = () => {
    if (!map.current || !gisData) return;

    try {
      removeLayer('gis-fill');
      removeLayer('gis-outline');
      removeSource('gis');

      map.current.addSource('gis', {
        type: 'geojson',
        data: gisData,
        generateId: true
      });

      map.current.addLayer({
        id: 'gis-fill',
        type: 'fill',
        source: 'gis',
        paint: {
          'fill-color': ['coalesce', ['get', 'color'], GI_FILL_COLOR],
          'fill-opacity': giOpacity
        }
      }, 'blocks-fill'); // Insert below blocks

      map.current.addLayer({
        id: 'gis-outline',
        type: 'line',
        source: 'gis',
        paint: {
          'line-color': GI_OUTLINE_COLOR,
          'line-width': 2
        }
      }, 'blocks-fill');

      // Click handler
      map.current.on('click', 'gis-fill', handleGIClick);

      // Hover
      map.current.on('mouseenter', 'gis-fill', () => {
        map.current.getCanvas().style.cursor = 'pointer';
      });
      map.current.on('mouseleave', 'gis-fill', () => {
        map.current.getCanvas().style.cursor = '';
      });

      console.log('✅ GIs layer added');
    } catch (err) {
      console.error('Error adding GIs layer:', err);
    }
  };

  // =========================================================================
  // ADD CLIMATE ZONES LAYER
  // =========================================================================
  const addClimateZonesLayer = () => {
    if (!map.current || !climateZonesData) return;

    try {
      removeLayer('climate-zones-fill');
      removeLayer('climate-zones-outline');
      removeSource('climate-zones');

      map.current.addSource('climate-zones', {
        type: 'geojson',
        data: climateZonesData,
        generateId: true
      });

      // Insert below blocks but above regions
      const beforeLayer = map.current.getLayer('blocks-fill') ? 'blocks-fill' : undefined;

      map.current.addLayer({
        id: 'climate-zones-fill',
        type: 'fill',
        source: 'climate-zones',
        paint: {
          'fill-color': ZONE_FILL_COLOR,
          'fill-opacity': climateZoneOpacity
        }
      }, beforeLayer);

      map.current.addLayer({
        id: 'climate-zones-outline',
        type: 'line',
        source: 'climate-zones',
        paint: {
          'line-color': ZONE_OUTLINE_COLOR,
          'line-width': 2,
          'line-dasharray': [3, 2]
        }
      }, beforeLayer);

      // Click — open climate data for the zone
      map.current.on('click', 'climate-zones-fill', handleClimateZoneClick);

      // Hover
      map.current.on('mouseenter', 'climate-zones-fill', () => {
        map.current.getCanvas().style.cursor = 'pointer';
      });
      map.current.on('mouseleave', 'climate-zones-fill', () => {
        map.current.getCanvas().style.cursor = '';
      });

      console.log('✅ Climate zones layer added');
    } catch (err) {
      console.error('Error adding climate zones layer:', err);
    }
  };

  // =========================================================================
  // HELPER: Remove layer/source safely
  // =========================================================================
  const removeLayer = (layerId) => {
    if (map.current?.getLayer(layerId)) {
      map.current.removeLayer(layerId);
    }
  };

  const removeSource = (sourceId) => {
    if (map.current?.getSource(sourceId)) {
      map.current.removeSource(sourceId);
    }
  };

  // =========================================================================
  // CLICK HANDLERS
  // =========================================================================
  const handleBlockClick = async (e) => {
    if (!e.features || e.features.length === 0) return;
    e.originalEvent.stopPropagation();

    const feature = e.features[0];
    const blockId = feature.properties.id;
    
    setQueryLoading(true);
    setSelectedBlock(null);
    setSelectedRegion(null);
    setSelectedGI(null);

    try {
      const response = await publicApi.get(`/public/blocks/${blockId}`);
      setSelectedBlock({
        ...response.data,
        coordinates: [e.lngLat.lng, e.lngLat.lat]
      });
    } catch (err) {
      console.error('Block query error:', err);
      setError('Failed to load block details.');
    } finally {
      setQueryLoading(false);
    }
  };

  const handleRegionClick = (e) => {
    if (!e.features || e.features.length === 0) return;
    e.originalEvent.stopPropagation();

    const feature = e.features[0];
    setSelectedBlock(null);
    setSelectedGI(null);
    setSelectedRegion({
      slug: feature.properties.slug,
      name: feature.properties.name,
      coordinates: [e.lngLat.lng, e.lngLat.lat]
    });
  };

    const handleGIClick = (e) => {
    if (!e.features || e.features.length === 0) return;
    e.originalEvent.stopPropagation();

    let feature = e.features[0];
    
    if (e.features.length > 1) {
        // Select the smallest GI by calculating approximate area from geometry
        feature = e.features.reduce((smallest, current) => {
        const calcArea = (f) => {
            try {
            const coords = f.geometry.coordinates;
            // For MultiPolygon/Polygon, get rough bounding box size
            let minLng = Infinity, maxLng = -Infinity;
            let minLat = Infinity, maxLat = -Infinity;
            
            const processCoords = (arr) => {
                arr.forEach(item => {
                if (Array.isArray(item[0])) {
                    processCoords(item);
                } else {
                    minLng = Math.min(minLng, item[0]);
                    maxLng = Math.max(maxLng, item[0]);
                    minLat = Math.min(minLat, item[1]);
                    maxLat = Math.max(maxLat, item[1]);
                }
                });
            };
            
            processCoords(coords);
            return (maxLng - minLng) * (maxLat - minLat);
            } catch {
            return Infinity;
            }
        };
        
        return calcArea(current) < calcArea(smallest) ? current : smallest;
        }, e.features[0]);
        
        console.log(`📍 Multiple GIs at click point, selected: ${feature.properties.name}`);
    }

    setSelectedBlock(null);
    setSelectedRegion(null);
    setSelectedGI({
        slug: feature.properties.slug,
        name: feature.properties.name,
        coordinates: [e.lngLat.lng, e.lngLat.lat]
    });
    };

  // =========================================================================
  // CLIMATE ZONE CLICK HANDLER
  // =========================================================================
  const handleClimateZoneClick = (e) => {
    if (!e.features || e.features.length === 0) return;
    e.originalEvent.stopPropagation();

    const feature = e.features[0];
    const zone = {
      slug: feature.properties.slug,
      name: feature.properties.name,
      region_name: feature.properties.region_name,
      coordinates: [e.lngLat.lng, e.lngLat.lat]
    };

    setSelectedBlock(null);
    setSelectedRegion(null);
    setSelectedGI(null);
    setSelectedClimateZone(zone);
  };

  // =========================================================================
  // LAYER VISIBILITY TOGGLES
  // =========================================================================
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const blocksVisible = showBlocks ? 'visible' : 'none';
    if (map.current.getLayer('blocks-fill')) {
      map.current.setLayoutProperty('blocks-fill', 'visibility', blocksVisible);
      map.current.setLayoutProperty('blocks-outline', 'visibility', blocksVisible);
    }
  }, [showBlocks, mapLoaded]);

  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const regionsVisible = showRegions ? 'visible' : 'none';
    if (map.current.getLayer('regions-fill')) {
      map.current.setLayoutProperty('regions-fill', 'visibility', regionsVisible);
      map.current.setLayoutProperty('regions-outline', 'visibility', regionsVisible);
    }
  }, [showRegions, mapLoaded]);

  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const gisVisible = showGIs ? 'visible' : 'none';
    if (map.current.getLayer('gis-fill')) {
      map.current.setLayoutProperty('gis-fill', 'visibility', gisVisible);
      map.current.setLayoutProperty('gis-outline', 'visibility', gisVisible);
    }
  }, [showGIs, mapLoaded]);

  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const zonesVisible = showClimateZones ? 'visible' : 'none';
    if (map.current.getLayer('climate-zones-fill')) {
      map.current.setLayoutProperty('climate-zones-fill', 'visibility', zonesVisible);
      map.current.setLayoutProperty('climate-zones-outline', 'visibility', zonesVisible);
    }
  }, [showClimateZones, mapLoaded]);

  // =========================================================================
  // OPACITY UPDATES
  // =========================================================================
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    if (map.current.getLayer('blocks-fill')) {
      map.current.setPaintProperty('blocks-fill', 'fill-opacity', blockOpacity);
    }
  }, [blockOpacity, mapLoaded]);

  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    if (map.current.getLayer('regions-fill')) {
      map.current.setPaintProperty('regions-fill', 'fill-opacity', regionOpacity);
    }
  }, [regionOpacity, mapLoaded]);

  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    if (map.current.getLayer('gis-fill')) {
      map.current.setPaintProperty('gis-fill', 'fill-opacity', giOpacity);
    }
  }, [giOpacity, mapLoaded]);

  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    if (map.current.getLayer('climate-zones-fill')) {
      map.current.setPaintProperty('climate-zones-fill', 'fill-opacity', climateZoneOpacity);
    }
  }, [climateZoneOpacity, mapLoaded]);

  // =========================================================================
  // STYLE CHANGE
  // =========================================================================
  const handleStyleChange = (newStyle) => {
    if (!map.current || !mapLoaded) return;

    setMapStyle(newStyle);
    map.current.setStyle(`mapbox://styles/mapbox/${newStyle}`);

    // Re-add all layers after style loads
    map.current.once('style.load', () => {
      if (regionsData) addRegionsLayer();
      if (climateZonesData) addClimateZonesLayer();
      if (gisData) addGIsLayer();
      if (blocksData) addBlocksLayer();
    });
  };

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
    }
  };

  // =========================================================================
  // RENDER
  // =========================================================================
  return (
    <div className="regional-map-container">
      <div ref={mapContainer} className="map-canvas" />

      {/* Loading Indicators */}
      {blocksLoading && (
        <div className="blocks-loading">
          <div className="loading-spinner" />
          <span>Loading vineyard blocks...</span>
        </div>
      )}

      {queryLoading && (
        <div className="query-loading">
          <div className="loading-spinner" />
          <span>Loading details...</span>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="query-error">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Sidebar */}
      {isAuthenticated && mapLoaded && (
        <MapSidebar
          currentStyle={mapStyle}
          onStyleChange={handleStyleChange}
          // Blocks
          opacity={blockOpacity}
          onOpacityChange={setBlockOpacity}
          showBlocks={showBlocks}
          onToggleBlocks={() => setShowBlocks(!showBlocks)}
          // Climate Zones
          showClimateZones={showClimateZones}
          onToggleClimateZones={() => setShowClimateZones(!showClimateZones)}
          climateZoneOpacity={climateZoneOpacity}
          onClimateZoneOpacityChange={setClimateZoneOpacity}
          // Regions
          showRegions={showRegions}
          onToggleRegions={() => setShowRegions(!showRegions)}
          regionOpacity={regionOpacity}
          onRegionOpacityChange={setRegionOpacity}
          // GIs
          showGIs={showGIs}
          onToggleGIs={() => setShowGIs(!showGIs)}
          giOpacity={giOpacity}
          onGIOpacityChange={setGIOpacity}
          // Navigation
          onRegionClick={flyToRegion}
        />
      )}

      {/* Popups */}
      {selectedBlock && (
        <BlockPopup
          block={selectedBlock}
          onClose={() => setSelectedBlock(null)}
        />
      )}

      {selectedRegion && (
        <div className="map-popup-overlay" onClick={() => setSelectedRegion(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            <RegionPopup
              region={selectedRegion}
              onClose={() => setSelectedRegion(null)}
              onExploreStats={(details) => {
                setStatsModalRegion(details);
                setSelectedRegion(null);
              }}
            />
          </div>
        </div>
      )}

      {selectedGI && (
        <div className="map-popup-overlay" onClick={() => setSelectedGI(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            <GIPopup
              gi={selectedGI}
              onClose={() => setSelectedGI(null)}
            />
          </div>
        </div>
      )}

      {selectedClimateZone && (
        <ClimateZonePanel
          zone={selectedClimateZone}
          onClose={() => setSelectedClimateZone(null)}
        />
      )}

        {/* Stats Modal */}
        {statsModalRegion && (
        console.log('📊 Rendering stats modal for:', statsModalRegion.name),
        <RegionStatsModal
            region={statsModalRegion}
            onClose={() => setStatsModalRegion(null)}
        />
        )}

      {/* Auth Message */}
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