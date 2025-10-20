import { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import MapboxGeocoder from '@mapbox/mapbox-gl-geocoder';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import '@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useAuth } from '@vineyard/shared';
import MobileNavigation from '../components/MobileNavigation';
import {blocksService, parcelsService, companiesService, spatialAreasService, vineyardRowsService, riskManagementService} from '@vineyard/shared';
import * as turf from '@turf/turf';
import SlidingEditForm from '../components/SlidingEditForm';
import SpatialAreaSlidingEditForm from '../components/SpatialAreasSlidingEditForm';

const __MAPBOX_TOKEN__ =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_MAPBOX_TOKEN) ||
  (typeof process !== 'undefined' && process.env && (process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.REACT_APP_MAPBOX_TOKEN)) ||
  '';

if (!__MAPBOX_TOKEN__) {
  console.error(
    'Missing Mapbox token. Set VITE_MAPBOX_TOKEN in your .env (root).'
  );
}
mapboxgl.accessToken = __MAPBOX_TOKEN__;

function showDraftGeometry(map, geometry) {
  const sourceId = 'draft-geom-src';
  const fillLayerId = 'draft-geom-fill';
  const lineLayerId = 'draft-geom-line';

  try {
    if (map.getLayer(fillLayerId)) map.removeLayer(fillLayerId);
    if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);
  } catch (e) {
    console.warn('Cleanup draft geom (pre):', e);
  }

  map.addSource(sourceId, {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry,
      properties: {}
    }
  });

  map.addLayer({
    id: fillLayerId,
    type: 'fill',
    source: sourceId,
    paint: {
      'fill-color': '#3b82f6',
      'fill-opacity': 0.25
    }
  });

  map.addLayer({
    id: lineLayerId,
    type: 'line',
    source: sourceId,
    paint: {
      'line-color': '#3b82f6',
      'line-width': 2
    }
  });
}



function clearDraftGeometry(map) {
  const sourceId = 'draft-geom-src';
  const fillLayerId = 'draft-geom-fill';
  const lineLayerId = 'draft-geom-line';

  try {
    if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId);
    if (map.getLayer(fillLayerId)) map.removeLayer(fillLayerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);
  } catch (e) {
    console.warn('Cleanup draft geom:', e);
  }
}

function freezeDrawing(drawControl, map) {
  try {
    // Drop any live Draw features & exit interactive modes
    drawControl?.deleteAll();
    drawControl?.changeMode('simple_select');
  } catch (e) {
    console.warn('freezeDrawing error:', e);
  }
}

const SPLIT_MASK_SOURCE_ID = 'split-mode-mask-src';
const SPLIT_MASK_LAYER_ID  = 'split-mode-mask-layer';

const WORLD_POLY = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]
        ]]
      }
    }
  ]
};

function addSplitMask(map) {
  if (!map?.current) return;
  try {
    if (!map.current.getSource(SPLIT_MASK_SOURCE_ID)) {
      map.current.addSource(SPLIT_MASK_SOURCE_ID, { type: 'geojson', data: WORLD_POLY });
    }
    if (!map.current.getLayer(SPLIT_MASK_LAYER_ID)) {
      map.current.addLayer({
        id: SPLIT_MASK_LAYER_ID,
        type: 'fill',
        source: SPLIT_MASK_SOURCE_ID,
        paint: { 'fill-opacity': 0 },
      });
    }

    if (!splitMaskStopHandler) {
      splitMaskStopHandler = (e) => {
        if (e?.preventDefault) e.preventDefault();
        if (e?.originalEvent?.stopPropagation) e.originalEvent.stopPropagation();
      };
    }

    // attach using the SAME function reference we’ll later remove
    const m = map.current;
    m.on('mousedown', SPLIT_MASK_LAYER_ID, splitMaskStopHandler);
    m.on('click', SPLIT_MASK_LAYER_ID, splitMaskStopHandler);
    m.on('mouseup', SPLIT_MASK_LAYER_ID, splitMaskStopHandler);
    m.on('touchstart', SPLIT_MASK_LAYER_ID, splitMaskStopHandler);
    m.on('touchend', SPLIT_MASK_LAYER_ID, splitMaskStopHandler);
    m.on('dblclick', SPLIT_MASK_LAYER_ID, splitMaskStopHandler);
    m.on('contextmenu', SPLIT_MASK_LAYER_ID, splitMaskStopHandler);
  } catch (e) {
    console.warn('addSplitMask error', e);
  }
}

function removeSplitMask(map) {
  if (!map?.current) return;
  try {
    const m = map.current;
    if (splitMaskStopHandler && m.getLayer(SPLIT_MASK_LAYER_ID)) {
      m.off('mousedown', SPLIT_MASK_LAYER_ID, splitMaskStopHandler);
      m.off('click', SPLIT_MASK_LAYER_ID, splitMaskStopHandler);
      m.off('mouseup', SPLIT_MASK_LAYER_ID, splitMaskStopHandler);
      m.off('touchstart', SPLIT_MASK_LAYER_ID, splitMaskStopHandler);
      m.off('touchend', SPLIT_MASK_LAYER_ID, splitMaskStopHandler);
      m.off('dblclick', SPLIT_MASK_LAYER_ID, splitMaskStopHandler);
      m.off('contextmenu', SPLIT_MASK_LAYER_ID, splitMaskStopHandler);
    }
    if (m.getLayer(SPLIT_MASK_LAYER_ID)) m.removeLayer(SPLIT_MASK_LAYER_ID);
    if (m.getSource(SPLIT_MASK_SOURCE_ID)) m.removeSource(SPLIT_MASK_SOURCE_ID);
  } catch (e) {
    console.warn('removeSplitMask error', e);
  }
}

function setSplitModeActive(active, map, setMode, currentPopup) {
  setMode(active ? 'split' : 'idle');

  // Disable map's double-click zoom while drawing the split line
  try {
    if (map?.current?.doubleClickZoom) {
      map.current.doubleClickZoom[active ? 'disable' : 'enable']();
    }
  } catch (e) {
    console.warn('doubleClickZoom toggle failed', e);
  }

  // Close any open popup so it doesn't get in the way
  if (currentPopup?.current) {
    currentPopup.current.remove();
    currentPopup.current = null;
  }
}

function resolveViewerRole(user) {
  const AUXEIN_ADMIN_EMAIL = "pete.taylor@auxein.co.nz"; // MVP hard-code
  const isAuxeinAdmin =
    !!user?.email && user.email.toLowerCase() === AUXEIN_ADMIN_EMAIL;
  return {
    scope: isAuxeinAdmin ? "global" : "company",
    isAuxeinAdmin,
    companyId: user?.company_id ?? user?.companyId ?? null,
  };
}

