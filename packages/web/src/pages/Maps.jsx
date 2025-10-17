import { useEffect, useRef, useState, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import MapboxGeocoder from '@mapbox/mapbox-gl-geocoder';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import '@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useAuth } from '@vineyard/shared';
import MobileNavigation from '../components/MobileNavigation';
import {blocksService, parcelsService, companiesService, spatialAreasService, vineyardRowsService} from '@vineyard/shared';
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
    { id: 'mapbox://styles/mapbox/navigation-night-v1', name: 'Night' },
    { id: 'mapbox://styles/mapbox/outdoors-v12', name: 'Outdoors' }, 
    { id: 'mapbox://styles/mapbox/satellite-v9', name: '3D Satellite', is3D: true },
    { id: 'mapbox://styles/mapbox/outdoors-v12-3d', name: '3D Outdoors', is3D: true, baseStyle: 'mapbox://styles/mapbox/outdoors-v12' }
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
    risk_type: null,      // e.g., 'chemical', 'flood', etc.
    risk_level: null,     // 'low' | 'medium' | 'high' | 'critical'
    status: 'active'      // default to active
  });
  const [showRisksLayer, setShowRisksLayer] = useState(true);

  const [isMapping, setIsMapping] = useState(false);
  const [mappingType, setMappingType] = useState(''); 
  const [spatialAreaType, setSpatialAreaType] = useState('');
  const [spatialAreasData, setSpatialAreasData] = useState(null);
  const [showSpatialAreasLayer, setShowSpatialAreasLayer] = useState(true);
  const [spatialAreaOpacity, setSpatialAreaOpacity] = useState(0.5);
  const [spatialAreaCount, setSpatialAreaCount] = useState(0);
  const splitMaskHandlersRef = useRef(null);
  let splitMaskStopHandler = null;
  const [isEditedPolygonValid, setIsEditedPolygonValid] = useState(true);
  const modeRef = useRef('idle');
  useEffect(() => { modeRef.current = mode; }, [mode]);

  const handleCreateRows = async (rowCreationData) => {
    try {
      const result = await vineyardRowsService.bulkCreateRows(rowCreationData);
      return result;
    } catch (error) {
      throw error;
    }
  };

  const handleStyleChange = (styleId) => {
    if (map.current) {
      const selectedStyle = mapStyles.find(s => s.id === styleId);
      const newIs3D = selectedStyle?.is3D || false;
      
      setMapStyle(styleId);
      if (newIs3D !== is3DMode) {
        setIs3DMode(newIs3D);
      }

      const actualStyleId = selectedStyle?.baseStyle || styleId;
      map.current.setStyle(actualStyleId);

      setTimeout(() => {
        map.current.easeTo({
          pitch: newIs3D ? 45 : 0,
          duration: 1500
        });
      }, 100);
    }
  };

  const add3DTerrain = () => {
    if (!map.current) return;
    
    try {
      console.log('Adding 3D terrain...');

      map.current.addSource('mapbox-dem', {
        'type': 'raster-dem',
        'url': 'mapbox://mapbox.mapbox-terrain-dem-v1',
        'tileSize': 512,
        'maxzoom': 14
      });

      map.current.setTerrain({ 
        'source': 'mapbox-dem', 
        'exaggeration': terrainExaggeration 
      });

      map.current.addLayer({
        'id': 'sky',
        'type': 'sky',
        'paint': {
          'sky-type': 'atmosphere',
          'sky-atmosphere-sun': [0.0, 0.0],
          'sky-atmosphere-sun-intensity': 15
        }
      });

      map.current.setLight({
        'color': 'rgba(255, 255, 255, 1)',
        'intensity': 0.4,
        'position': [1.5, 90, 80]
      });
      
      console.log('3D terrain added successfully');
      setApiStatus('3D terrain enabled');
    } catch (error) {
      console.error('Error adding 3D terrain:', error);
      setApiStatus('Error enabling 3D terrain');
    }
  };

  const remove3DTerrain = () => {
    if (!map.current) return;
    
    try {
      console.log('Removing 3D terrain...');
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
        limit: 1000
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

  const addRisksToMap = (geojsonData) => {
    if (!map.current) return;

    // Remove existing if any
    if (map.current.getLayer('risks-circles')) map.current.removeLayer('risks-circles');
    if (map.current.getLayer('risks-labels')) map.current.removeLayer('risks-labels');
    if (map.current.getSource('risks')) map.current.removeSource('risks');

    map.current.addSource('risks', { type: 'geojson', data: geojsonData });

    // Circle layer: color by risk_level
    map.current.addLayer({
      id: 'risks-circles',
      type: 'circle',
      source: 'risks',
      layout: {
        visibility: showRisksLayer ? 'visible' : 'none'
      },
      paint: {
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          8, 4,
          12, 6,
          16, 10
        ],
        'circle-color': [
          'match',
          ['get', 'risk_level'],
          'low', '#16a34a',
          'medium', '#f59e0b',
          'high', '#ea580c',
          'critical', '#dc2626',
          '#6b7280' // default
        ],
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#fff',
        'circle-opacity': 0.9
      }
    });

    // Label layer: tiny text (risk type or score)
    map.current.addLayer({
      id: 'risks-labels',
      type: 'symbol',
      source: 'risks',
      minzoom: 12,
      layout: {
        'text-field': ['get', 'risk_type'],
        'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
        'text-size': 10,
        'text-offset': [0, 1.2],
        'text-anchor': 'top',
        'visibility': showRisksLayer ? 'visible' : 'none'
      },
      paint: {
        'text-color': '#111827',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.2
      }
    });

    // Click popup
    map.current.off('click', 'risks-circles');
    map.current.on('click', 'risks-circles', (e) => {
      const f = e.features && e.features[0];
      if (!f) return;
      const { id, risk_title, risk_type, risk_level, risk_score, status } = f.properties || {};

      const coords = e.lngLat || (f.geometry?.coordinates ? { lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] } : null);
      if (!coords) return;

      const html = `
        <div class="risk-popup">
          <div class="popup-title">${risk_title || 'Risk'}</div>
          <div><b>Type:</b> ${risk_type || '-'}</div>
          <div><b>Level:</b> ${risk_level || '-'} (${risk_score || '-'})</div>
          <div><b>Status:</b> ${status || '-'}</div>
          <button class="popup-button mobile-button touch-friendly" onclick="window.open('/risks/${id}', '_blank')">Open risk</button>
        </div>
      `;

      const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: true })
        .setLngLat([coords.lng, coords.lat])
        .setHTML(html)
        .addTo(map.current);
      currentPopup.current = popup;
    });

    // Hover cursor
    map.current.off('mouseenter', 'risks-circles');
    map.current.off('mouseleave', 'risks-circles');
    map.current.on('mouseenter', 'risks-circles', () => { if (!('ontouchstart' in window)) map.current.getCanvas().style.cursor = 'pointer'; });
    map.current.on('mouseleave', 'risks-circles', () => { if (!('ontouchstart' in window)) map.current.getCanvas().style.cursor = ''; });
  };

  useEffect(() => {
    if (!map.current) return;
    addRisksToMap(risksGeoJSON);
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
      // Switch to direct vertex editing
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
    // Clean any draft layers you use elsewhere
    try { clearDraftGeometry(map.current); } catch {}
  };

  const saveEditedBlockArea = async () => {
    if (!map.current || !drawControl.current || !editingBlockFeature) return;

    const featureId = editingDrawFeatureIdRef.current;
    if (!featureId) return;

    try {
      // Ensure we’re editing exactly one polygon
      const edited = drawControl.current.get(featureId);
      if (!edited || edited.type !== 'Feature' || edited.geometry?.type !== 'Polygon') {
        throw new Error('Edited geometry must be a Polygon');
      }

      // Optional: preview area with turf (UI only). Server is source of truth.
      // const haPreview = turf.area(edited) / 10000.0;

      const blockId = editingBlockFeature.properties.id;

      // (Optional) client validation before send
      try { blocksService.validateBlockGeometry(edited.geometry); } catch (e) { throw e; }

      // Persist to API
      const result = await blocksService.updateBlockGeometry(blockId, edited.geometry);

      // Clean editing state
      cancelEditBlockArea();

      await loadBlocksData();

      // Optionally show a toast/snackbar with new area
      console.log('Block updated:', result?.area, 'ha');
    } catch (e) {
      console.error('Saving edited block failed:', e);
      // Optionally surface a UI error
    }
  };

  useEffect(() => {
    if (map.current) return;

      setTimeout(() => {
        map.current = new mapboxgl.Map({
          container: mapContainer.current,
          style: mapStyle,
          center: [172.6148, -43.5272],
          zoom: 8,
          pitch: is3DMode ? 45 : 0, // Tilt the map for 3D effect
          bearing: 0,
          antialias: true // Better rendering for 3D
        });

      map.current.once('style.load', () => {
        console.log('Style loaded, setting up 3D and layers');
        
        // Add 3D terrain if enabled
        if (is3DMode) {
          setTimeout(() => add3DTerrain(), 100);
        }
      
      // Load blocks data only if we don't have it yet
      if (blocksData) {
        console.log('Blocks data exists, adding to map');
        addBlocksToMap(blocksData, user?.company_id);
        loadSpatialAreasData();
      } else {
        console.log('No blocks data yet, will load from API');
        loadBlocksData();
        loadSpatialAreasData();
      }
      if (spatialAreasData) {
        console.log('Spatial areas data exists, adding to map');
        addSpatialAreasToMap(spatialAreasData, user?.company_id);
      } else {
        console.log('No spatial areas data yet, will load from API');
        loadSpatialAreasData();
      }
    });

      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

      map.current.addControl(
        new mapboxgl.GeolocateControl({
          positionOptions: {
            enableHighAccuracy: true
          },
          trackUserLocation: true,
          showUserHeading: true
        }),
        'top-right'
      );

      map.current.addControl(
        new MapboxGeocoder({
          accessToken: mapboxgl.accessToken,
          mapboxgl: mapboxgl,
          placeholder: 'Search for locations...',
          proximity: {
            longitude: 175.3103,
            latitude: -43.5320
          }
        }),
        'top'
      );

      // Add drawing control
      drawControl.current = new MapboxDraw({
        displayControlsDefault: false,
        controls: {
          polygon: true,
          line_string: false,   // <-- allow lines
          trash: true          // (nice to have) allow clearing current sketch
        },

        styles: [
          // Style for vertices
          {
            id: 'gl-draw-polygon-fill-inactive',
            type: 'fill',
            filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon']],
            paint: {
              'fill-color': '#58e23c',
              'fill-outline-color': '#58e23c',
              'fill-opacity': 0.5
            }
          },
          // Style for the polygon when active
          {
            id: 'gl-draw-polygon-fill-active',
            type: 'fill',
            filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
            paint: {
              'fill-color': '#58e23c',
              'fill-outline-color': '#58e23c',
              'fill-opacity': 0.5
            }
          },
          // Vertex style
          {
            id: 'gl-draw-polygon-midpoint',
            type: 'circle',
            filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'midpoint']],
            paint: {
              'circle-radius': 4,
              'circle-color': '#58e23c'
            }
          },
          // Line style
          {
            id: 'gl-draw-line-inactive',
            type: 'line',
            filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'LineString']],
            layout: {
              'line-cap': 'round',
              'line-join': 'round'
            },
            paint: {
              'line-color': '#ff0000',
              'line-width': 3
            }
          },
          // Active line style
          {
            id: 'gl-draw-line-active',
            type: 'line',
            filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'LineString']],
            layout: {
              'line-cap': 'round',
              'line-join': 'round'
            },
            paint: {
              'line-color': '#ff0000',
              'line-width': 3
            }
          },
          // Vertex point style
          {
            id: 'gl-draw-point-point-stroke-inactive',
            type: 'circle',
            filter: [
              'all',
              ['==', 'active', 'false'],
              ['==', '$type', 'Point'],
              ['==', 'meta', 'vertex']
            ],
            paint: {
              'circle-radius': 6,
              'circle-opacity': 1,
              'circle-color': '#fff',
              'circle-stroke-width': 2,
              'circle-stroke-color': '#58e23c'
            }
          },
          {
            id: 'gl-draw-point-inactive',
            type: 'circle',
            filter: [
              'all',
              ['==', 'active', 'false'],
              ['==', '$type', 'Point'],
              ['==', 'meta', 'vertex']
            ],
            paint: {
              'circle-radius': 4,
              'circle-color': '#58e23c'
            }
          },
          {
            id: 'gl-draw-point-stroke-active',
            type: 'circle',
            filter: [
              'all',
              ['==', '$type', 'Point'],
              ['==', 'active', 'true'],
              ['==', 'meta', 'vertex']
            ],
            paint: {
              'circle-radius': 8,
              'circle-color': '#fff',
              'circle-stroke-width': 2,
              'circle-stroke-color': '#58e23c'
            }
          },
          {
            id: 'gl-draw-point-active',
            type: 'circle',
            filter: [
              'all',
              ['==', '$type', 'Point'],
              ['==', 'meta', 'active'],
              ['==', 'active', 'true']
            ],
            paint: {
              'circle-radius': 6,
              'circle-color': '#58e23c'
            }
          }
        ]
      });
      
      map.current.addControl(drawControl.current, 'top-right');

      map.current.on('draw.create', handleDrawCreate);
      map.current.on('draw.delete', handleDrawDelete);
      map.current.on('draw.update', handleDrawUpdate);

      map.current.on('style.load', handleStyleLoad);

      map.current.on('zoomstart', (e) => {
        if (e.originalEvent) {
          setUserInteracted(true);
        }
      });

    }, 100);

    return () => map.current?.remove();
  }, []);

  // Reattach layers after style changes using the latest state (no refetch)
  useEffect(() => {
    if (!map.current) return;

    const onStyleLoad = () => {
      console.log('Style changed -> reattach layers from state');
      if (is3DMode) setTimeout(() => add3DTerrain(), 200);
      if (blocksData) addBlocksToMap(blocksData, user?.company_id);
      if (spatialAreasData) addSpatialAreasToMap(spatialAreasData, user?.company_id);
      if (parcelsData) addParcelsToMap(parcelsData);
    };

    map.current.on('style.load', onStyleLoad);
    return () => map.current?.off('style.load', onStyleLoad);
  }, [blocksData, spatialAreasData, parcelsData, is3DMode, user?.company_id]);


  // Update opacity when it changes
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
    console.log('=== handleDrawCreate called ===');
    console.log('Features count:', e.features.length);

    const activeBlock = blockToSplitRef.current; // <--- use ref
    console.log('Current blockToSplit (ref):', activeBlock?.properties?.block_name || 'null');

    if (e.features.length === 0) return;

    const feature = e.features[0];
    console.log('Feature type:', feature.geometry.type);

    if (activeBlock && feature.geometry.type === 'LineString') {
      console.log('=== PROCESSING SPLIT LINE ===');
      console.log('Block to split:', activeBlock.properties.block_name);
      handleSplitLineDrawn(feature, activeBlock);  // <— pass it
    } else if (!activeBlock && feature.geometry.type === 'Polygon') {
      console.log('=== PROCESSING POLYGON ===');

      // 1) Snapshot geometry and computed fields for the form
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
      console.log('=== NO ACTION TAKEN ===');
      console.log('Reason: blockToSplit exists?', !!activeBlock);
      console.log('Feature type:', feature.geometry.type);
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
    console.log('Split line drawn for block:', name);

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
    console.log('=== validateSplitLine called ===');
    console.log('Block feature:', blockFeature);
    console.log('Line feature:', lineFeature);
    
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

      // Check line length (minimum 10 meters)
      const lengthMeters = turf.length(lineGeom, { units: "kilometers" }) * 1000;
      console.log('Line length (meters):', lengthMeters);
      
      if (lengthMeters < 10) {
        return { isValid: false, reason: "Line too short. Draw a longer line across the block." };
      }

      // Check if line intersects the block
      const intersects = turf.booleanIntersects(blockGeom, lineGeom);
      console.log('Line intersects block:', intersects);
      
      if (!intersects) {
        return { isValid: false, reason: "Line must intersect the block boundary" };
      }

      // Check for proper crossing (at least 2 intersection points)
      const intersections = turf.lineIntersect(lineGeom, blockGeom);
      const intersectionCount = intersections.features ? intersections.features.length : 0;
      console.log('Intersection points:', intersectionCount);
      
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
      splitLineRef.current = null;                     // <-- clear the ref
    } finally {
      setIsSplitProcessing(false);
    }
  };


  useEffect(() => {
    console.log('=== blockToSplit state changed ===');
    console.log('New blockToSplit:', blockToSplit?.properties?.block_name || 'null');
  }, [blockToSplit]);

  useEffect(() => {
    console.log('=== blockToSplit useEffect triggered ===');
    console.log('Previous blockToSplit:', blockToSplit?.properties?.block_name || 'null');
    console.log('blockToSplit is now:', blockToSplit?.properties?.block_name || 'null');
    console.log('blockToSplit full object:', blockToSplit);
  }, [blockToSplit]);


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
    console.log('=== handleDrawDelete called ===');
    console.log('blockToSplit before delete:', blockToSplit?.properties?.block_name || 'null');
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
      
      console.log('Sending block data with geometry:', blockData);
      
      // Use blocksService to create the block
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
        name: newBlockInfo.block_name, // Using the same field for name
        description: newBlockInfo.variety || '', // Using variety field for description
        area_hectares: newBlockInfo.area,
        geometry: {
          type: drawingCoordinates.type,
          coordinates: drawingCoordinates.coordinates
        },
        company_id: user?.company_id
      };
      
      console.log('Sending spatial area data:', spatialAreaData);
      
      // Use spatialAreasService to create the area
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
        
        // Reload spatial areas
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
      console.log('Blocks already loading, skipping...');
      return;
    }
    
    try {
      loadBlocksData.isLoading = true;
      console.log('Starting blocks data loading');
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
        
        console.log('Blocks data set, map will update via useEffect');
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

  async function loadSpatialAreasData() {
    try {
      setApiStatus('Loading spatial areas...');

      let response;

      if (isAuxeinAdmin) {
        // Try to fetch ALL areas as GeoJSON (explicit scope hint for the API)
        response = await spatialAreasService.getSpatialAreasGeoJSON({ scope: 'all' });

        // Fallback if the API still scopes the GeoJSON endpoint for admins:
        if (!response || !Array.isArray(response.features) || response.features.length === 0) {
          // Adjust the list method name to match your service if needed:
          // e.g. spatialAreasService.getSpatialAreas / listSpatialAreas / getAllSpatialAreas
          const list = await spatialAreasService.getAllSpatialAreas
            ? await spatialAreasService.getAllSpatialAreas({ scope: 'all' })
            : await spatialAreasService.getSpatialAreas({ scope: 'all' });

          response = toFeatureCollection(list);
        }
      } else {
        // Company-scoped users: the server may already scope this; we still pass company_id in case it’s supported
        response = await spatialAreasService.getSpatialAreasGeoJSON({ company_id: user?.company_id });
      }

      // Safety: ensure we have a FeatureCollection
      if (!response || response.type !== 'FeatureCollection') {
        console.warn('Spatial areas: normalizing to FeatureCollection');
        response = toFeatureCollection(response?.items || response?.data || []);
      }

      // Persist + render
      setSpatialAreasData(response);
      addSpatialAreasToMap(response, user?.company_id);

      setApiStatus(`Spatial areas loaded (${response.features?.length || 0})`);
    } catch (err) {
      console.error('Failed to load spatial areas', err);
      setApiStatus('Failed to load spatial areas');
    }
  }

  const addSpatialAreasToMap = (geojsonData, userCompanyId) => {
    if (!map.current) {
      console.log('Map not available, cannot add spatial areas');
      return;
    }

    console.log('Adding spatial areas to map');

    try {
      // Remove existing spatial area layers if they exist
      if (map.current.getLayer('spatial-areas-fill')) {
        map.current.removeLayer('spatial-areas-fill');
      }
      if (map.current.getLayer('spatial-areas-outline')) {
        map.current.removeLayer('spatial-areas-outline');
      }
      if (map.current.getLayer('spatial-areas-labels')) {
        map.current.removeLayer('spatial-areas-labels');
      }
      if (map.current.getSource('spatial-areas')) {
        map.current.removeSource('spatial-areas');
      }

      let filteredFeatures = geojsonData.features;

      // FIX: Admin should see ALL spatial areas, not filter by company
      if (!isAuxeinAdmin) {
        // Only filter for non-admin users
        filteredFeatures = geojsonData.features.filter(
          feature => Number(feature.properties.company_id) === Number(userCompanyId)
        );
      }
      // If admin, use all features without filtering

      console.log(`Admin: ${isAuxeinAdmin}, Total features: ${geojsonData.features.length}, Filtered features: ${filteredFeatures.length}`);

      const filteredGeoJSON = {
        type: 'FeatureCollection',
        features: filteredFeatures
      };

      map.current.addSource('spatial-areas', {
        type: 'geojson',
        data: filteredGeoJSON
      });

      const findLayerPosition = () => {
        if (map.current.getLayer('vineyard-blocks-fill')) {
          return 'vineyard-blocks-fill';
        }
        if (map.current.getLayer('land-parcels-fill')) {
          return 'land-parcels-fill';
        }
        return null;
      };

      const beforeLayer = findLayerPosition();
      console.log('Adding spatial areas before layer:', beforeLayer || 'top');

      // Add fill layer with color coding based on area type
      const layerConfig = {
        id: 'spatial-areas-fill',
        type: 'fill',
        source: 'spatial-areas',
        paint: {
          'fill-color': [
            'match',
            ['get', 'area_type'],
            'paddock', '#22c55e',
            'orchard', '#f59e0b',
            'plantation_forestry', '#059669',
            'native_forest', '#065f46',
            'infrastructure_zone', '#6b7280',
            'waterway', '#3b82f6',
            'wetland', '#06b6d4',
            'conservation_area', '#10b981',
            'waste_management', '#dc2626',
            '#9ca3af' // default color
          ],
          'fill-opacity': spatialAreaOpacity
        },
        layout: {
          'visibility': showSpatialAreasLayer ? 'visible' : 'none'
        }
      };

      if (beforeLayer) {
        map.current.addLayer(layerConfig, beforeLayer);
      } else {
        map.current.addLayer(layerConfig);
      }

      // Add outline layer
      const outlineConfig = {
        id: 'spatial-areas-outline',
        type: 'line',
        source: 'spatial-areas',
        paint: {
          'line-color': '#1f2937',
          'line-width': 1,
          'line-opacity': 0.7,
          'line-dasharray': [2, 2]
        },
        layout: {
          'visibility': showSpatialAreasLayer ? 'visible' : 'none'
        }
      };

      const outlineBeforeLayer = map.current.getLayer('vineyard-blocks-outline') ? 'vineyard-blocks-outline' : null;
      
      if (outlineBeforeLayer) {
        map.current.addLayer(outlineConfig, outlineBeforeLayer);
      } else {
        map.current.addLayer(outlineConfig);
      }

      // Add labels for spatial areas
      map.current.addLayer({
        id: 'spatial-areas-labels',
        type: 'symbol',
        source: 'spatial-areas',
        minzoom: 12,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
          'text-size': 12,
          'text-offset': [0, 0],
          'text-anchor': 'center',
          'visibility': showSpatialAreasLayer ? 'visible' : 'none'
        },
        paint: {
          'text-color': '#1f2937',
          'text-halo-color': '#ffffff',
          'text-halo-width': 2
        }
      });

      // Add click handler for spatial areas
      map.current.off('click', 'spatial-areas-fill');
      map.current.on('click', 'spatial-areas-fill', handleSpatialAreaClick);

      // Mouse hover effects
      map.current.off('mouseenter', 'spatial-areas-fill');
      map.current.off('mouseleave', 'spatial-areas-fill');
      
      map.current.on('mouseenter', 'spatial-areas-fill', () => {
        if (!('ontouchstart' in window)) {
          map.current.getCanvas().style.cursor = 'pointer';
        }
      });

      map.current.on('mouseleave', 'spatial-areas-fill', () => {
        if (!('ontouchstart' in window)) {
          map.current.getCanvas().style.cursor = '';
        }
      });

      console.log(`Added ${filteredFeatures.length} spatial areas to map`);

    } catch (error) {
      console.error('Error adding spatial areas to map:', error);
      console.error('Error details:', error.message);
    }
  };

  const handleSpatialAreaClick = (e) => {
    console.log('Spatial area clicked:', e.features[0]);
    
    // Prevent default map behavior
    e.preventDefault();
    
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
              <button onclick="handleEditSpatialArea(${properties.id})" class="edit-btn">
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
        maxWidth: 'min(90vw, 350px)',
        className: 'spatial-area-popup',
        anchor: 'top'
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
  if (map.current && map.current.getLayer && map.current.getLayer('spatial-areas-fill')) {
    const visibility = showSpatialAreasLayer ? 'visible' : 'none';
    console.log('Setting spatial areas visibility to:', visibility);
    
    try {
      map.current.setLayoutProperty('spatial-areas-fill', 'visibility', visibility);
      map.current.setLayoutProperty('spatial-areas-outline', 'visibility', visibility);
      map.current.setLayoutProperty('spatial-areas-labels', 'visibility', visibility);
    } catch (error) {
      console.error('Error setting spatial areas visibility:', error);
    }
  } else if (showSpatialAreasLayer && spatialAreasData && user) {
    // If layers don't exist but we want them visible and have data, try to add them
    console.log('Spatial areas layers missing but should be visible, attempting to add');
    addSpatialAreasToMap(spatialAreasData, user.company_id);
  }
}, [showSpatialAreasLayer, spatialAreasData, user]);