function Maps() {
  const { user } = useAuth();
  const { scope, isAuxeinAdmin, companyId } = useMemo(
    () => resolveViewerRole(user),
    [user]
  );
  const isCompanyScope = scope === 'company';
  const [blockToSplit, setBlockToSplit] = useState(null);
  const [splitLineDrawn, setSplitLineDrawn] = useState(null);
  const blockToSplitRef = useRef(null);
  const splitLineRef = useRef(null);
  const navigate = useNavigate();
  useEffect(() => {
    blockToSplitRef.current = blockToSplit;
  }, [blockToSplit]);
  const scopeKey = useMemo(() => {
    return scope === "global" ? "global" : `company:${companyId ?? "none"}`;
  }, [scope, companyId]);
  const [initialFitDone, setInitialFitDone] = useState(false);
  const [userInteracted, setUserInteracted] = useState(false);
  const mapContainer = useRef(null);
  const map = useRef(null);
  const drawControl = useRef(null);
  
  const [apiStatus, setApiStatus] = useState('Loading...');
  const [blockCount, setBlockCount] = useState(0);
  const [ownBlockCount, setOwnBlockCount] = useState(0);
  const [mapStyle, setMapStyle] = useState('mapbox://styles/mapbox/satellite-streets-v12');
  const [drawingCoordinates, setDrawingCoordinates] = useState(null);
  const [newBlockInfo, setNewBlockInfo] = useState({
    block_name: '',
    variety: '',
    area: 0,
    centroid_longitude: null,
    centroid_latitude: null
  });
  const [showDrawingForm, setShowDrawingForm] = useState(false);
  const [mode, setMode] = useState('idle');
  const [isSplitProcessing, setIsSplitProcessing] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  
  const [blocksData, setBlocksData] = useState(null);
  const [blockOpacity, setBlockOpacity] = useState(0); // Default opacity
  const [showEditForm, setShowEditForm] = useState(false);
  const [editSpatialAreaData, setEditSpatialAreaData] = useState(null);
  const [showEditSpatialAreaForm, setShowEditSpatialAreaForm] = useState(false);
  const [editBlockData, setEditBlockData] = useState(null);
  const [isEditingBlockArea, setIsEditingBlockArea] = useState(false);
  const [editingBlockFeature, setEditingBlockFeature] = useState(null);
  const editingDrawFeatureIdRef = useRef(null);

  const mapStyles = [
    { id: 'mapbox://styles/mapbox/streets-v12', name: 'Streets' },
    { id: 'mapbox://styles/mapbox/satellite-streets-v12', name: 'Satellite' },
    { id: 'mapbox://styles/mapbox/outdoors-v12', name: 'Outdoors' }, 
    { id: 'mapbox://styles/mapbox/satellite-v9', name: '3D Satellite', is3D: true }
  ];

  const [is3DMode, setIs3DMode] = useState(false);
  const [terrainExaggeration, setTerrainExaggeration] = useState(1);
  const [parcelsData, setParcelsData] = useState(null);
  const [showParcelsLayer, setShowParcelsLayer] = useState(false);
  const [isLoadingParcels, setIsLoadingParcels] = useState(false);
  const [parcelCount, setParcelCount] = useState(0);
  const [assignedParcelCount, setAssignedParcelCount] = useState(0);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [selectedParcelForAssignment, setSelectedParcelForAssignment] = useState(null);
  const [availableCompanies, setAvailableCompanies] = useState([]);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(false);
  const [assignmentFormData, setAssignmentFormData] = useState({
    company_id: '',
    ownership_type: 'full',
    ownership_percentage: 100.0,
    verification_method: 'manual',
    notes: ''
  });
  const [showBlockAssignmentModal, setShowBlockAssignmentModal] = useState(false);
  const [selectedBlockForAssignment, setSelectedBlockForAssignment] = useState(null);
  const [blockAssignmentFormData, setBlockAssignmentFormData] = useState({
    company_id: '',
    notes: ''
  });
  const [risksGeoJSON, setRisksGeoJSON] = useState({ type: 'FeatureCollection', features: [] });
  const [riskFilters, setRiskFilters] = useState({
    risk_type: '',      
    risk_level: '',     
    status: 'active'      
  });
  const [showRisksLayer, setShowRisksLayer] = useState(false);
  const SPATIAL_SRC_ID = 'spatial-areas';
  const L_SPATIAL_FILL = 'spatial-areas-fill';
  const L_SPATIAL_LINE = 'spatial-areas-outline';
  const L_SPATIAL_LABEL = 'spatial-areas-labels';
  const [isMapping, setIsMapping] = useState(false);
  const [mappingType, setMappingType] = useState(''); 
  const [spatialAreaType, setSpatialAreaType] = useState('');
  const [spatialAreasData, setSpatialAreasData] = useState(null);
  const [showSpatialAreasLayer, setShowSpatialAreasLayer] = useState(false);
  const [spatialAreaOpacity, setSpatialAreaOpacity] = useState(0.5);
  const [spatialAreaCount, setSpatialAreaCount] = useState(0);
  const splitMaskHandlersRef = useRef(null);
  let splitMaskStopHandler = null;
  const [isEditedPolygonValid, setIsEditedPolygonValid] = useState(true);
  const modeRef = useRef('idle');
  useEffect(() => { modeRef.current = mode; }, [mode]);
  const [currentLocation, setCurrentLocation] = useState(null);
  const mapHandlersRef = useRef({ onClick: null, onTouchEnd: null });
  const withStyleReady = (fn) => {
    if (!map.current) return;
    if (map.current.isStyleLoaded()) { fn(); }
    else { map.current.once('style.load', fn); }
  };

  const handleCreateRows = async (rowCreationData) => {
    try {
      const result = await vineyardRowsService.bulkCreateRows(rowCreationData);
      return result;
    } catch (error) {
      throw error;
    }
  };

  const CLICK_PRIORITY = [
    'risks-circles',
    'observations-symbol',
    'tasks-symbol',
    'incidents-symbol',
    'vineyard-blocks-fill'
  ];
  
  const handleStyleChange = (styleId) => {
    if (!map.current) return;

    const selected = mapStyles.find(s => s.id === styleId);
    const wants3D = !!selected?.is3D;
    const actualStyleId = selected?.baseStyle || styleId;

    // update local UI state
    setMapStyle(styleId);
    setIs3DMode(wants3D);

    // Clear terrain before swapping styles (prevents odd “carry-over”)
    try { map.current.setTerrain(null); } catch {}
    try { if (map.current.getLayer('sky')) map.current.removeLayer('sky'); } catch {}
    try { if (map.current.getSource('mapbox-dem')) map.current.removeSource('mapbox-dem'); } catch {}

    // Swap the base style
    map.current.setStyle(actualStyleId);

    // When the new style is ready, reapply terrain (if needed) and re-add layers once
    map.current.once('style.load', () => {
      if (wants3D) add3DTerrain(); else remove3DTerrain();

      // Reattach your data layers using the latest state
      if (blocksData) addBlocksToMap(blocksData, user?.company_id);
      if (spatialAreasData) addSpatialAreasToMap(spatialAreasData, user?.company_id);
      if (parcelsData) addParcelsToMap(parcelsData);
      if (risksGeoJSON) addRisksToMap(risksGeoJSON);

      // Smoothly pitch the camera for 3D/2D
      map.current.easeTo({ pitch: wants3D ? 45 : 0, bearing: 0, duration: 800 });
    });
  };

  const handleRiskClick = (e) => {
    if (!e?.features?.length) return;

    const f = e.features[0];
    const p = f.properties || {};

    // Close any existing popup
    if (currentPopup.current) {
      currentPopup.current.remove();
      currentPopup.current = null;
    }

      const html = `
        <div class="map-popup owned mobile-optimized">
          <h3>${p.risk_title || 'Risk'}</h3>
          <div class="popup-details">
            <div><strong>Type:</strong> ${p.risk_type || '—'}</div>
            <div><strong>Level:</strong> ${p.risk_level || '—'}</div>
            ${p.risk_score ? `<div><strong>Score:</strong> ${p.risk_score}</div>` : ''}
            <div><strong>Status:</strong> ${p.status || 'active'}</div>
            <div><strong>ID:</strong> ${p.id || '—'}</div>
          </div>
          <div class="popup-actions mobile-actions">
            <button 
              class="popup-button mobile-button touch-friendly"
              onclick="window.openRiskForEdit('${p.id}')">
              Open Risk
            </button>
          </div>
        </div>
      `;

    const popup = new mapboxgl.Popup({
      closeButton: true,
      closeOnClick: true,
      maxWidth: 'min(90vw, 400px)',
      className: 'mobile-friendly-popup',
      anchor: 'top',
      focusAfterOpen: false
    })
      .setLngLat(e.lngLat)
      .setHTML(html)
      .addTo(map.current);

    currentPopup.current = popup;
  };

  const add3DTerrain = () => {
    if (!map.current?.getSource('mapbox-dem')) {
      map.current.addSource('mapbox-dem', {
        type: 'raster-dem',
        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512,
        maxzoom: 14
      });
    }

    // set the terrain and sky AFTER the dem is added
    map.current.setTerrain({ source: 'mapbox-dem', exaggeration: 1.2 });

    if (!map.current.getLayer('sky')) {
      map.current.addLayer({
        id: 'sky',
        type: 'sky',
        paint: {
          'sky-type': 'atmosphere',
          'sky-atmosphere-sun': [0.0, 0.0],
          'sky-atmosphere-sun-intensity': 15
        }
      });
    }
  };

  const remove3DTerrain = () => {
    if (!map.current) return;
    
    try {
      map.current.setTerrain(null);
      if (map.current.getLayer('sky')) {
        map.current.removeLayer('sky');
      }
      if (map.current.getSource('mapbox-dem')) {
        map.current.removeSource('mapbox-dem');
      }
      map.current.setLight({});
      setApiStatus('3D terrain disabled');
    } catch (error) {
      console.error('Error removing 3D terrain:', error);
    }
  };

  const toggle3DMode = () => {
    const newIs3D = !is3DMode;
    setIs3DMode(newIs3D);
    
    if (newIs3D) {
      add3DTerrain();
      map.current.easeTo({
        pitch: 45,
        bearing: 0,
        duration: 1500
      });
    } else {
      remove3DTerrain();
      map.current.easeTo({
        pitch: 0,
        bearing: 0,
        duration: 1500
      });
    }
  };

  const loadRisksData = async (filters = {}) => {
    try {
      // 1) Get list (filtered)
      const list = await riskManagementService.getRisksWithFilters({
        ...filters,
        limit: 100
      }); // returns SiteRiskSummary items (no geometry) :contentReference[oaicite:2]{index=2}

      // 2) Fetch details in parallel to get geometry (location as GeoJSON) :contentReference[oaicite:3]{index=3}
      const detailPromises = list.map(r => riskManagementService.getRiskById(r.id));
      const details = await Promise.allSettled(detailPromises);

      // 3) Build FeatureCollection
      const features = [];
      details.forEach((res, idx) => {
        if (res.status !== 'fulfilled') return;
        const risk = res.value;
        const loc = risk.location; // Point GeoJSON from SiteRiskResponse model validator :contentReference[oaicite:4]{index=4}
        if (!loc || loc.type !== 'Point') return;

        const summary = list[idx]; // keep list fields (level/score/type)
        features.push({
          type: 'Feature',
          geometry: loc,
          properties: {
            id: summary.id,
            risk_title: summary.risk_title,
            risk_type: summary.risk_type,
            risk_level: summary.inherent_risk_level,         // 'low' | 'medium' | 'high' | 'critical'
            risk_score: summary.inherent_risk_score,
            status: summary.status || 'active'
          }
        });
      });

      setRisksGeoJSON({ type: 'FeatureCollection', features });
    } catch (err) {
      console.error('Failed loading risks:', err);
      setRisksGeoJSON({ type: 'FeatureCollection', features: [] });
    }
  };

  const addRisksToMap = (geojson) => {
    if (!map.current || !geojson) return;

    withStyleReady(() => {
      try {
        if (map.current.getLayer('risks-circles')) map.current.removeLayer('risks-circles');
        if (map.current.getSource('risks')) map.current.removeSource('risks');

        map.current.addSource('risks', {
          type: 'geojson',
          data: geojson,
        });

        const circleColor = [
          'match',
          ['downcase', ['coalesce', ['to-string', ['get', 'risk_level']], '']],
          'low', '#22c55e',
          'medium', '#f59e0b',
          'high', '#ef4444',
          'critical', '#991b1b',
          /* default */ '#6b7280'
        ];

        map.current.addLayer({
          id: 'risks-circles',
          type: 'circle',
          source: 'risks',
          paint: {
            'circle-color': circleColor,
            'circle-opacity': 0.9,
            'circle-radius': [
              'interpolate', ['linear'], ['zoom'],
              8, 4,   // small at low zoom
              12, 6,
              16, 8   // larger when zoomed in
            ],
            'circle-stroke-color': '#111827',
            'circle-stroke-width': 1
          },
          layout: {
            'visibility': showRisksLayer ? 'visible' : 'none'
          }
        });

        map.current.off('click', 'risks-circles', handleRiskClick);
        map.current.on('click', 'risks-circles', handleRiskClick);

        map.current.off('mouseenter', 'risks-circles');
        map.current.off('mouseleave', 'risks-circles');
        map.current.on('mouseenter', 'risks-circles', () => {
          if (!('ontouchstart' in window)) map.current.getCanvas().style.cursor = 'pointer';
        });
        map.current.on('mouseleave', 'risks-circles', () => {
          if (!('ontouchstart' in window)) map.current.getCanvas().style.cursor = '';
        });
      } catch (e) {
        console.error('Error adding risks layer:', e);
      }
    });
  };

  useEffect(() => {
    if (!map.current) return;
    withStyleReady(() => addRisksToMap(risksGeoJSON));
  }, [risksGeoJSON, showRisksLayer]);

  useEffect(() => {
    loadRisksData(riskFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadRisksData(riskFilters);
  }, [riskFilters]);

  useEffect(() => {
    if (!map.current || !drawControl.current) return;

    const validateCurrentEdit = () => {
      try {
        const id = editingDrawFeatureIdRef.current;
        if (!id) return;
        const f = drawControl.current.get(id);
        if (!f || f.geometry?.type !== 'Polygon') {
          setIsEditedPolygonValid(false);
          return;
        }
        // reuse your client validator if available; otherwise quick checks:
        //  - at least 4 points (closed ring)
        //  - non-empty and valid shape (Draw prevents self-intersections in many cases, but we still guard)
        const coords = f.geometry.coordinates?.[0] ?? [];
        const hasMinPoints = Array.isArray(coords) && coords.length >= 4;
        setIsEditedPolygonValid(!!hasMinPoints);
      } catch {
        setIsEditedPolygonValid(false);
      }
    };

    const onUpdate = () => validateCurrentEdit();
    const onChange = () => validateCurrentEdit();
    const onSelectionChange = () => validateCurrentEdit();

    map.current.on('draw.update', onUpdate);
    map.current.on('draw.change', onChange);
    map.current.on('draw.selectionchange', onSelectionChange);

    return () => {
      try { map.current.off('draw.update', onUpdate); } catch {}
      try { map.current.off('draw.change', onChange); } catch {}
      try { map.current.off('draw.selectionchange', onSelectionChange); } catch {}
    };
  }, [map, isEditingBlockArea]);

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === 'Escape') {

        if (isEditingBlockArea) {
          cancelEditBlockArea();
          setApiStatus('Edit cancelled');
          return; 
        }

        if (blockToSplit) {
          console.log('Escape pressed - cancelling split mode');
          console.log('blockToSplit before cancel:', blockToSplit?.properties?.block_name);

          setBlockToSplit(null);
          setSplitLineDrawn(null);
          try { drawControl.current?.deleteAll(); } catch {}
          try { drawControl.current?.changeMode('simple_select'); } catch {}
          removeSplitMask(map);                     // ensure mask is gone
          setSplitModeActive(false, map, setMode, currentPopup); // re-enable dclk zoom etc.
          setApiStatus('Split cancelled');
          return;
        }
      }
      if (e.ctrlKey) {
        switch (e.key) {
          case '3': {
            e.preventDefault();
            toggle3DMode();
            break;
          }
          case 'r': {
            if (is3DMode && map.current) {
              e.preventDefault();
              map.current.easeTo({
                bearing: 0,
                pitch: 45,
                duration: 1000
              });
            }
            break;
          }
          default:
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [
    is3DMode,
    blockToSplit,
    isEditingBlockArea,  
    map
  ]);


  const touchStartTime = useRef(null);
  const touchStartPosition = useRef(null);
  const isLongPress = useRef(false);
  const currentPopup = useRef(null);

  const spatialAreaTypes = [
    { value: 'paddock', label: 'Paddock' },
    { value: 'orchard', label: 'Orchard' },
    { value: 'plantation_forestry', label: 'Plantation Forestry' },
    { value: 'native_forest', label: 'Native Forest' },
    { value: 'infrastructure_zone', label: 'Infrastructure Zone' },
    { value: 'waterway', label: 'Waterway' },
    { value: 'wetland', label: 'Wetland' },
    { value: 'conservation_area', label: 'Conservation Area' },
    { value: 'waste_management', label: 'Waste Management' }
  ];

  const startMapping = () => {
    setIsMapping(true);
    setApiStatus('Draw your area on the map');
    
  };

  const startEditBlockArea = (blockFeature) => {
    if (!map.current || !drawControl.current || !blockFeature) return;

    // Hard stop any other mapping modes you have
    try { freezeDrawing(drawControl.current, map.current); } catch {}
    setIsEditingBlockArea(true);
    setEditingBlockFeature(blockFeature);

    // Load the block polygon into Draw as a feature
    const featureToEdit = {
      id: `edit-block-${blockFeature.properties.id}`,
      type: 'Feature',
      properties: { source: 'block-edit', block_id: blockFeature.properties.id },
      geometry: blockFeature.geometry
    };

    try {
      drawControl.current.add(featureToEdit);
      editingDrawFeatureIdRef.current = featureToEdit.id;
      drawControl.current.changeMode('direct_select', { featureId: featureToEdit.id });
    } catch (e) {
      console.error('Failed to enter edit mode:', e);
    }
  };

  const cancelEditBlockArea = () => {
    if (!map.current || !drawControl.current) return;
    try { drawControl.current.deleteAll(); } catch {}
    try { drawControl.current.changeMode('simple_select'); } catch {}
    setIsEditingBlockArea(false);
    setEditingBlockFeature(null);
    editingDrawFeatureIdRef.current = null;
    try { clearDraftGeometry(map.current); } catch {}
  };

  const saveEditedBlockArea = async () => {
    if (!map.current || !drawControl.current || !editingBlockFeature) return;
    const featureId = editingDrawFeatureIdRef.current;
    if (!featureId) return;
    try {
      const edited = drawControl.current.get(featureId);
      if (!edited || edited.type !== 'Feature' || edited.geometry?.type !== 'Polygon') {
        throw new Error('Edited geometry must be a Polygon');
      }

      const blockId = editingBlockFeature.properties.id;
      try { blocksService.validateBlockGeometry(edited.geometry); } catch (e) { throw e; }

      const result = await blocksService.updateBlockGeometry(blockId, edited.geometry);
      cancelEditBlockArea();
      await loadBlocksData();

      console.log('Block updated:', result?.area, 'ha');
    } catch (e) {
      console.error('Saving edited block failed:', e);

    }
  };

  useEffect(() => {
    if (!map.current || !spatialAreasData) return;
    withStyleReady(() => addSpatialAreasToMap(spatialAreasData));
  }, [spatialAreasData, showSpatialAreasLayer]);

  useEffect(() => {
    if (map.current) return;
    const container = mapContainer.current;
    if (!container) return;
    while (container.firstChild) container.removeChild(container.firstChild);
    map.current = new mapboxgl.Map({
      container,
      style: mapStyle,                 // <-- your current state value
      center: [172.6148, -43.5272],
      zoom: 8,
      pitch: is3DMode ? 45 : 0,
      bearing: 0,
      antialias: true
    });

    
    const nav = new mapboxgl.NavigationControl();
    const geo = new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserHeading: true
    });
    map.current.addControl(nav, 'top-right');
    map.current.addControl(geo, 'top-right');

    drawControl.current = new MapboxDraw({
      displayControlsDefault: false,
      controls: {
        polygon: true,
        line_string: true,   // (you had false in the comment; set true if you want lines)
        trash: true
      },
      styles: [

        {
          id: 'gl-draw-polygon-fill-inactive',
          type: 'fill',
          filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon']],
          paint: { 'fill-color': '#58e23c', 'fill-outline-color': '#58e23c', 'fill-opacity': 0.5 }
        },

        {
          id: 'gl-draw-polygon-fill-active',
          type: 'fill',
          filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
          paint: { 'fill-color': '#58e23c', 'fill-outline-color': '#58e23c', 'fill-opacity': 0.5 }
        },

        {
          id: 'gl-draw-polygon-midpoint',
          type: 'circle',
          filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'midpoint']],
          paint: { 'circle-radius': 4, 'circle-color': '#58e23c' }
        },

        {
          id: 'gl-draw-line-inactive',
          type: 'line',
          filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'LineString']],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#ff0000', 'line-width': 3 }
        },

        {
          id: 'gl-draw-line-active',
          type: 'line',
          filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'LineString']],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#ff0000', 'line-width': 3 }
        },

        {
          id: 'gl-draw-point-point-stroke-inactive',
          type: 'circle',
          filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Point'], ['==', 'meta', 'vertex']],
          paint: {
            'circle-radius': 6, 'circle-opacity': 1, 'circle-color': '#fff',
            'circle-stroke-width': 2, 'circle-stroke-color': '#58e23c'
          }
        },

        {
          id: 'gl-draw-point-inactive',
          type: 'circle',
          filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Point'], ['==', 'meta', 'vertex']],
          paint: { 'circle-radius': 4, 'circle-color': '#58e23c' }
        },

        {
          id: 'gl-draw-point-stroke-active',
          type: 'circle',
          filter: ['all', ['==', '$type', 'Point'], ['==', 'active', 'true'], ['==', 'meta', 'vertex']],
          paint: {
            'circle-radius': 8, 'circle-color': '#fff',
            'circle-stroke-width': 2, 'circle-stroke-color': '#58e23c'
          }
        },

        {
          id: 'gl-draw-point-active',
          type: 'circle',
          filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'active'], ['==', 'active', 'true']],
          paint: { 'circle-radius': 6, 'circle-color': '#58e23c' }
        }
      ]
    });
    map.current.addControl(drawControl.current, 'top-right');

    map.current.on('draw.create', handleDrawCreate);
    map.current.on('draw.update', handleDrawUpdate);
    map.current.on('draw.delete', handleDrawDelete);

    map.current.once('style.load', () => {
      if (is3DMode) add3DTerrain();
    });

    const onZoomStart = (e) => {
      if (e?.originalEvent) setUserInteracted(true);
    };
    map.current.on('zoomstart', onZoomStart);

    return () => {
      try {
        map.current?.off('draw.create', handleDrawCreate);
        map.current?.off('draw.update', handleDrawUpdate);
        map.current?.off('draw.delete', handleDrawDelete);
        map.current?.off('zoomstart', onZoomStart);
        if (drawControl.current) {

          map.current?.removeControl(drawControl.current);
          drawControl.current = null;
        }
        map.current?.removeControl(nav);
        map.current?.removeControl(geo);
      } finally {
        try { map.current?.remove(); } finally { map.current = null; }
      }
    };
  }, []); 

  useEffect(() => {
    if (map.current && map.current.getLayer('vineyard-blocks-fill')) {
      map.current.setPaintProperty('vineyard-blocks-fill', 'fill-opacity', blockOpacity);
    }
  }, [blockOpacity]);

  function toFeatureCollection(list) {
    return {
      type: 'FeatureCollection',
      features: (Array.isArray(list) ? list : [])
        .filter(item => item && item.geometry)
        .map(item => ({
          type: 'Feature',
          geometry: item.geometry,
          properties: { ...item },
        })),
    };
  }

  const handleDrawCreate = (e) => {
    console.log('Features count:', e.features.length);

    const activeBlock = blockToSplitRef.current; // <--- use ref
    console.log('Current blockToSplit (ref):', activeBlock?.properties?.block_name || 'null');

    if (e.features.length === 0) return;

    const feature = e.features[0];
    if (activeBlock && feature.geometry.type === 'LineString') {
      console.log('=== PROCESSING SPLIT LINE ===');
      console.log('Block to split:', activeBlock.properties.block_name);
      handleSplitLineDrawn(feature, activeBlock);  // <— pass it
    } else if (!activeBlock && feature.geometry.type === 'Polygon') {

      const geom = feature.geometry;
      const area = turf.area(geom) / 10000;
      const centroid = turf.centroid(geom);
      const centroidCoords = centroid.geometry.coordinates;

      setDrawingCoordinates(geom);
      setNewBlockInfo(prev => ({
        ...prev,
        area: parseFloat(area.toFixed(2)),
        centroid_longitude: centroidCoords[0],
        centroid_latitude: centroidCoords[1]
      }));

      freezeDrawing(drawControl.current, map.current);
      showDraftGeometry(map.current, geom);
      setShowDrawingForm(true);
      setIsDrawing(true);
    } else {

      if (blockToSplit) {
        console.log('blockToSplit details:', {
          name: blockToSplit.properties.block_name,
          id: blockToSplit.properties.id
        });
      }
    }
  };

  const handleSplitLineDrawn = (lineFeature, activeBlock = blockToSplitRef.current) => {
    const name = activeBlock?.properties?.block_name || 'Unknown';

    if (!activeBlock) {
      console.warn('No active block at split time; discarding drawn line.');
      drawControl.current?.delete(lineFeature.id);
      setApiStatus('Split cancelled or block lost. Click block → Split, then draw again.');
      return;
    }

    const validation = validateSplitLine(activeBlock, lineFeature);
    console.log('Validation result:', validation);
    if (!validation.isValid) {
      setApiStatus(`Invalid split line: ${validation.reason}`);
      drawControl.current?.delete(lineFeature.id);
      return;
    }

    const featureToStore = { type: 'Feature', geometry: lineFeature.geometry };
    splitLineRef.current = featureToStore;

    // (Keep the state update if you rely on it for UI)
    setSplitLineDrawn(featureToStore);

    // Pass it through to avoid reading stale state
    showSplitConfirmationDialog(activeBlock, featureToStore);
  };

  const showSplitConfirmationDialog = (
    activeBlock = blockToSplitRef.current,
    lineFeature = splitLineRef.current
  ) => {
    const blockName = activeBlock?.properties?.block_name || 'Unknown Block';
    const confirmed = window.confirm(
      `Split "${blockName}" into two separate blocks?\n\n` +
      `This action cannot be undone. The original block will be deleted and replaced with two new blocks.\n\n` +
      `Click OK to proceed, or Cancel to draw a different line.`
    );
    if (confirmed) {
      executeSplit(activeBlock, lineFeature);  // pass the captured line
    } else {
      drawControl.current?.deleteAll();
      setSplitLineDrawn(null);
      setMode('idle');
      removeSplitMask(map);
      splitLineRef.current = null;            // <-- clear the ref as well
      setApiStatus(`Draw a new line through "${blockName}" to split it.`);
    }
  };

  const validateSplitLine = (blockFeature, lineFeature) => {

    try {
      if (!blockFeature?.geometry && !blockFeature?.type) {
        console.log('Block validation failed: no geometry');
        return { isValid: false, reason: "Block geometry not found" };
      }
      
      if (!lineFeature?.geometry || lineFeature.geometry.type !== "LineString") {
        console.log('Line validation failed:', lineFeature?.geometry?.type);
        return { isValid: false, reason: "Invalid line geometry" };
      }

      // Convert to turf objects - handle both feature objects and geometry objects
      let blockGeom, lineGeom;
      
      if (blockFeature.type === "Feature") {
        blockGeom = blockFeature;
      } else if (blockFeature.geometry) {
        blockGeom = { type: "Feature", geometry: blockFeature.geometry };
      } else {
        blockGeom = { type: "Feature", geometry: blockFeature };
      }
      
      if (lineFeature.type === "Feature") {
        lineGeom = lineFeature;
      } else if (lineFeature.geometry) {
        lineGeom = { type: "Feature", geometry: lineFeature.geometry };
      } else {
        lineGeom = { type: "Feature", geometry: lineFeature };
      }

      console.log('Converted geometries - Block:', blockGeom.geometry.type, 'Line:', lineGeom.geometry.type);

      const lengthMeters = turf.length(lineGeom, { units: "kilometers" }) * 1000;
      
      if (lengthMeters < 10) {
        return { isValid: false, reason: "Line too short. Draw a longer line across the block." };
      }

      const intersects = turf.booleanIntersects(blockGeom, lineGeom);

      if (!intersects) {
        return { isValid: false, reason: "Line must intersect the block boundary" };
      }

      const intersections = turf.lineIntersect(lineGeom, blockGeom);
      const intersectionCount = intersections.features ? intersections.features.length : 0;

      if (intersectionCount < 2) {
        return { isValid: false, reason: "Line must cross the block boundary at two points" };
      }

      console.log('Validation passed!');
      return { isValid: true };
    } catch (error) {
      console.error('Validation error:', error);
      return { isValid: false, reason: "Validation failed: " + error.message };
    }
  };

  const executeSplit = async (
    activeBlock = blockToSplitRef.current,
    lineFeature = splitLineRef.current
  ) => {
    // Use the ref/arg, not state
    if (!activeBlock || !lineFeature) {
      setApiStatus('Missing block or line for split operation');
      return;
    }

    try {
      setIsSplitProcessing(true);
      setApiStatus('Splitting block... Please wait.');

      const blockId = activeBlock.properties.id;

      // Always send a Feature
      const splitLineGeoJSON = lineFeature.type === 'Feature'
        ? lineFeature
        : { type: 'Feature', geometry: lineFeature.geometry || lineFeature };

      const response = await blocksService.splitBlock(blockId, splitLineGeoJSON);

      if (response && response.new_blocks) {
        setApiStatus(`Block split successfully into ${response.new_blocks.length} parts`);
        setBlockToSplit(null);
        setSplitLineDrawn(null);
        splitLineRef.current = null;                   // <-- clear the ref
        drawControl.current?.deleteAll();
        drawControl.current?.changeMode('simple_select');
        setMode('idle');
        removeSplitMask(map);
        await loadBlocksData();
      } else {
        throw new Error('Invalid response from split operation');
      }
    } catch (error) {
      console.error('Split execution error:', error);
      setApiStatus(`Split failed: ${error.response?.data?.detail || error.message}`);
      drawControl.current?.deleteAll();
      setSplitLineDrawn(null);
      setMode('idle');
      removeSplitMask(map);
      splitLineRef.current = null;                     
    } finally {
      setIsSplitProcessing(false);
    }
  };

  const handleDrawUpdate = (e) => {
    if (e.features.length > 0 && !blockToSplit) {
      const polygon = e.features[0];
      console.log('Updated polygon:', JSON.stringify(polygon.geometry));
      
      const area = turf.area(polygon.geometry) / 10000;
      const centroid = turf.centroid(polygon.geometry);
      const centroidCoords = centroid.geometry.coordinates;
      
      setDrawingCoordinates(polygon.geometry);
      setNewBlockInfo(prev => ({ 
        ...prev, 
        area: parseFloat(area.toFixed(2)),
        centroid_longitude: centroidCoords[0],
        centroid_latitude: centroidCoords[1]
      }));
    }
  };

  const handleDrawDelete = () => {
    const activeBlock = blockToSplitRef.current;
    if (activeBlock) {
      // User deleted the split line - cancel split mode
      console.log('Split cancelled by user deletion');
      setBlockToSplit(null);
      blockToSplitRef.current = null;
      setSplitLineDrawn(null);
      try { drawControl.current?.changeMode('simple_select'); } catch {}
      removeSplitMask(map);
      setSplitModeActive(false, map, setMode, currentPopup);
      setApiStatus('Split cancelled');
    } else if (!isMapping) {
      // Regular polygon deletion
      setDrawingCoordinates(null);
      setNewBlockInfo({
        block_name: '',
        variety: '',
        area: 0,
        centroid_longitude: null,
        centroid_latitude: null
      });
      setShowDrawingForm(false);
      clearDraftGeometry(map.current);
      setIsDrawing(false);
    }
  };

  const handleNewBlockSubmit = async (e) => {
    e.preventDefault();
    
    if (!drawingCoordinates) {
      alert('Please draw a vineyard block on the map first');
      return;
    }
    
    try {
      setApiStatus('Creating new block...');
      
      const blockData = {
        block_name: newBlockInfo.block_name,
        variety: newBlockInfo.variety,
        area: newBlockInfo.area,
        centroid_longitude: newBlockInfo.centroid_longitude,
        centroid_latitude: newBlockInfo.centroid_latitude,
        company_id: user?.company_id,
        geometry: {
          type: drawingCoordinates.type,
          coordinates: drawingCoordinates.coordinates
        }
      };
      const response = await blocksService.createBlock(blockData);
      
      if (response) {
        setApiStatus(`Block created successfully: ${response.block_name}`);
        drawControl.current.deleteAll();
        setShowDrawingForm(false);
        clearDraftGeometry(map.current);
        setIsDrawing(false);
        
        loadBlocksData();
      }
    } catch (error) {
      console.error('Error creating block:', error);
      setApiStatus(`Error creating block: ${error.response?.data?.detail || error.message}`);
    }
  };

  const handleNewSpatialAreaSubmit = async (e) => {
    e.preventDefault();
    
    if (!drawingCoordinates) {
      alert('Please draw an area on the map first');
      return;
    }
    
    if (!spatialAreaType) {
      alert('Please select an area type');
      return;
    }
    
    try {
      setApiStatus('Creating new spatial area...');
      
      const spatialAreaData = {
        area_type: spatialAreaType,
        name: newBlockInfo.block_name, 
        description: newBlockInfo.variety || '', 
        area_hectares: newBlockInfo.area,
        geometry: {
          type: drawingCoordinates.type,
          coordinates: drawingCoordinates.coordinates
        },
        company_id: user?.company_id
      };
      
      const response = await spatialAreasService.createSpatialArea(spatialAreaData);
      
      if (response) {
        setApiStatus(`Spatial area created successfully: ${response.name}`);
        drawControl.current.deleteAll();
        setShowDrawingForm(false);
        clearDraftGeometry(map.current);
        setIsDrawing(false);
        setIsMapping(false);
        setMappingType('');
        setSpatialAreaType('');
        setNewBlockInfo({
          block_name: '',
          variety: '',
          area: 0,
          centroid_longitude: null,
          centroid_latitude: null
        });

        loadSpatialAreasData();
      }
    } catch (error) {
      console.error('Error creating spatial area:', error);
      setApiStatus(`Error creating spatial area: ${error.response?.data?.detail || error.message}`);
    }
  };

  const loadBlocksData = async () => {
    if (!map.current || !user) {
      console.log('Map or user not available, cannot load blocks');
      return;
    }
    
    // Prevent multiple simultaneous loads
    if (loadBlocksData.isLoading) {
      return;
    }
    
    try {
      loadBlocksData.isLoading = true;
      setApiStatus('Loading blocks...');
      
      const response = await blocksService.getBlocksGeoJSON();
      console.log('API response received:', response?.features?.length || 0, 'features');
      
      if (response && response.features) {
        const features = response.features;
        setBlockCount(features.length);
        
        const userCompanyId = user.company_id;
        const ownedBlocks = features.filter(feature => 
          Number(feature.properties.company_id) === Number(userCompanyId)
        );
        setOwnBlockCount(ownedBlocks.length);
        
        setApiStatus(`Loaded ${features.length} blocks (${ownedBlocks.length} owned)`);
        setBlocksData(response);

      } else {
        console.log('No blocks found in response');
        setApiStatus('No blocks found');
      }
    } catch (error) {
      console.error('Error loading blocks:', error);
      if (error.response?.status === 401) {
        setApiStatus('Please login to view blocks');
      } else if (error.response?.status === 500) {
        setApiStatus('Server error - check backend logs');
      } else {
        setApiStatus(`Error: ${error.response?.data?.detail || error.message}`);
      }
    } finally {
      loadBlocksData.isLoading = false;
    }
  };


  const loadSpatialAreasData = async () => {
    if (!user?.company_id) {
      console.warn('loadSpatialAreasData: no company_id yet');
      return;
    }
    try {
      setApiStatus?.('Loading spatial areas…');

      const response = await spatialAreasService.getSpatialAreasGeoJSON({
        company_id: user.company_id,
      });

      const fc =
        Array.isArray(response)
          ? { type: 'FeatureCollection', features: response }
          : response?.type === 'FeatureCollection'
            ? response
            : { type: 'FeatureCollection', features: [] };

      if (!Array.isArray(fc.features)) fc.features = [];

      setSpatialAreasData(fc);
      setApiStatus?.(`Spatial areas loaded (${fc.features.length})`);
      console.debug('Spatial areas FC:', fc);
    } catch (err) {
      console.error('Failed loading spatial areas', err);
      setApiStatus?.('Failed to load spatial areas');
    }
  };




  const addSpatialAreasToMap = (geojson) => {
    if (!map.current || !geojson) return;

    // Remove stale layers/sources (idempotent)
    [L_SPATIAL_LABEL, L_SPATIAL_LINE, L_SPATIAL_FILL].forEach(id => {
      if (map.current.getLayer(id)) { try { map.current.removeLayer(id); } catch {} }
    });
    if (map.current.getSource(SPATIAL_SRC_ID)) {
      try { map.current.removeSource(SPATIAL_SRC_ID); } catch {}
    }

    map.current.addSource(SPATIAL_SRC_ID, {
      type: 'geojson',
      data: geojson
    });

    const visibility = showSpatialAreasLayer ? 'visible' : 'none';

    const beforeId = map.current.getLayer('vineyard-blocks-outline') ? 'vineyard-blocks-outline' : undefined;

    map.current.addLayer({
      id: L_SPATIAL_FILL,
      type: 'fill',
      source: SPATIAL_SRC_ID,
      layout: { visibility },
      paint: {
        'fill-color': '#b0e9c5',
        'fill-opacity': 0.18
      }
    }, beforeId);

    map.current.addLayer({
      id: L_SPATIAL_LINE,
      type: 'line',
      source: SPATIAL_SRC_ID,
      layout: { visibility },
      paint: {
        'line-color': 'rgba(0, 0, 0, 1)',
        'line-width': 3,
        'line-dasharray': [3, 1]
      }
    }, beforeId);

    map.current.addLayer({
      id: L_SPATIAL_LABEL,
      type: 'symbol',
      source: SPATIAL_SRC_ID,
      layout: {
        visibility,
        'text-field': ['coalesce', ['get', 'name'], ['get', 'label'], ''],
        'text-size': 12,
        'text-allow-overlap': false
      },
      paint: {
        'text-color': '#1f2937',
        'text-halo-color': '#ffffff',
        'text-halo-width': 2
      }
    }, beforeId);

  map.current.off('click', 'spatial-areas-fill', handleSpatialAreaClick);
  map.current.on('click', 'spatial-areas-fill', handleSpatialAreaClick)
  
  };

  const handleSpatialAreaClick = (e) => {
    if (typeof e?.preventDefault === 'function') e.preventDefault();
    if (e?.originalEvent?.preventDefault) e.originalEvent.preventDefault();
    if (e?.originalEvent?.stopPropagation) e.originalEvent.stopPropagation();
    
    // Close any existing popup
    if (currentPopup.current) {
      currentPopup.current.remove();
      currentPopup.current = null;
    }
    
    if (e.features && e.features.length > 0) {
      const feature = e.features[0];
      const properties = feature.properties;
      const userCompanyId = user?.company_id;
      const isOwnedArea = Number(properties.company_id) === Number(userCompanyId);
      
      // Find the area type label
      const areaTypeLabel = spatialAreaTypes.find(t => t.value === properties.area_type)?.label || properties.area_type;
      
      let popupContent;
      if (!isAuxeinAdmin) {
        popupContent = `
          <div class="map-popup spatial-area owned">
            <h3>${properties.name || 'Unnamed Area'}</h3>
            <div class="area-type-badge ${properties.area_type}">
              ${areaTypeLabel}
            </div>
            <div class="popup-details">
              ${properties.description ? `<div class="description">${properties.description}</div>` : ''}
              <div><strong>Area:</strong> ${typeof properties.area_hectares === 'number' ? `${properties.area_hectares.toFixed(2)} ha` : 'Unknown'}</div>
              <div><strong>ID:</strong> ${properties.id || 'Unknown'}</div>
              ${properties.created_at ? `<div><strong>Created:</strong> ${new Date(properties.created_at).toLocaleDateString()}</div>` : ''}
            </div>
            <div class="popup-actions">
              <button onclick="handleEditSpatialArea(${properties.id})" class="popup-button mobile-button touch-friendly">
                Edit Details
              </button>
            </div>
          </div>
        `;
      } else {
        // Should not happen for regular users, but just in case
        popupContent = `
          <div class="map-popup spatial-area other">
            <h3>${properties.name || 'Unnamed Area'}</h3>
            <div class="area-type-badge ${properties.area_type}">
              ${areaTypeLabel}
            </div>
            <div class="popup-company-notice">This area belongs to another company</div>
          </div>
        `;
      }
      
      // Create popup
      const popup = new mapboxgl.Popup({
        closeButton: true,
        closeOnClick: true,
        maxWidth: 'min(90vw, 400px)',
        className: 'mobile-friendly-popup',
        anchor: 'top',
        focusAfterOpen: false
      })
        .setLngLat(e.lngLat)
        .setHTML(popupContent)
        .addTo(map.current);
      
      currentPopup.current = popup;
    }
  };

const handleEditSpatialArea = (spatialAreaId) => {
  window.dispatchEvent(new CustomEvent('openEditSpatialAreaForm', {
    detail: { spatialAreaId }
  }));
};

// Make the function globally available for the popup button onclick
window.handleEditSpatialArea = handleEditSpatialArea

window.openRiskForEdit = async (riskId) => {
  try {
    const riskDetails = await riskManagementService.getRiskById(riskId);
    navigate('/risks/create', {
      state: { editMode: true, riskData: riskDetails }
    });
  } catch (e) {
    console.error('Failed to open risk:', e);
  }
};
  
const handleSpatialAreaUpdate = async (spatialAreaId, updateData) => {
  try {
    const response = await spatialAreasService.updateSpatialArea(spatialAreaId, updateData);
    setApiStatus('Spatial area updated successfully!');
    
    // Reload spatial areas to show updated data
    loadSpatialAreasData();
  } catch (error) {
    throw error; // Let the form component handle the error display
  }
};

// Add this state for available parent areas (near your other state declarations)
const [availableParentAreas, setAvailableParentAreas] = useState([]);

// Add this function to load parent areas when needed
const loadAvailableParentAreas = async () => {
  try {
    const response = await spatialAreasService.getCompanySpatialAreas();
    if (response && response.spatial_areas) {
      setAvailableParentAreas(response.spatial_areas);
    }
  } catch (error) {
    console.error('Error loading parent areas:', error);
  }
};