// Separate useEffect to handle blocksData updates
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
      // Regular users load only their company's parcels
      console.log('🔍 Loading company parcels for user company:', user.company_id);
      
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
    
    console.log('🔍 Parcels response:', response);
    
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
    console.log('Loading available companies...');
    setIsLoadingCompanies(true);
    
    const response = await companiesService.getAllCompanies();
    console.log('Raw companies response:', response);
    console.log('Response type:', typeof response);
    console.log('Response keys:', Object.keys(response || {}));
    
    // Handle different possible response structures
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
        console.log('Found array in response:', possibleArrays[0]);
      } else {
        console.error('No array found in response object:', response);
        companies = [];
      }
    } else {
      console.error('Unexpected companies response structure:', response);
      companies = [];
    }
    
    console.log('Final companies array:', companies);
    console.log('Companies count:', companies.length);
    
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
    console.log('Initial load triggered');
    loadBlocksData();        
    loadSpatialAreasData();   
    
  };
  
  if (map.current.loaded()) {
    console.log('Map already loaded, loading blocks');
    loadData();
  } else {
    console.log('Map not loaded yet, setting up load event');
    map.current.once('load', loadData);
  }
  
  return () => {
    if (map.current) {
      map.current.off('load', loadData);
    }
  };
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

// Load spatial areas when component mounts or user changes
useEffect(() => {
  if (user && map.current) {
    loadSpatialAreasData();
  }
}, [user]);