useEffect(() => {
  if (!map.current) return;
  const vis = showSpatialAreasLayer ? 'visible' : 'none';
  [L_SPATIAL_FILL, L_SPATIAL_LINE, L_SPATIAL_LABEL].forEach(id => {
    if (map.current.getLayer(id)) {
      try { map.current.setLayoutProperty(id, 'visibility', vis); } catch {}
    }
  });
}, [showSpatialAreasLayer]);

useEffect(() => {
  if (map.current && map.current.isStyleLoaded() && blocksData && user?.company_id) {
    console.log('Blocks data updated, refreshing map');
    addBlocksToMap(blocksData, user.company_id);
  }
}, [blocksData, user?.company_id]);

const loadParcelsData = async (forceLoad = false) => {
  console.log('🔍 Step 4 - loadParcelsData called for:', {
    user: user?.email,
    companyId: user?.company_id,
    
  });
  
  if (!map.current || !user) {
    console.log('Map or user not available, cannot load parcels');
    return;
  }
  
  try {
    setIsLoadingParcels(true);
    
    const currentZoom = map.current.getZoom();
    const minZoom = 12;
    
    if (currentZoom < minZoom && !forceLoad) {
      setApiStatus(`Zoom to level ${minZoom} or higher to load parcels (current: ${currentZoom.toFixed(1)})`);
      setParcelsData({
        type: "FeatureCollection",
        features: [],
        metadata: { count: 0, zoom_too_low: true }
      });
      setParcelCount(0);
      setAssignedParcelCount(0);
      setIsLoadingParcels(false);
      return;
    }
    
    setApiStatus('Loading parcels...');
    
    let response;
    
    if (isAuxeinAdmin) {
      // Admin loads all parcels
      console.log('🔍 Loading ALL parcels for admin');
      response = await parcelsService.loadParcelsForViewport(map.current, minZoom, false);
    } else {

      if (!user.company_id) {
        console.error('❌ User has no company_id');
        setApiStatus('No company assigned to user');
        return;
      }
      
      response = await parcelsService.loadCompanyParcelsForViewport(
        user.company_id,
        map.current,
        minZoom
      );
    }

    if (response && response.features) {
      const features = response.features;
      setParcelCount(features.length);
      setAssignedParcelCount(features.length);
      
      if (response.metadata?.zoom_too_low) {
        setApiStatus(response.metadata.message);
      } else {
        const userType = isAuxeinAdmin ? 'total' : 'your company\'s';
        setApiStatus(`Loaded ${features.length} ${userType} parcels`);
      }
      
      setParcelsData(response);
      addParcelsToMap(response);

    } else {
      setApiStatus('No parcels found');
      setParcelCount(0);
      setAssignedParcelCount(0);
    }
  
  } catch (error) {
    console.error('❌ Error loading parcels:', error);
    setApiStatus(`Error loading parcels: ${error.response?.data?.detail || error.message}`);
  } finally {
    setIsLoadingParcels(false);
  }

};

const loadAvailableCompanies = async () => {
  try {

    setIsLoadingCompanies(true);
    
    const response = await companiesService.getAllCompanies();
    let companies = [];
    
    if (Array.isArray(response)) {
      // Direct array
      companies = response;
    } else if (response && Array.isArray(response.companies)) {
      // { companies: [...] }
      companies = response.companies;
    } else if (response && Array.isArray(response.data)) {
      // { data: [...] }
      companies = response.data;
    } else if (response && Array.isArray(response.results)) {
      // { results: [...] }
      companies = response.results;
    } else if (response && typeof response === 'object') {
      // Try to find any array property in the response
      const possibleArrays = Object.values(response).filter(Array.isArray);
      if (possibleArrays.length > 0) {
        companies = possibleArrays[0];

      } else {
        console.error('No array found in response object:', response);
        companies = [];
      }
    } else {
      console.error('Unexpected companies response structure:', response);
      companies = [];
    }

    setAvailableCompanies(companies);
    
  } catch (error) {
    console.error('Error loading companies:', error);
    setApiStatus(`Error loading companies: ${error.message}`);
    setAvailableCompanies([]); // Ensure it's always an array
  } finally {
    setIsLoadingCompanies(false);
  }
};

const handleAssignParcel = async (parcelProperties) => {
  console.log('Assign parcel clicked:', parcelProperties);
  
  // Set the selected parcel
  setSelectedParcelForAssignment(parcelProperties);
  
  // Reset form data
  setAssignmentFormData({
    company_id: '',
    ownership_type: 'full',
    ownership_percentage: 100.0,
    verification_method: 'manual',
    notes: ''
  });
  
  // Load companies if not already loaded
  if (availableCompanies.length === 0) {
    await loadAvailableCompanies();
  }
  
  // Show assignment modal
  setShowAssignmentModal(true);
};

const handleConfirmAssignment = async () => {
  if (!selectedParcelForAssignment || !assignmentFormData.company_id) {
    setApiStatus('Please select a company');
    return;
  }
  
  try {
    setApiStatus('Assigning parcel to company...');
    
    const assignmentData = {
      company_id: parseInt(assignmentFormData.company_id),
      ownership_type: assignmentFormData.ownership_type,
      ownership_percentage: parseFloat(assignmentFormData.ownership_percentage),
      verification_method: assignmentFormData.verification_method,
      notes: assignmentFormData.notes || `Assigned via map interface to parcel ${selectedParcelForAssignment.linz_id}`
    };
    
    // Validate assignment data
    parcelsService.validateAssignmentData(assignmentData);
    
    const response = await parcelsService.assignParcelToCompany(
      selectedParcelForAssignment.id,
      assignmentData
    );
    
    if (response) {
      setApiStatus(`Successfully assigned parcel to ${response.company_name}`);
      
      // Close modal
      setShowAssignmentModal(false);
      setSelectedParcelForAssignment(null);
      
      // Reload parcels to show updated assignment
      await loadParcelsData(true);
    }
  } catch (error) {
    console.error('Error assigning parcel:', error);
    setApiStatus(`Error assigning parcel: ${error.response?.data?.detail || error.message}`);
  }
};

const handleRemoveParcelAssignment = async (parcelId, companyId) => {
  if (!parcelId || !companyId) {
    setApiStatus('Invalid parcel or company information');
    return;
  }
  
  // Show confirmation dialog
  const confirmed = window.confirm(
    'Are you sure you want to remove this parcel assignment? This action cannot be undone.'
  );
  
  if (!confirmed) {
    return;
  }
  
  try {
    setApiStatus('Removing parcel assignment...');
    
    const response = await parcelsService.removeParcelAssignment(parcelId, companyId);
    
    if (response) {
      setApiStatus(`Successfully removed assignment from ${response.company_name}`);
      
      // Reload parcels to show updated assignment
      await loadParcelsData(true);
    }
  } catch (error) {
    console.error('Error removing parcel assignment:', error);
    setApiStatus(`Error removing assignment: ${error.response?.data?.detail || error.message}`);
  }
};

const handleCancelAssignment = () => {
  setShowAssignmentModal(false);
  setSelectedParcelForAssignment(null);
  setAssignmentFormData({
    company_id: '',
    ownership_type: 'full',
    ownership_percentage: 100.0,
    verification_method: 'manual',
    notes: ''
  });
};

// Add automatic reloading when map moves (with debouncing)
const loadParcelsDebounced = useRef(null);

const handleAssignBlock = async (blockProperties) => {
  console.log('Assign block clicked:', blockProperties);
  
  // Only allow admin
  if (isCompanyScope) {
    setApiStatus('Only administrators can assign blocks');
    return;
  }
  
  try {
    // Set the selected block
    setSelectedBlockForAssignment(blockProperties);
    
    // Reset form data
    setBlockAssignmentFormData({
      company_id: '',
      notes: ''
    });
    
    // Load companies if not already loaded
    if (availableCompanies.length === 0) {
      await loadAvailableCompanies();
    }
    
    // Show assignment modal
    setShowBlockAssignmentModal(true);
    
  } catch (error) {
    console.error('Error in handleAssignBlock:', error);
    setApiStatus('Error opening block assignment form');
  }
};

const handleConfirmBlockAssignment = async () => {
  if (!selectedBlockForAssignment || !blockAssignmentFormData.company_id) {
    setApiStatus('Please select a company');
    return;
  }
  
  try {
    setApiStatus('Assigning block to company...');
    
    const companyId = parseInt(blockAssignmentFormData.company_id);
    
    const response = await blocksService.assignBlock(
      selectedBlockForAssignment.id,
      companyId
    );
    
    if (response) {
      const company = availableCompanies.find(c => c.id === companyId);
      setApiStatus(`Successfully assigned block to ${company?.name || `Company ${companyId}`}`);
      
      // Close modal
      setShowBlockAssignmentModal(false);
      setSelectedBlockForAssignment(null);
      
      // Reload blocks to show updated assignment
      await loadBlocksData();
    }
  } catch (error) {
    console.error('Error assigning block:', error);
    setApiStatus(`Error assigning block: ${error.response?.data?.detail || error.message}`);
  }
};

const handleCancelBlockAssignment = () => {
  setShowBlockAssignmentModal(false);
  setSelectedBlockForAssignment(null);
  setBlockAssignmentFormData({
    company_id: '',
    notes: ''
  });
};

useEffect(() => {
  if (!map.current || isCompanyScope) return;
  
  const handleMapMove = () => {
    if (!showParcelsLayer) return;
    
    // Debounce the loading to avoid too many requests
    if (loadParcelsDebounced.current) {
      clearTimeout(loadParcelsDebounced.current);
    }
    
    loadParcelsDebounced.current = setTimeout(() => {
      loadParcelsData();
    }, 1000); // Wait 1 second after user stops moving map
  };
  
  const handleZoomEnd = () => {
    if (showParcelsLayer) {
      loadParcelsData();
    }
  };
  
  if (showParcelsLayer) {
    map.current.on('moveend', handleMapMove);
    map.current.on('zoomend', handleZoomEnd);
  }
  
  return () => {
    if (map.current) {
      map.current.off('moveend', handleMapMove);
      map.current.off('zoomend', handleZoomEnd);
    }
    if (loadParcelsDebounced.current) {
      clearTimeout(loadParcelsDebounced.current);
    }
  };
}, [showParcelsLayer, user]);

useEffect(() => {
  if (!map.current || !user) return;
  
  const loadData = () => {
    loadBlocksData();        
    loadSpatialAreasData();   
  };
  
  if (map.current.isStyleLoaded()) loadData();
  else map.current.once('style.load', loadData);
  return () => { try { map.current?.off('style.load', loadData); } catch {} };
}, [user]);

// Helper to detect when drawing mode is active
useEffect(() => {
  if (drawControl.current && isMapping) {
    // Listen for mode changes to provide better feedback
    const handleModeChange = (e) => {
      if (e.mode === 'draw_polygon') {
        setApiStatus('Click on the map to start drawing. Double-click to complete the polygon.');
      }
    };
    if (isMapping) {
      setApiStatus('Click the polygon tool (square icon) in the top right, then draw your area. Double-click to complete.');
    }
  }
}, [isMapping]);


// Update spatial area opacity when it changes
useEffect(() => {
  if (map.current && map.current.getLayer('spatial-areas-fill')) {
    map.current.setPaintProperty('spatial-areas-fill', 'fill-opacity', spatialAreaOpacity);
  }
}, [spatialAreaOpacity]);


// Get user's current location
useEffect(() => {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCurrentLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
      },
      (error) => {
        console.error('Error getting location:', error);
      }
    );
  }
}, []);

useEffect(() => {
  if (map.current && map.current.getLayer('land-parcels-fill')) {
    const visibility = showParcelsLayer ? 'visible' : 'none';
    map.current.setLayoutProperty('land-parcels-fill', 'visibility', visibility);
    map.current.setLayoutProperty('land-parcels-outline', 'visibility', visibility);
  }
}, [showParcelsLayer]);

useEffect(() => {
  if (map.current && showParcelsLayer) {
    console.log('Triggering parcel load for user:', user.email);
    loadParcelsData();
  }
}, [showParcelsLayer]);


useEffect(() => {
  if (isAuxeinAdmin && availableCompanies.length === 0) {
    loadAvailableCompanies();
  }
}, [user]);

const handleBlockUpdate = async (blockId, updateData) => {
  try {
    const response = await blocksService.updateBlock(blockId, updateData);
    setApiStatus('Block updated successfully!');
    
    // Reload blocks to show updated data
    loadBlocksData();
  } catch (error) {
    throw error; // Let the form component handle the error display
  }
};

useEffect(() => {
  const handleOpenEditSpatialAreaForm = async (e) => {
    try {
      // Fetch full spatial area details
      const spatialAreaDetails = await spatialAreasService.getSpatialAreaById(e.detail.spatialAreaId);
      setEditSpatialAreaData(spatialAreaDetails);
      
      // Load available parent areas
      await loadAvailableParentAreas();
      
      setShowEditSpatialAreaForm(true);
    } catch (error) {
      console.error('Error loading spatial area details:', error);
      setApiStatus('Failed to load spatial area details');
    }
  };

  window.addEventListener('openEditSpatialAreaForm', handleOpenEditSpatialAreaForm);

  return () => {
    window.removeEventListener('openEditSpatialAreaForm', handleOpenEditSpatialAreaForm);
  };
}, []);

useEffect(() => {
  const handleOpenEditForm = async (e) => {
    try {
      // Fetch full block details
      const blockDetails = await blocksService.getBlockById(e.detail.blockId);
      setEditBlockData(blockDetails);
      setShowEditForm(true);
    } catch (error) {
      console.error('Error loading block details:', error);
      setApiStatus('Failed to load block details');
    }
  };

  window.addEventListener('openEditForm', handleOpenEditForm);

  return () => {
    window.removeEventListener('openEditForm', handleOpenEditForm);
  };
}, []);


  const handleTouchEnd = (e) => {

    const now = Date.now();
    const touch = e.originalEvent?.changedTouches?.[0];
    
    if (touchStartTime.current && touchStartPosition.current && touch) {
      const touchDuration = now - touchStartTime.current;
      const touchDistance = Math.sqrt(
        Math.pow(touch.clientX - touchStartPosition.current.x, 2) + 
        Math.pow(touch.clientY - touchStartPosition.current.y, 2)
      );

      const isTap = touchDuration < 500 && touchDistance < 10;
      
      if (isTap && e.features && e.features.length > 0) {
        if (e.originalEvent) {
          e.originalEvent.preventDefault();
          e.originalEvent.stopPropagation();
        }

        const eventData = {
          ...e,
          features: e.features,
          lngLat: e.lngLat,
          originalEvent: e.originalEvent,
          preventDefault: () => {}
        };

        setTimeout(() => {
          handleBlockInteraction(eventData, 'touch');
        }, 150);
      } else {
        console.log('Tap not valid or no features');
      }
    } else {
      console.log('Missing touch data:', {
        hasTouchStartTime: !!touchStartTime.current,
        hasTouchStartPosition: !!touchStartPosition.current,
        hasTouch: !!touch
      });
    }
    
    // Reset touch state
    touchStartTime.current = null;
    touchStartPosition.current = null;
    isLongPress.current = false;
  };