// Handle spatial areas layer visibility toggle
useEffect(() => {
  if (map.current && map.current.getLayer('spatial-areas-fill')) {
    const visibility = showSpatialAreasLayer ? 'visible' : 'none';
    map.current.setLayoutProperty('spatial-areas-fill', 'visibility', visibility);
    map.current.setLayoutProperty('spatial-areas-outline', 'visibility', visibility);
    map.current.setLayoutProperty('spatial-areas-labels', 'visibility', visibility);
  }
}, [showSpatialAreasLayer]);

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
  // Auto-show parcels for regular users (non-admin)
  if (user && isCompanyScope && map.current) {
    console.log('Auto-enabling parcels for regular user:', user.email);
    setShowParcelsLayer(true);
    // Also trigger loading if map is ready
    if (map.current) {
      console.log('Map ready, loading parcels for regular user');
      setTimeout(() => loadParcelsData(), 500); // Small delay to ensure state is updated
    }
  }
}, [user]);

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
    console.log('Opening edit form for spatial area:', e.detail.spatialAreaId);
    
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
    console.log('Opening edit form for block:', e.detail.blockId);
    
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
    console.log('Touch end triggered with features:', e.features?.length);
    
    const now = Date.now();
    const touch = e.originalEvent?.changedTouches?.[0];
    
    if (touchStartTime.current && touchStartPosition.current && touch) {
      const touchDuration = now - touchStartTime.current;
      const touchDistance = Math.sqrt(
        Math.pow(touch.clientX - touchStartPosition.current.x, 2) + 
        Math.pow(touch.clientY - touchStartPosition.current.y, 2)
      );
      
      // Consider it a tap if:
      // - Duration is less than 500ms (not a long press)
      // - Movement is less than 10 pixels (not a drag)
      const isTap = touchDuration < 500 && touchDistance < 10;
      
      console.log('Touch end analysis:', {
        duration: touchDuration,
        distance: touchDistance,
        isTap,
        isLongPress: isLongPress.current,
        featuresCount: e.features?.length,
        hasFeatures: !!(e.features && e.features.length > 0)
      });
      
      if (isTap && e.features && e.features.length > 0) {
        console.log('Valid tap detected, calling handleBlockInteraction');
        // Prevent the click event from also firing
        if (e.originalEvent) {
          e.originalEvent.preventDefault();
          e.originalEvent.stopPropagation();
        }
        
        // Store the event data before the timeout to avoid losing it
        const eventData = {
          ...e,
          features: e.features,
          lngLat: e.lngLat,
          originalEvent: e.originalEvent,
          preventDefault: () => {}
        };
        
        // Add a small delay to ensure touch feedback is visible, then show popup
        setTimeout(() => {
          console.log('Calling handleBlockInteraction with preserved features:', eventData.features?.length);
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
    console.log(`Block ${eventType} event:`, {
      eventType,
      featuresCount: e.features?.length
    });

    // Close any existing popup first
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
          console.log('Opening edit form for block:', properties.id);
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
          console.log('=== Split button clicked in popup ===');
          console.log('Calling startBlockSplit with feature:', feature.properties.block_name);
          
          // Call startBlockSplit with the FULL feature object
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
            console.log('Assign block clicked for block:', properties);
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
    console.log('=== startBlockSplit called ===');
    console.log('Block feature received:', blockFeature);
    console.log('Block name:', blockFeature?.properties?.block_name);
    console.log('Block ID:', blockFeature?.properties?.id);
    console.log('Feature type:', blockFeature?.type);
    

    if (!blockFeature || !blockFeature.properties) {
      console.error('Invalid block feature passed to startBlockSplit');
      return;
    }
    
    // Store the block to split
    console.log('Setting blockToSplit state...');
    setBlockToSplit(blockFeature);
    blockToSplitRef.current = blockFeature;
    setSplitLineDrawn(null);

    console.log('State should be set. blockToSplit name:', blockFeature.properties.block_name);

    // Switch to line drawing mode
    drawControl.current?.changeMode('draw_line_string');
    setMode('split');
    addSplitMask(map);
       
    setApiStatus(`Draw a line through "${blockFeature.properties.block_name}" to split it. Double-click to finish the line.`);

    // Debug: Check state after a delay
    setTimeout(() => {
      console.log('=== State check after 500ms ===');
      // We can't directly access the state here, but we'll see in the next render
    }, 500);
  };

  const handleParcelClick = (e) => {
    console.log('Parcel click event:', e);

    // Only allow admin to interact with parcels
    if (!isAuxeinAdmin) {
      return;
    }

    // Close any existing popup first
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
          console.log('Remove assignment clicked for parcel:', properties.id);
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
          console.log('Assign parcel clicked for parcel:', properties.id);
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

        // Remove existing click handlers first
        map.current.off('click', 'vineyard-blocks-fill');
        map.current.off('touchstart', 'vineyard-blocks-fill');
        map.current.off('touchend', 'vineyard-blocks-fill');

        // Add a universal click handler that checks for all feature types
        map.current.on('click', (e) => {
          // Skip processing if we're in split mode - let the drawing tool handle it
          if (modeRef.current === 'split' || blockToSplitRef.current) return;

          // Query all features at the click point
          const allFeatures = map.current.queryRenderedFeatures(e.point, {
            layers: [
              'spatial-areas-fill',
              'vineyard-blocks-fill', 
              'land-parcels-fill'
            ].filter(layerId => map.current.getLayer(layerId)) // Only include layers that exist
          });
          
          console.log('Click detected, features found:', allFeatures.length);
          allFeatures.forEach((feature, index) => {
            console.log(`Feature ${index}:`, feature.layer.id, feature.properties);
          });
          
          // Separate features by type
          const spatialFeatures = allFeatures.filter(f => f.layer.id === 'spatial-areas-fill');
          const blockFeatures = allFeatures.filter(f => f.layer.id === 'vineyard-blocks-fill');
          const parcelFeatures = allFeatures.filter(f => f.layer.id === 'land-parcels-fill');
          
          // Handle based on what was clicked - prioritize the most specific feature
          if (blockFeatures.length > 0 && spatialFeatures.length > 0) {
            // Both block and spatial area - check which is more specific
            console.log('Both block and spatial area clicked');
            
            // For now, let's prefer blocks but make sure spatial areas are still accessible
            handleBlockInteraction({
              ...e,
              features: blockFeatures
            }, 'click');
            
          } else if (blockFeatures.length > 0) {
            console.log('Block only clicked');
            if (!(e.originalEvent instanceof TouchEvent)) {
              handleBlockInteraction({
                ...e,
                features: blockFeatures
              }, 'click');
            }
            
          } else if (spatialFeatures.length > 0) {
            console.log('Spatial area only clicked');
            handleSpatialAreaClick({
              ...e,
              features: spatialFeatures
            });
            
          } else if (parcelFeatures.length > 0 && isAuxeinAdmin) {
            console.log('Parcel only clicked');
            handleParcelClick({
              ...e,
              features: parcelFeatures
            });
            
          } else {
            // Close any existing popup if clicking on empty space
            // BUT NOT if we're in split mode
            if (currentPopup.current && !blockToSplit) {
              console.log('Closing popup - clicked on empty space');
              currentPopup.current.remove();
              currentPopup.current = null;
            }
          }
        });
        // Also handle touch events separately for mobile
        map.current.on('touchend', (e) => {
          // Skip touch handling if we're in split mode
          if (blockToSplitRef.current || modeRef.current === 'split') {
              console.log('Touch ignored - in split mode');
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
        });

        // Add click handler for map background to close popups
        map.current.on('touchend', (e) => {
          // Only close popup if we didn't touch a block and popup exists AND we're not in split mode
          if (currentPopup.current && (!e.features || e.features.length === 0) && !blockToSplit) {
            console.log('Touch on map background, closing popup');
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

    const maxRetries = 5;
    let retryCount = 0;
    
    const tryAddLayers = () => {
      if (map.current.isStyleLoaded()) {
        console.log('Style loaded, adding layers now');
        addLayers();
      } else if (retryCount < maxRetries) {
        console.log(`Style not loaded yet, retry ${retryCount + 1}/${maxRetries}`);
        retryCount++;
        setTimeout(tryAddLayers, 200);
      } else {
        console.log('Failed to add layers after max retries');
        map.current.once('style.load', () => {
          console.log('Final attempt to add layers on style.load event');
          addLayers();
        });
      }
    };
    
    tryAddLayers();
  };

  const addParcelsToMap = (geojsonData) => {
    if (!map.current) {
      console.log('Map not available, cannot add parcels');
      return;
    }

    console.log('Adding parcels to map, style loaded:', map.current.isStyleLoaded());

    const addParcelLayers = () => {
      try {
        console.log('Adding parcel layers to map');
        
        // Remove existing parcel layers if they exist
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

        console.log('Parcel layers added successfully');
        
      } catch (error) {
        console.error('Error adding parcel layers:', error);
      }
    };

    const maxRetries = 5;
    let retryCount = 0;
    
    const tryAddParcelLayers = () => {
      if (map.current.isStyleLoaded()) {
        console.log('Style loaded, adding parcel layers now');
        addParcelLayers();
      } else if (retryCount < maxRetries) {
        console.log(`Style not loaded yet, retry ${retryCount + 1}/${maxRetries}`);
        retryCount++;
        setTimeout(tryAddParcelLayers, 200);
      } else {
          console.log('Failed to add parcel layers after max retries');
          // No nested style.load listener here. Reattachment happens in handleStyleLoad.
        }
    };
    
    tryAddParcelLayers();
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
                  {style.is3D && <span className="3d-indicator">🏔️</span>}
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
                <label style={{ marginRight: 8 }}>
                  <input
                    type="checkbox"
                    checked={showRisksLayer}
                    onChange={(e) => setShowRisksLayer(e.target.checked)}
                  /> Show Risks
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
        <div ref={mapContainer} className="map-container" />

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
          
          .3d-indicator {
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