// Enhanced block interaction handler for both click and touch
  const handleBlockInteraction = (e, eventType = 'click') => {

    if (currentPopup.current) {
      currentPopup.current.remove();
      currentPopup.current = null;
    }

    if (e.preventDefault) {
      e.preventDefault();
    }
    
    if (e.features && e.features.length > 0) {
      const feature = e.features[0];
      const properties = feature.properties;
      const userCompanyId = user?.company_id;
      const isOwnedBlock = Number(properties.company_id) === Number(userCompanyId);

      // Create unique function names that will be available for cleanup
      const editFunctionName = `openEditForm_${properties.id}_${Date.now()}`;
      const splitFunctionName = `splitBlock_${properties.id}_${Date.now()}`; // This is the key fix
      const assignBlockFunctionName = `assignBlock_${properties.id}_${Date.now()}`;
      const editAreaFnName = `editBlockArea_${properties.id}_${Date.now()}`;

      // Create popup content
      let popupContent;
      
      if (isOwnedBlock) {
        window[editFunctionName] = () => {

          window.dispatchEvent(new CustomEvent('openEditForm', { 
            detail: { blockId: properties.id } 
          }));
          if (currentPopup.current) {
            currentPopup.current.remove();
            currentPopup.current = null;
          }
        };

        // CRITICAL FIX: Make sure this function calls startBlockSplit correctly
        window[splitFunctionName] = () => {
          startBlockSplit(feature);
          
          if (currentPopup.current) {
            currentPopup.current.remove();
            currentPopup.current = null;
          }
        };

        window[editAreaFnName] = () => {
          startEditBlockArea(feature);
          if (currentPopup.current) {
            currentPopup.current.remove();
            currentPopup.current = null;
          }
        };

        popupContent = `
          <div class="map-popup owned mobile-optimized">
            <h3>${properties.block_name || 'Unnamed Block'}</h3>
            <div class="popup-details">
              <div><strong>Variety:</strong> ${properties.variety || 'Unknown'}</div>
              <div><strong>Area:</strong> ${typeof properties.area === 'number' ? `${properties.area.toFixed(2)} ha` : 'Unknown'}</div>
              <div><strong>Region:</strong> ${properties.region || 'Unknown'}</div>
              <div><strong>Winery:</strong> ${properties.winery || 'Unknown'}</div>
              <div><strong>Organic:</strong> ${properties.organic ? 'Yes' : 'No'}</div>
              <div><strong>ID:</strong> ${properties.id || 'Unknown'}</div>
              ${properties.planted_date ? `<div><strong>Planted:</strong> ${properties.planted_date}</div>` : ''}
            </div>
            <div class="popup-actions mobile-actions">
              <button 
                onclick="window.${editFunctionName}()" 
                class="popup-button mobile-button touch-friendly"
                ontouchstart="">
                Edit Details
              </button>
              <button 
                onclick="window.${splitFunctionName}()" 
                class="popup-button split-button mobile-button touch-friendly"
                ontouchstart=""
                style="background-color: #dc2626; color: white;">
                Split Block
              </button>
              <button
                onclick="window.${editAreaFnName}()"
                class="popup-button mobile-button touch-friendly"
                ontouchstart="">
                Edit Block Area
              </button>
            </div>
          </div>
        `;
        
      } else {
        // Block belongs to another company or is unassigned (existing admin code)
        if (isAuxeinAdmin) {
          window[assignBlockFunctionName] = () => {
            handleAssignBlock(properties);
            if (currentPopup.current) {
              currentPopup.current.remove();
              currentPopup.current = null;
            }
          };
          
          const currentOwnerText = properties.company_id 
            ? `Currently assigned to Company #${properties.company_id}`
            : 'Unassigned';
          
          popupContent = `
            <div class="map-popup other mobile-optimized">
              <h3>${properties.block_name || 'Unnamed Block'}</h3>
              <div class="popup-company-notice">${currentOwnerText}</div>
              <div class="popup-details limited">
                <div><strong>Variety:</strong> ${properties.variety || 'Unknown'}</div>
                <div><strong>Region:</strong> ${properties.region || 'Unknown'}</div>
                <div><strong>Area:</strong> ${typeof properties.area === 'number' ? `${properties.area.toFixed(2)} ha` : 'Unknown'}</div>
                <div><strong>ID:</strong> ${properties.id}</div>
              </div>
              <div class="popup-actions mobile-actions">
                <button 
                  onclick="window.${assignBlockFunctionName}()" 
                  class="popup-button assign-button mobile-button touch-friendly"
                  ontouchstart="">
                  ${properties.company_id ? 'Reassign Block' : 'Assign Block'}
                </button>
              </div>
            </div>
          `;
        } else {
          // Regular users see read-only view
          popupContent = `
            <div class="map-popup other mobile-optimized">
              <h3>${properties.block_name || 'Unnamed Block'}</h3>
              <div class="popup-company-notice">This block belongs to another company</div>
              <div class="popup-details limited">
                <div><strong>Variety:</strong> ${properties.variety || 'Unknown'}</div>
                <div><strong>Region:</strong> ${properties.region || 'Unknown'}</div>
                <div><strong>Area:</strong> ${typeof properties.area === 'number' ? `${properties.area.toFixed(2)} ha` : 'Unknown'}</div>
              </div>
            </div>
          `;
        }
      }

      // Create popup with mobile-friendly options
      const popup = new mapboxgl.Popup({
        closeButton: true,
        closeOnClick: true,
        maxWidth: 'min(90vw, 400px)',
        className: 'mobile-friendly-popup',
        anchor: 'top',
        focusAfterOpen: false
      })
        .setLngLat(e.lngLat)
        .setHTML(popupContent);

      // Store reference to current popup
      currentPopup.current = popup;
      
      // Store function names for cleanup
      popup._functionNames = [
        editFunctionName,
        splitFunctionName,
        assignBlockFunctionName,
        editAreaFnName
      ].filter(name => window[name]);
      
      popup.addTo(map.current);

      popup.on('close', () => {
        if (currentPopup.current === popup) {
          currentPopup.current = null;
        }
        
        // Clean up function references using stored names
        if (popup._functionNames) {
          popup._functionNames.forEach(name => {
            if (window[name]) {
              delete window[name];
            }
          });
        }
      });
    }
  };

  const startBlockSplit = (blockFeature) => {
    if (!blockFeature || !blockFeature.properties) {
      console.error('Invalid block feature passed to startBlockSplit');
      return;
    }

    setBlockToSplit(blockFeature);
    blockToSplitRef.current = blockFeature;
    setSplitLineDrawn(null);

    drawControl.current?.changeMode('draw_line_string');
    setMode('split');
    addSplitMask(map);
       
    setApiStatus(`Draw a line through "${blockFeature.properties.block_name}" to split it. Double-click to finish the line.`);

    setTimeout(() => {
    }, 500);
  };

  const handleParcelClick = (e) => {
    if (!isAuxeinAdmin) {
      return;
    }

    if (currentPopup.current) {
      currentPopup.current.remove();
      currentPopup.current = null;
    }

    if (e.features && e.features.length > 0) {
      const feature = e.features[0];
      const properties = feature.properties;

      // Create unique function names for cleanup
      const assignFunctionName = `assignParcel_${properties.id}_${Date.now()}`;
      const removeFunctionName = `removeAssignment_${properties.id}_${Date.now()}`;

      // Create popup content based on assignment status
      let popupContent;
      
      if (properties.has_assignment) {
        // Parcel is already assigned
        window[removeFunctionName] = () => {
          handleRemoveParcelAssignment(properties.id, properties.assigned_company_id);
          if (currentPopup.current) {
            currentPopup.current.remove();
            currentPopup.current = null;
          }
        };

        popupContent = `
          <div class="map-popup parcel assigned mobile-optimized">
            <h3>Land Parcel</h3>
            <div class="popup-details">
              <div><strong>LINZ ID:</strong> ${properties.linz_id}</div>
              <div><strong>Appellation:</strong> ${properties.appellation || 'Unknown'}</div>
              <div><strong>Land District:</strong> ${properties.land_district || 'Unknown'}</div>
              <div><strong>Area:</strong> ${properties.area_hectares ? `${properties.area_hectares.toFixed(2)} ha` : 'Unknown'}</div>
              <div><strong>Intent:</strong> ${properties.parcel_intent || 'Unknown'}</div>
            </div>
            <div class="assignment-status assigned">
              <strong>Assigned to:</strong> ${properties.assigned_company_name}
            </div>
            <div class="popup-actions mobile-actions">
              <button 
                onclick="window.${removeFunctionName}()" 
                class="popup-button remove-button mobile-button touch-friendly"
                ontouchstart="">
                Remove Assignment
              </button>
            </div>
          </div>
        `;
      } else {
        // Parcel is unassigned
        window[assignFunctionName] = () => {
          handleAssignParcel(properties);
          if (currentPopup.current) {
            currentPopup.current.remove();
            currentPopup.current = null;
          }
        };

        popupContent = `
          <div class="map-popup parcel unassigned mobile-optimized">
            <h3>Land Parcel</h3>
            <div class="popup-details">
              <div><strong>LINZ ID:</strong> ${properties.linz_id}</div>
              <div><strong>Appellation:</strong> ${properties.appellation || 'Unknown'}</div>
              <div><strong>Land District:</strong> ${properties.land_district || 'Unknown'}</div>
              <div><strong>Area:</strong> ${properties.area_hectares ? `${properties.area_hectares.toFixed(2)} ha` : 'Unknown'}</div>
              <div><strong>Intent:</strong> ${properties.parcel_intent || 'Unknown'}</div>
            </div>
            <div class="assignment-status unassigned">
              <strong>Status:</strong> Unassigned
            </div>
            <div class="popup-actions mobile-actions">
              <button 
                onclick="window.${assignFunctionName}()" 
                class="popup-button assign-button mobile-button touch-friendly"
                ontouchstart="">
                Assign to Company
              </button>
            </div>
          </div>
        `;
      }

      // Create popup
      const popup = new mapboxgl.Popup({
        closeButton: true,
        closeOnClick: true,
        maxWidth: 'min(90vw, 400px)',
        className: 'mobile-friendly-popup',
        anchor: 'top',
        focusAfterOpen: false
      })
        .setLngLat(e.lngLat)
        .setHTML(popupContent);

      // Store reference and function names for cleanup
      currentPopup.current = popup;
      popup._functionNames = [assignFunctionName, removeFunctionName].filter(name => window[name]);
      
      popup.addTo(map.current);

      popup.on('close', () => {
        if (currentPopup.current === popup) {
          currentPopup.current = null;
        }
        
        // Clean up function references
        if (popup._functionNames) {
          popup._functionNames.forEach(name => {
            if (window[name]) {
              delete window[name];
            }
          });
        }
      });
    }
    };

  const addBlocksToMap = (geojsonData, userCompanyId) => {
    if (!map.current) {
      console.log('Map not available, cannot add blocks');
      return;
    }

    console.log('Adding blocks to map, style loaded:', map.current.isStyleLoaded());

    const addLayers = () => {
      try {
        console.log('Adding layers to map');
        
        if (map.current.getLayer('vineyard-blocks-fill')) {
          map.current.removeLayer('vineyard-blocks-fill');
        }
        if (map.current.getLayer('vineyard-blocks-outline')) {
          map.current.removeLayer('vineyard-blocks-outline');
        }
        if (map.current.getLayer('blocks-labels')) {
          map.current.removeLayer('blocks-labels');
        }
        if (map.current.getSource('vineyard-blocks')) {
          map.current.removeSource('vineyard-blocks');
        }

        map.current.addSource('vineyard-blocks', {
          type: 'geojson',
          data: geojsonData
        });

        map.current.addLayer({
          id: 'vineyard-blocks-fill',
          type: 'fill',
          source: 'vineyard-blocks',
          paint: {
            'fill-color': [
              'case',
              ['==', ['get', 'company_id'], userCompanyId],
              '#58e23c',
              '#3b82f6'
            ],
            'fill-opacity': blockOpacity
          }
        });

        map.current.addLayer({
          id: 'vineyard-blocks-outline',
          type: 'line',
          source: 'vineyard-blocks',
          paint: {
            'line-color': '#ffffff',
            'line-width': [
              'case',
              ['==', ['get', 'company_id'], userCompanyId],
              2.5,
              1.5
            ],
            'line-opacity': 1
          }
        });

        map.current.addLayer({
          id: 'blocks-labels',
          type: 'symbol',
          source: 'vineyard-blocks',
          minzoom: 12,
          filter: isAuxeinAdmin ? 
            // Admin sees all blocks
            ['has', 'block_name'] :
            // Regular users see only their company's blocks
            ['==', ['get', 'company_id'], userCompanyId],
          layout: {
            'text-field': ['get', 'block_name'],
            'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
            'text-size': 12,
            'text-offset': [0, 0],
            'text-anchor': 'center'
          },
          paint: {
            'text-color': '#1f2937',
            'text-halo-color': '#ffffff',
            'text-halo-width': 2
          }
        });;

        if (mapHandlersRef.current.onClick) {
          try { map.current.off('click', mapHandlersRef.current.onClick); } catch {}
        }
        const onClick = (e) => {
          // Skip processing if we're in split mode - let the drawing tool handle it
          if (modeRef.current === 'split' || blockToSplitRef.current) return;

          // 🔺 PRIORITY: if a risk icon is under the cursor, let the risk handler own the click
          const RISK_LAYER_ID = 'risks-circles';
          if (map.current.getLayer(RISK_LAYER_ID)) {
            const riskHits = map.current.queryRenderedFeatures(e.point, { layers: [RISK_LAYER_ID] });
            if (riskHits && riskHits.length) {
              return;
            }
          }

          const layerIds = [
            'spatial-areas-fill',
            'vineyard-blocks-fill',
            'land-parcels-fill'
          ].filter((layerId) => map.current.getLayer(layerId));

          const allFeatures = map.current.queryRenderedFeatures(e.point, { layers: layerIds });

          console.log('Click detected, features found:', allFeatures.length);
          allFeatures.forEach((feature, index) => {
            console.log(`Feature ${index}:`, feature.layer.id, feature.properties);
          });

          // Separate features by type
          const spatialFeatures = allFeatures.filter((f) => f.layer.id === 'spatial-areas-fill');
          const blockFeatures   = allFeatures.filter((f) => f.layer.id === 'vineyard-blocks-fill');
          const parcelFeatures  = allFeatures.filter((f) => f.layer.id === 'land-parcels-fill');

          // Handle based on what was clicked - prioritize the most specific feature
          if (blockFeatures.length > 0 && spatialFeatures.length > 0) {
            handleBlockInteraction({ ...e, features: blockFeatures }, 'click');

          } else if (blockFeatures.length > 0) {
            if (!(e.originalEvent instanceof TouchEvent)) {
              handleBlockInteraction({ ...e, features: blockFeatures }, 'click');
            }

          } else if (spatialFeatures.length > 0) {

            handleSpatialAreaClick({ ...e, features: spatialFeatures });
          } else if (parcelFeatures.length > 0 && isAuxeinAdmin) {
            console.log('Parcel only clicked');
            handleParcelClick({ ...e, features: parcelFeatures });

          } else {
            if (currentPopup.current && !blockToSplit) {

              currentPopup.current.remove();
              currentPopup.current = null;
            }
          }
        };
        map.current.on('click', onClick);
        mapHandlersRef.current.onClick = onClick;

        if (mapHandlersRef.current.onTouchEnd) {
          try { map.current.off('touchend', mapHandlersRef.current.onTouchEnd); } catch {}
        }
        const onTouchEnd = (e) => {
          // Skip touch handling if we're in split mode
          if (blockToSplitRef.current || modeRef.current === 'split') {
              return;
          }

          // Same logic as click but for touch
          const allFeatures = map.current.queryRenderedFeatures(e.point, {
            layers: [
              'spatial-areas-fill',
              'vineyard-blocks-fill', 
              'land-parcels-fill'
            ].filter(layerId => map.current.getLayer(layerId))
          });
          
          const spatialFeatures = allFeatures.filter(f => f.layer.id === 'spatial-areas-fill');
          const blockFeatures = allFeatures.filter(f => f.layer.id === 'vineyard-blocks-fill');
          
          if (blockFeatures.length > 0 && spatialFeatures.length === 0) {
            handleTouchEnd({
              ...e,
              features: blockFeatures
            });
          } else if (spatialFeatures.length > 0) {
            // Handle spatial area touch
            handleSpatialAreaClick({
              ...e,
              features: spatialFeatures
            });
          }
        };
        map.current.on('touchend', onTouchEnd);
        mapHandlersRef.current.onTouchEnd = onTouchEnd;

        // Add click handler for map background to close popups
        map.current.on('touchend', (e) => {
          // Only close popup if we didn't touch a block and popup exists AND we're not in split mode
          if (currentPopup.current && (!e.features || e.features.length === 0) && !blockToSplit) {
            currentPopup.current.remove();
            currentPopup.current = null;
          }
        });

        if (geojsonData.features.length > 0) {
          if (!userInteracted || !initialFitDone) {
            const companyBlocks = geojsonData.features.filter(
              feature => Number(feature.properties.company_id) === Number(userCompanyId)
            );
            
            if (companyBlocks.length > 0) {
              const firstBlock = companyBlocks[0];
              
              if (firstBlock.properties.centroid_longitude && firstBlock.properties.centroid_latitude) {
                map.current.flyTo({
                  center: [
                    firstBlock.properties.centroid_longitude,
                    firstBlock.properties.centroid_latitude
                  ],
                  zoom: 15,
                  speed: 0.8,
                  essential: true
                });
              } else {
                const bounds = new mapboxgl.LngLatBounds();
                
                if (firstBlock.geometry.type === 'Polygon') {
                  firstBlock.geometry.coordinates[0].forEach(coord => {
                    bounds.extend(coord);
                  });
                  
                  map.current.fitBounds(bounds, { 
                    padding: 100,
                    maxZoom: 15
                  });
                }
              }
            } else {
              const bounds = new mapboxgl.LngLatBounds();
              geojsonData.features.forEach(feature => {
                if (feature.geometry.type === 'Polygon') {
                  feature.geometry.coordinates[0].forEach(coord => {
                    bounds.extend(coord);
                  });
                }
              });
              
              map.current.fitBounds(bounds, { 
                padding: 50,
                maxZoom: 16
              });
            }
            
            setInitialFitDone(true);
          }
        }

        setApiStatus(prevStatus => `${prevStatus.split(' - ')[0]}`);
      } catch (error) {
        console.error('Error adding layers:', error);
      }
    };
    
    withStyleReady(addLayers);
  };

  const addParcelsToMap = (geojsonData) => {
    if (!map.current) {
      console.log('Map not available, cannot add parcels');
      return;
    }
    const addParcelLayers = () => {
      try {
        if (map.current.getLayer('land-parcels-fill')) {
          map.current.removeLayer('land-parcels-fill');
        }
        if (map.current.getLayer('land-parcels-outline')) {
          map.current.removeLayer('land-parcels-outline');
        }
        if (map.current.getSource('land-parcels')) {
          map.current.removeSource('land-parcels');
        }

        map.current.addSource('land-parcels', {
          type: 'geojson',
          data: geojsonData
        });

        // Fill layer for parcels
        map.current.addLayer({
          id: 'land-parcels-fill',
          type: 'fill',
          source: 'land-parcels',
          paint: {
            'fill-color': [
              'case',
              ['get', 'has_assignment'],
              '#000000',  // Transparent assigned parcels
              '#94a3b8'   // Light gray for unassigned parcels
            ],
            'line-width': [
              'case',
              ['get', 'has_assignment'],
              4.5, // Thick border for assigned
              0    // No border for unassigned
            ],
            'fill-opacity': 0
          },
          layout: {
            'visibility': showParcelsLayer ? 'visible' : 'none'
          }
        });

        // Outline layer for parcels
        map.current.addLayer({
          id: 'land-parcels-outline',
          type: 'line',
          source: 'land-parcels',
          paint: {
            'line-color': [
              'case',
              ['get', 'has_assignment'],
              '#000000',  // Black outline for assigned
              '#64748b'   // Gray outline for unassigned
            ],
            'line-width': 2.5,
            'line-opacity': 1
          },
          layout: {
            'visibility': showParcelsLayer ? 'visible' : 'none'
          }
        });

        // Add click handler for parcels (admin only)
        if (isAuxeinAdmin) {
          map.current.on('click', 'land-parcels-fill', handleParcelClick);
          
          // Mouse hover effects
          map.current.on('mouseenter', 'land-parcels-fill', () => {
            if (!('ontouchstart' in window)) {
              map.current.getCanvas().style.cursor = 'pointer';
            }
          });

          map.current.on('mouseleave', 'land-parcels-fill', () => {
            if (!('ontouchstart' in window)) {
              map.current.getCanvas().style.cursor = '';
            }
          });
        }

      } catch (error) {
        console.error('Error adding parcel layers:', error);
      }
    };
    withStyleReady(addParcelLayers);
  };

  return (
    <div className="maps-page">
      <div className="sidebar">
        <div className="sidebar-content">
          <h3>Map Controls</h3>
          
          {/* Enhanced Map Style Control with 3D indicators */}
          <div className="control-section">
            <h4>Map Style</h4>
            <div className="style-buttons">
              {mapStyles.map((style) => (
                <button
                  key={style.id}
                  className={`style-button ${mapStyle === style.id ? 'active' : ''} ${style.is3D ? 'has-3d' : ''}`}
                  onClick={() => handleStyleChange(style.id)}
                  title={style.is3D ? `${style.name} (3D Terrain)` : style.name}
                >
                  {style.name}
                  {style.is3D && <span className="indicator-3d">🏔️</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Block Tools */}
          <div className="control-section">
            <h4>🗺️ Mapping Tools</h4>
            <small>
              🌿 To draw a new vineyard block or spatial area — including orchards, paddocks, forestry, or conservation areas —  
              select <strong>"Polygon Tool"</strong> on the map.
            </small>
            <br /><br />
            <small>
              ✂️ To split a vineyard into multiple management blocks —  
              select the vineyard, press <strong>"Split Block"</strong>, then draw the line for the split.  
              <br />
              ⚠️ <em>Note:</em> Only split a block into <strong>two portions per split</strong>.  
              Both new blocks will inherit the data from the original.
            </small>
              <br /><br />
            <small>
              🧩 To edit vineyard block shape — select the block, press <strong>"Edit Area"</strong>, then move the points and lines  
              to fit the new boundary or shape as needed.
              <br />
              ⚠️ <em>Note:</em> This edit tool only works for <strong>vineyard block areas</strong>.  
            </small>
          </div>

          <div className="control-section">
            <h4>{isAuxeinAdmin ? 'Admin Tools' : 'Layers'}</h4>
            
            {isAuxeinAdmin ? (
              // Admin controls (existing)
              <div className="admin-subsection">
                <h5>Land Parcels</h5>
                <label className="layer-toggle">
                  <input
                    type="checkbox"
                    checked={showParcelsLayer}
                    onChange={(e) => setShowParcelsLayer(e.target.checked)}
                  />
                  Show Parcels Layer
                </label>
                
                <div className="parcel-info">
                  <small>Parcels load at zoom level 12+</small>
                  {parcelCount > 0 && (
                    <small>
                      View: {parcelCount} parcels ({assignedParcelCount} assigned)
                    </small>
                  )}
                </div>
               {/* Spatial Areas Layer */}
               <label className="layer-toggle">
                 <input
                   type="checkbox"
                   checked={showSpatialAreasLayer}
                   onChange={(e) => setShowSpatialAreasLayer(e.target.checked)}
                   style={{ marginRight: '0.5rem' }}
                 />
                 🧭 Spatial Areas
               </label>
                <div className="admin-subsection">
                  <h5>Block Assignment</h5>
                  <small>Click any block to assign it to a company - </small>
                  <small>Companies loaded: {availableCompanies.length}</small>
                </div>
              </div>
            ) : (
              // Regular user controls
              <div className="user-parcel-controls">
                <hr style={{ margin: '0.75rem 0', opacity: 0.3 }} />
                {/* Spatial Areas Layer */}
               <label className="layer-toggle">
                 <input
                   type="checkbox"
                   checked={showSpatialAreasLayer}
                   onChange={(e) => setShowSpatialAreasLayer(e.target.checked)}
                   style={{ marginRight: '0.5rem' }}
                 />
                 🧭 Spatial Areas
               </label>
               <br /><br />
                {/* Parcels Layer */}
                <label className="layer-toggle">
                  <input
                    type="checkbox"
                    checked={showParcelsLayer}
                    onChange={(e) => setShowParcelsLayer(e.target.checked)}
                    style={{ marginRight: '0.5rem' }}
                  />
                  🗺️ Land Parcels
                </label>
                {/* Placeholder Toggles */}
                <br /><br />
                <label className="layer-toggle">
                  <input type="checkbox" 
                  style={{ marginRight: '0.5rem' }}
                  disabled />
                  ✅ Tasks <small style={{ opacity: 0.6 }}>(coming soon)</small>
                </label>
                <br /><br />  
                <label className="layer-toggle">
                  <input type="checkbox" 
                  style={{ marginRight: '0.5rem' }}
                  disabled />
                  👁️ Observations <small style={{ opacity: 0.6 }}>(coming soon)</small>
                </label>
                <br /><br /> 
                <label >
                  <input
                    type="checkbox"
                    style={{ marginRight: '0.5rem' }}
                    checked={!!showRisksLayer}
                    onChange={(e) => setShowRisksLayer(e.target.checked)}
                  /> ⚠️ Risks & Hazards
                </label>
                <br /><br /> 
                <label className="layer-toggle">
                  <input type="checkbox" 
                  style={{ marginRight: '0.5rem' }}
                  disabled />
                  🚨 Incidents <small style={{ opacity: 0.6 }}>(coming soon)</small>
                </label>

                <hr style={{ margin: '0.75rem 0', opacity: 0.3 }} />

                {/* Placeholder for filters */}
                <div className="layer-filters">
                  <small>🔍 Filters will appear here once layer data is available.</small>
                  <br></br>
                  <strong>🔍 Risk Filters.</strong>
                  <div className="map-overlay-controls">
                  <select
                    value={riskFilters.risk_type || ''}
                    onChange={(e) => setRiskFilters((s) => ({ ...s, risk_type: e.target.value || null }))}
                    style={{ marginRight: 8 }}
                  >
                    <option value="">All types</option>
                    <option value="health_safety">Health & Safety</option>
                    <option value="environmental">Environmental</option>
                    <option value="production">Production</option>
                    <option value="operational">Operational</option>
                    <option value="financial">Financial</option>
                    <option value="regulatory">Regulatory</option>
                    <option value="reputational">Reputational</option>
                  </select>

                  <select
                    value={riskFilters.risk_level || ''}
                    onChange={(e) => setRiskFilters((s) => ({ ...s, risk_level: e.target.value || null }))}
                    style={{ marginRight: 8 }}
                  >
                    <option value="">All levels</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>

                  <select
                    value={riskFilters.status || 'active'}
                    onChange={(e) => setRiskFilters((s) => ({ ...s, status: e.target.value || null }))}
                  >
                    <option value="active">Active</option>
                    <option value="closed">Closed</option>
                    <option value="archived">Archived</option>
                  </select>
                  </div>
                </div>
              </div>

            )}
          </div>

          {/* Parcel Assignment Modal - Fixed version */}
          {showAssignmentModal && selectedParcelForAssignment && (
            <div className="assignment-modal-overlay">
              <div className="assignment-modal">
                <h3>Assign Parcel to Company</h3>
                
                <div className="parcel-info-section">
                  <h4>Parcel Information</h4>
                  <div className="parcel-details">
                    <div><strong>LINZ ID:</strong> {selectedParcelForAssignment.linz_id}</div>
                    <div><strong>Appellation:</strong> {selectedParcelForAssignment.appellation || 'Unknown'}</div>
                    <div><strong>Land District:</strong> {selectedParcelForAssignment.land_district || 'Unknown'}</div>
                    <div><strong>Area:</strong> {selectedParcelForAssignment.area_hectares ? `${selectedParcelForAssignment.area_hectares.toFixed(2)} ha` : 'Unknown'}</div>
                    <div><strong>Intent:</strong> {selectedParcelForAssignment.parcel_intent || 'Unknown'}</div>
                  </div>
                </div>
                
                <form onSubmit={(e) => { e.preventDefault(); handleConfirmAssignment(); }}>
                  <div className="form-group">
                    <label htmlFor="company_id">Select Company *</label>
                    <select
                      id="company_id"
                      value={assignmentFormData.company_id}
                      onChange={(e) => setAssignmentFormData(prev => ({ ...prev, company_id: e.target.value }))}
                      required
                      disabled={isLoadingCompanies}
                    >
                      <option value="">
                        {isLoadingCompanies ? 'Loading companies...' : 'Select a company'}
                      </option>
                      {/* Add array check here */}
                      {Array.isArray(availableCompanies) && availableCompanies.map(company => (
                        <option key={company.id} value={company.id}>
                          {company.name} {company.company_number ? `(${company.company_number})` : ''}
                        </option>
                      ))}
                    </select>
                    {/* Add debug info */}
                    <small style={{color: 'red', fontSize: '12px'}}>
                      Debug: Companies type: {typeof availableCompanies}, Length: {Array.isArray(availableCompanies) ? availableCompanies.length : 'Not array'}
                    </small>
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="ownership_type">Ownership Type</label>
                    <select
                      id="ownership_type"
                      value={assignmentFormData.ownership_type}
                      onChange={(e) => setAssignmentFormData(prev => ({ ...prev, ownership_type: e.target.value }))}
                    >
                      <option value="full">Full Ownership</option>
                      <option value="partial">Partial Ownership</option>
                      <option value="leased">Leased</option>
                      <option value="disputed">Disputed</option>
                    </select>
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="ownership_percentage">Ownership Percentage</label>
                    <input
                      type="number"
                      id="ownership_percentage"
                      min="0"
                      max="100"
                      step="0.1"
                      value={assignmentFormData.ownership_percentage}
                      onChange={(e) => setAssignmentFormData(prev => ({ ...prev, ownership_percentage: parseFloat(e.target.value) }))}
                    />
                    <small>Percentage of ownership (0-100%)</small>
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="verification_method">Verification Method</label>
                    <select
                      id="verification_method"
                      value={assignmentFormData.verification_method}
                      onChange={(e) => setAssignmentFormData(prev => ({ ...prev, verification_method: e.target.value }))}
                    >
                      <option value="manual">Manual Assignment</option>
                      <option value="landonline">Land Online</option>
                      <option value="title_deed">Title Deed</option>
                      <option value="survey">Survey</option>
                    </select>
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="assignment_notes">Notes (Optional)</label>
                    <textarea
                      id="assignment_notes"
                      rows="3"
                      value={assignmentFormData.notes}
                      onChange={(e) => setAssignmentFormData(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder="Add any notes about this assignment..."
                    />
                  </div>
                  
                  <div className="form-actions">
                    <button 
                      type="button" 
                      onClick={handleCancelAssignment} 
                      className="cancel-button"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      className="assign-button"
                      disabled={!assignmentFormData.company_id || isLoadingCompanies}
                    >
                      Assign Parcel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Block Assignment Modal */}
          {showBlockAssignmentModal && selectedBlockForAssignment && (
            <div className="assignment-modal-overlay">
              <div className="assignment-modal">
                <h3>Assign Block to Company</h3>
                
                <div className="parcel-info-section">
                  <h4>Block Information</h4>
                  <div className="parcel-details">
                    <div><strong>Block Name:</strong> {selectedBlockForAssignment.block_name || 'Unnamed Block'}</div>
                    <div><strong>Variety:</strong> {selectedBlockForAssignment.variety || 'Unknown'}</div>
                    <div><strong>Area:</strong> {selectedBlockForAssignment.area ? `${selectedBlockForAssignment.area.toFixed(2)} ha` : 'Unknown'}</div>
                    <div><strong>Region:</strong> {selectedBlockForAssignment.region || 'Unknown'}</div>
                    <div><strong>Current Owner:</strong> {selectedBlockForAssignment.company_id ? `Company #${selectedBlockForAssignment.company_id}` : 'Unassigned'}</div>
                    <div><strong>Block ID:</strong> {selectedBlockForAssignment.id}</div>
                  </div>
                </div>
                
                <form onSubmit={(e) => { e.preventDefault(); handleConfirmBlockAssignment(); }}>
                  <div className="form-group">
                    <label htmlFor="block_company_id">Select Company *</label>
                    <select
                      id="block_company_id"
                      value={blockAssignmentFormData.company_id}
                      onChange={(e) => setBlockAssignmentFormData(prev => ({ ...prev, company_id: e.target.value }))}
                      required
                      disabled={isLoadingCompanies}
                    >
                      <option value="">
                        {isLoadingCompanies ? 'Loading companies...' : 'Select a company'}
                      </option>
                      {Array.isArray(availableCompanies) && availableCompanies.map(company => (
                        <option key={company.id} value={company.id}>
                          {company.name} {company.company_number ? `(${company.company_number})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="block_assignment_notes">Notes (Optional)</label>
                    <textarea
                      id="block_assignment_notes"
                      rows="3"
                      value={blockAssignmentFormData.notes}
                      onChange={(e) => setBlockAssignmentFormData(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder="Add any notes about this block assignment..."
                    />
                  </div>
                  
                  <div className="assignment-warning">
                    <p><strong>⚠️ Note:</strong> This will {selectedBlockForAssignment.company_id ? 'transfer' : 'assign'} management of this block to the selected company.</p>
                  </div>
                  
                  <div className="form-actions">
                    <button 
                      type="button" 
                      onClick={handleCancelBlockAssignment} 
                      className="cancel-button"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      className="assign-button"
                      disabled={!blockAssignmentFormData.company_id || isLoadingCompanies}
                    >
                      {selectedBlockForAssignment.company_id ? 'Reassign Block' : 'Assign Block'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

        </div>
      </div>

      <div className="maps-container">
        <div ref={mapContainer} id="map" className="map-container" />
        <div className="map-overlays">
        {/* Status bar */}
        <div className="map-status-bar">
          <span>{apiStatus}</span>
          {blockToSplit && (
            <span className="split-mode-indicator">
              Splitting: {blockToSplit.properties.block_name}
              {splitLineDrawn ? ' - Line drawn' : ' - Draw line'}
              <span style={{fontSize: '10px', marginLeft: '8px'}}>(ESC to cancel)</span>
            </span>
          )}
        </div>

        {isEditingBlockArea && (
          <div
            style={{
              position: 'absolute',
              zIndex: 50,
              top: 16,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'white',
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              borderRadius: 8,
              padding: '8px 12px',
              display: 'flex',
              gap: 8
            }}
          >
            <button
              className="tool-button map-button"
              onClick={saveEditedBlockArea}
              disabled={!isEditingBlockArea}
              title={!isEditedPolygonValid ? 'Polygon is incomplete/invalid' : 'Save'}
            >
              Save
            </button>
            <button
              className="tool-button"
              onClick={cancelEditBlockArea}
            >
              Cancel
            </button>
          </div>
        )}

        {/* Drawing Form */}
        {showDrawingForm && (
          <div className="drawing-form-container">
            <div className="drawing-form">
              <h3>New Area</h3>
              <form onSubmit={(e) => {
                e.preventDefault();
                if (mappingType === 'block') {
                  handleNewBlockSubmit(e);
                } else if (mappingType === 'spatial_area') {
                  handleNewSpatialAreaSubmit(e);
                }
              }}>
                {/* Type Selection - only show if not already selected */}
                {!mappingType && (
                  <div className="form-group">
                    <label>What type of area is this?</label>
                    <div className="type-selection-buttons">
                      <button
                        type="button"
                        className={`type-button ${mappingType === 'block' ? 'active' : ''}`}
                        onClick={() => setMappingType('block')}
                      >
                        Vineyard Block
                      </button>
                      <button
                        type="button"
                        className={`type-button ${mappingType === 'spatial_area' ? 'active' : ''}`}
                        onClick={() => setMappingType('spatial_area')}
                      >
                        Spatial Area
                      </button>
                    </div>
                  </div>
                )}

                {/* Show appropriate form based on type */}
                {mappingType === 'block' && (
                  <>
                    <div className="form-group">
                      <label htmlFor="block_name">Block Name</label>
                      <input
                        type="text"
                        id="block_name"
                        value={newBlockInfo.block_name}
                        onChange={(e) => setNewBlockInfo(prev => ({ ...prev, block_name: e.target.value }))}
                        required
                      />
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="variety">Variety</label>
                      <input
                        type="text"
                        id="variety"
                        value={newBlockInfo.variety}
                        onChange={(e) => setNewBlockInfo(prev => ({ ...prev, variety: e.target.value }))}
                      />
                    </div>
                  </>
                )}

                {mappingType === 'spatial_area' && (
                  <>
                    <div className="form-group">
                      <label htmlFor="area_type">Area Type</label>
                      <select
                        id="area_type"
                        value={spatialAreaType}
                        onChange={(e) => setSpatialAreaType(e.target.value)}
                        required
                      >
                        <option value="">Select area type...</option>
                        {spatialAreaTypes.map(type => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label htmlFor="area_name">Area Name</label>
                      <input
                        type="text"
                        id="area_name"
                        value={newBlockInfo.block_name}
                        onChange={(e) => setNewBlockInfo(prev => ({ ...prev, block_name: e.target.value }))}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="description">Description (Optional)</label>
                      <textarea
                        id="description"
                        rows="2"
                        value={newBlockInfo.variety || ''}
                        onChange={(e) => setNewBlockInfo(prev => ({ ...prev, variety: e.target.value }))}
                        placeholder="Describe this area..."
                      />
                    </div>
                  </>
                )}

                {/* Common fields for both types */}
                <div className="form-group">
                  <label htmlFor="area">Area (hectares)</label>
                  <input
                    type="number"
                    id="area"
                    value={newBlockInfo.area}
                    step="0.01"
                    readOnly
                  />
                  <small>Area calculated from drawn polygon</small>
                </div>
                
                <div className="form-actions">
                  <button type="button" onClick={() => {
                    drawControl.current.deleteAll();
                    setShowDrawingForm(false);
                    clearDraftGeometry(map.current);
                    setIsMapping(false);
                    setMappingType('');
                    setSpatialAreaType('');
                    setNewBlockInfo({
                      block_name: '',
                      variety: '',
                      area: 0,
                      centroid_longitude: null,
                      centroid_latitude: null
                    });
                  }} className="cancel-button">
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="create-button"
                    disabled={!mappingType || (mappingType === 'spatial_area' && !spatialAreaType)}
                  >
                    Create {mappingType === 'block' ? 'Block' : 'Area'}
                  </button>


                </div>
              </form>
            </div>
          </div>
        )}
        </div>
      </div>

      <MobileNavigation />
      
      <SlidingEditForm
        isOpen={showEditForm}
        onClose={() => {
          setShowEditForm(false);
          setEditBlockData(null);
        }}
        blockData={editBlockData}
        onSubmit={handleBlockUpdate}
        onCreateRows={handleCreateRows}
      />
      <SpatialAreaSlidingEditForm
        isOpen={showEditSpatialAreaForm}  
        onClose={() => {
          setShowEditSpatialAreaForm(false);  
          setEditSpatialAreaData(null);  
        }}
        spatialAreaData={editSpatialAreaData} 
        onSubmit={handleSpatialAreaUpdate} 
        availableParentAreas={availableParentAreas}  
      />
      
      {/* Add mobile-specific styles */}
      <style jsx>{`
        .maps-page {
          display: flex;
          height: 90vh;
        }

        .sidebar {
          width: 600px;
          background: #ffffff;
          border-right: 1px solid #e5e7eb;
          box-shadow: 2px 0 4px rgba(0,0,0,0.1);
          overflow-y: auto;
          z-index: 10;
        }

        .sidebar-content {
          padding: 20px;
        }

        .sidebar h3 {
          margin: 0 0 20px 0;
          font-size: 18px;
          font-weight: 600;
          color: #374151;
        }

        .control-section {
          margin-bottom: 24px;
          padding-bottom: 16px;
          border-bottom: 1px solid #f3f4f6;
        }

        .control-section:last-child {
          border-bottom: none;
        }

        .control-section h4 {
          margin: 0 0 12px 0;
          font-size: 14px;
          font-weight: 500;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .style-buttons {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 8px;
        }

        .style-button {
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          background:rgba(96, 170, 89, 1);
          border-radius: 6px;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .style-button:hover {
          background: rgba(96, 170, 89, 1);
          border-color: #7dd6ffff;
        }

        .style-button.active {
          background: #3b82f6;
          color: white;
          border-color: #3b82f6;
        }

        .tool-button {
          width: 100%;
          padding: 10px 16px;
          border: 1px solid #d1d5db;
          background: #3b82f6;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .tool-button:hover {
          background: #f9fafb;
          border-color: #9ca3af;
        }

        .tool-button.active {
          background: #ef4444;
          color: white;
          border-color: #ef4444;
        }

        .maps-container {
          flex: 1;
          position: relative;
        }

        .map-container {
          width: 100%;
          height: 100%;
        }

        .maps-container { position: relative; }
        .map-container { position: absolute; inset: 0; } 
        .map-overlays { position: absolute; inset: 0; pointer-events: none; }
        .map-overlays .tool-button,
        .map-overlays .drawing-form,
        .map-overlays .map-status-bar { pointer-events: auto; } 

        .map-status-bar {
          position: absolute;
          bottom: 20px;
          left: 20px;
          background: rgba(255, 255, 255, 0.95);
          padding: 8px 16px;
          border-radius: 6px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          font-size: 13px;
          color: #374151;
          backdrop-filter: blur(4px);
        }

        .split-mode-indicator {
          margin-left: 12px;
          padding: 4px 8px;
          background: #ef4444;
          color: white;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 500;
        }

        .mobile-friendly-popup .mapboxgl-popup-content {
          padding: 16px;
          min-width: 280px;
          max-width: min(90vw, 400px);
          border-radius: 12px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        }

        .mobile-friendly-popup .popup-button.touch-friendly {
          padding: 14px 18px;
          margin: 6px 0;
          min-height: 48px;
          font-size: 16px;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          transition: all 0.2s ease;
          -webkit-tap-highlight-color: transparent;
        }

        .mobile-friendly-popup .popup-button.touch-friendly:active {
          transform: scale(0.95);
          background-color: rgba(0,0,0,0.1);
        }

        .mobile-friendly-popup .popup-actions.mobile-actions {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 16px;
        }

        .mobile-friendly-popup .mapboxgl-popup-close-button {
          font-size: 20px;
          padding: 8px;
          width: 32px;
          height: 32px;
          line-height: 16px;
        }

        .cancel-button {
          padding: 10px 20px;
          border: 1px solid #d1d5db;
          background: white;
          border-radius: 6px;
          cursor: pointer;
        }



        /* Drawing Form Styles */
        .drawing-form-container {
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 1000;
          background: white;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.2);
          max-width: 400px;
        }

        .drawing-form {
          padding: 24px;
        }

        .form-group {
          margin-bottom: 16px;
        }

        .form-group label {
          display: block;
          margin-bottom: 4px;
          font-weight: 500;
          color: #374151;
        }

        .form-group input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
        }

        .form-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          margin-top: 20px;
        }

        .create-button {
          padding: 10px 20px;
          border: none;
          background: #3b82f6;
          color: white;
          border-radius: 6px;
          cursor: pointer;
        }

        @media (max-width: 768px) {
          .sidebar {
            display: none;
          }
          
          .maps-container {
            width: 100%;
          }

          .map-container {
            touch-action: pan-x pan-y;
          }
          
          .mobile-friendly-popup .mapboxgl-popup-content {
            font-size: 14px;
          }
          
          .mobile-friendly-popup h3 {
            font-size: 18px;
            margin-bottom: 12px;
          }

          .drawing-form-container {
            top: 10px;
            right: 10px;
            left: 10px;
            max-width: none;
          }
          
          .assignment-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
          }

          .assignment-modal {
            background: white;
            border-radius: 8px;
            padding: 24px;
            max-width: 500px;
            width: 90%;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
          }

          .assignment-modal h3 {
            margin: 0 0 20px 0;
            color: #1f2937;
            font-size: 1.25rem;
          }

          .parcel-info-section {
            background: #f8fafc;
            border-radius: 6px;
            padding: 16px;
            margin-bottom: 20px;
          }

          .parcel-info-section h4 {
            margin: 0 0 12px 0;
            color: #374151;
            font-size: 1rem;
          }

          .parcel-details {
            display: grid;
            gap: 8px;
            font-size: 0.9rem;
          }

          .parcel-details div {
            display: flex;
            justify-content: space-between;
          }

          .parcel-details strong {
            color: #374151;
            margin-right: 12px;
          }

          .form-group {
            margin-bottom: 16px;
          }

          .form-group label {
            display: block;
            margin-bottom: 6px;
            font-weight: 500;
            color: #374151;
          }

          .form-group select,
          .form-group input,
          .form-group textarea {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid #d1d5db;
            border-radius: 4px;
            font-size: 14px;
          }

          .form-group select:focus,
          .form-group input:focus,
          .form-group textarea:focus {
            outline: none;
            border-color: #3b82f6;
            box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
          }

          .form-group small {
            display: block;
            margin-top: 4px;
            color: #6b7280;
            font-size: 12px;
          }

          .form-actions {
            display: flex;
            gap: 12px;
            justify-content: flex-end;
            margin-top: 24px;
            padding-top: 16px;
            border-top: 1px solid #e5e7eb;
          }

          .cancel-button {
            padding: 10px 20px;
            border: 1px solid #d1d5db;
            background: white;
            color: #374151;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
          }

          .cancel-button:hover {
            background: #f9fafb;
          }

          .assign-button {
            padding: 10px 20px;
            border: none;
            background: #3b82f6;
            color: white;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
          }

          .assign-button:hover:not(:disabled) {
            background: #2563eb;
          }

          .assign-button:disabled {
            background: #9ca3af;
            cursor: not-allowed;
          }

          /* Parcel popup styles */
          .map-popup.parcel.assigned .assignment-status.assigned {
            background: #dcfce7;
            color: #166534;
            padding: 8px;
            border-radius: 4px;
            margin: 12px 0;
            font-size: 14px;
          }

          .map-popup.parcel.unassigned .assignment-status.unassigned {
            background: #fef3c7;
            color:rgb(144, 201, 79);
            padding: 8px;
            border-radius: 4px;
            margin: 12px 0;
            font-size: 14px;
          }

          .popup-button.assign-button {
            background: #059669;
            color: white;
          }

          .popup-button.assign-button:hover {
            background: #047857;
          }

          .popup-button.remove-button {
            background: #dc2626;
            color: white;
          }

          .popup-button.remove-button:hover {
            background: #b91c1c;
          }
          
          .tool-button.map-button {
            background: #10b981;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
          }

          .tool-button.map-button:hover:not(:disabled) {
            background: #059669;
          }

          .tool-button.map-button.active {
            background: #059669;
            box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.3);
          }

          .tool-button.map-button:disabled {
            background: #9ca3af;
            cursor: not-allowed;
          }

          .button-icon {
            font-size: 16px;
          }

          .type-selection-buttons {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            margin-top: 8px;
          }

          .type-button {
            padding: 12px;
            border: 2px solid #e5e7eb;
            background: white;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
          }

          .type-button:hover {
            background: #f9fafb;
            border-color: #9ca3af;
          }

          .type-button.active {
            background: #3b82f6;
            color: white;
            border-color: #3b82f6;
          }
          .style-button.has-3d {
            position: relative;
          }
          
          .indicator-3d {
            font-size: 10px;
            position: absolute;
            top: 2px;
            right: 2px;
          }

        }
      `}</style>
    </div>
  );
}

export default Maps;