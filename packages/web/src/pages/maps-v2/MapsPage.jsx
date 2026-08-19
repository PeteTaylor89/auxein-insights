// maps-v2/MapsPage.jsx — Page shell: sidebar + map + mode toggle
import React, { useState, useMemo, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import * as turf from '@turf/turf';
import { useAuth, blocksService, spatialAreasService, propertyService, parcelsService } from '@vineyard/shared';
import useMapbox from './hooks/useMapbox';
import useBlocksLayer from './hooks/useBlocksLayer';
import useRisksLayer from './hooks/useRisksLayer';
import useSpatialAreasLayer from './hooks/useSpatialAreasLayer';
import useParcelsLayer from './hooks/useParcelsLayer';
import useTasksLayer from './hooks/useTasksLayer';
// useGpsTracksLayer / GpsTracksPanel are intentionally not imported: GPS
// tracking is mothballed, so the layer, its panel and its legend entries are
// unreachable. Both modules are left in place for when it returns.
import useObservationsLayer from './hooks/useObservationsLayer';
import useAssetsLayer from './hooks/useAssetsLayer';
import useMapFeaturesLayer, { MAP_FEATURE_CLICK_LAYERS } from './hooks/useMapFeaturesLayer';
import useDrawingController from './hooks/useDrawingController';
import useBlockSplit from './hooks/useBlockSplit';
import useFlyoverAnimation from './hooks/useFlyoverAnimation';
import usePropertiesLayer from './hooks/usePropertiesLayer';
import FlyoverPanel from './components/flyover/FlyoverPanel';
import MapContainer from './components/MapContainer';
import MapLegend from './components/MapLegend';
import Sidebar from './components/Sidebar';
import BlocksPanel from './components/management/BlocksPanel';
import RisksPanel from './components/management/RisksPanel';
import SpatialAreasPanel from './components/management/SpatialAreasPanel';
import TasksPanel from './components/management/TasksPanel';
import ObservationsPanel from './components/management/ObservationsPanel';
import PropertiesPanel from './components/management/PropertiesPanel';
import MapBuilder from './components/builder/MapBuilder';
import useBuilderState from './hooks/useBuilderState';
import MapStyleSelector from './components/shared/MapStyleSelector';
import StatusBar from './components/shared/StatusBar';
import DrawingToolbar from './components/drawing/DrawingToolbar';
import BlockCreateForm from './components/drawing/BlockCreateForm';
import BlockEditForm from './components/drawing/BlockEditForm';
import BlockSplitFlow from './components/drawing/BlockSplitFlow';
import SpatialAreaForm from './components/drawing/SpatialAreaForm';
import MapFeatureForm from './components/drawing/MapFeatureForm';
import useMapFeatureTypes from './hooks/useMapFeatureTypes';
import PrintDialog from './components/print/PrintDialog';
import { useNavigate } from 'react-router-dom';
import {
  Eye, EyeOff, ChevronDown, ChevronRight,
  ClipboardList, AlertTriangle, Binoculars, Wrench, Layers, LandPlot, MapPin,
} from 'lucide-react';
import {
  showReactPopup,
  BlockPopupContent,
  MapFeaturePopupContent,
  RiskPopupContent,
  AssetPopupContent,
  ParcelPopupContent,
} from './components/shared/MapPopup';
import ParcelAssignmentModal from './components/drawing/ParcelAssignmentModal';
import BlockCompanyAssignModal from './components/drawing/BlockCompanyAssignModal';
import TaskDetailModal from './components/TaskDetailModal';
import BlockSummaryModal from './components/BlockSummaryModal';
import useAvailableCompanies from './hooks/useAvailableCompanies';
import { defaultLayerVisibility } from './components/managementLayerRegistry';
import { resolveAppearance } from './components/mapFeatureTypes';
import './MapsPage.css';

function resolveViewerRole(user) {
  const AUXEIN_ADMIN_EMAIL = 'pete.taylor@auxein.co.nz';
  const isAuxeinAdmin =
    !!user?.email && user.email.toLowerCase() === AUXEIN_ADMIN_EMAIL;
  return {
    scope: isAuxeinAdmin ? 'global' : 'company',
    isAuxeinAdmin,
    companyId: user?.company_id ?? user?.companyId ?? null,
  };
}

// Error boundary to catch render crashes
class MapsErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('MapsV2 Error Boundary:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, color: 'red' }}>
          <h2>Maps V2 crashed</h2>
          <pre>{this.state.error?.message}</pre>
          <pre>{this.state.error?.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function MapsPageInner() {
  const navigate = useNavigate();
  const { user, userTypeRole } = useAuth();
  const { scope, isAuxeinAdmin: isAuxeinAdminLegacy, companyId } = useMemo(
    () => resolveViewerRole(user),
    [user],
  );
  // Use userTypeRole as the reliable admin check
  const isAuxeinAdmin = userTypeRole === 'auxein_admin' || isAuxeinAdminLegacy;

  const [mode, setMode] = useState('management');
  const [status, setStatus] = useState(null);

  // Layer visibility — ONE keyed object, not six loose booleans, so the set can
  // be enumerated (print tick-list, legend, saved views). Defaults come from the
  // registry so "what layers exist" is stated in exactly one place.
  const [layerVisibility, setLayerVisibility] = useState(defaultLayerVisibility);

  const toggleLayer = useCallback((id) => {
    setLayerVisibility((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);
  const setLayerVisible = useCallback((id, value) => {
    setLayerVisibility((prev) => ({ ...prev, [id]: value }));
  }, []);

  // Read-side aliases. The sidebar reads these ~40 times; naming them here keeps
  // those call sites untouched while the state itself is now enumerable.
  const {
    risks: showRisks,
    spatialAreas: showSpatialAreas,
    parcels: showParcels,
    tasks: showTasks,
    observations: showObservations,
    assets: showAssets,
    mapFeatures: showMapFeatures,
  } = layerVisibility;

  // Panel collapse state (for sidebar cleanliness)
  const [collapsed, setCollapsed] = useState({
    blocks: true,
    risks: true,
    spatialAreas: true,
    parcels: true,
    tasks: true,
    observations: true,
    assets: true,
    mapFeatures: true,
  });
  const toggleCollapse = (key) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));

  // Properties state (admin only)
  const [properties, setProperties] = useState([]);

  const isAdmin = isAuxeinAdmin || userTypeRole === 'company_admin';
  // Managing the POI vocabulary is manager+, matching the API's
  // map_feature_types permission module. A company_user still SEES every type;
  // they just cannot add one.
  const canManageTypes = isAdmin || userTypeRole === 'company_manager';

  // The POI vocabulary — the form's picker, and (Phase 4) the map layer's icon
  // and colour expressions. `include_inactive` is off here: retired types still
  // draw via the slug fallback, they just should not be offered.
  const featureTypes = useMapFeatureTypes();

  // Fetch properties for admin users
  const fetchProperties = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const data = await propertyService.listProperties({ limit: 500 });
      setProperties(data);
    } catch (err) {
      console.error('Failed to load properties:', err);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  // Drawing state
  const [drawMode, setDrawMode] = useState('idle'); // idle | draw_polygon | draw_spatial | split | edit | draw_property | edit_property_geometry
  // The currently-open Mapbox feature popup, so action buttons inside it (Edit,
  // Split) can dismiss it before opening the side panel / entering a draw mode.
  const activePopupRef = useRef(null);
  const [drawGeometry, setDrawGeometry] = useState(null);
  const [drawArea, setDrawArea] = useState(0);
  const [drawCentroid, setDrawCentroid] = useState(null);

  // Property boundary draw/edit state
  const [activePropertyForBoundary, setActivePropertyForBoundary] = useState(null);
  const [propertyDrawGeometry, setPropertyDrawGeometry] = useState(null);
  const propertyEditFeatureIdRef = useRef(null);

  // Form state
  const [showBlockCreate, setShowBlockCreate] = useState(false);
  const [showSpatialCreate, setShowSpatialCreate] = useState(false);
  const [showFeatureForm, setShowFeatureForm] = useState(false);
  const [editFeatureRecord, setEditFeatureRecord] = useState(null);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [showBlockEdit, setShowBlockEdit] = useState(false);
  const [editBlockData, setEditBlockData] = useState(null);
  const [isEditingGeometry, setIsEditingGeometry] = useState(false);
  const editFeatureIdRef = useRef(null);
  const [showSpatialEdit, setShowSpatialEdit] = useState(false);
  const [editSpatialData, setEditSpatialData] = useState(null);

  // Parcel assignment modal (auxein admin)
  const [showParcelAssign, setShowParcelAssign] = useState(false);
  const [selectedParcelForAssign, setSelectedParcelForAssign] = useState(null);

  // Block company assignment modal (auxein admin)
  const [showBlockCompanyAssign, setShowBlockCompanyAssign] = useState(false);
  const [selectedBlockForAssign, setSelectedBlockForAssign] = useState(null);

  // Unified task detail modal — opened from task symbol or GPS track click.
  // taskDetail.tasks is set for block-symbol clicks (N tasks for that block);
  // taskDetail.taskId is set for direct GPS track clicks.
  const [taskDetail, setTaskDetail] = useState({ open: false, taskId: null, tasks: null });
  const closeTaskDetail = useCallback(() => {
    setTaskDetail({ open: false, taskId: null, tasks: null });
  }, []);

  // Block summary — opened from a task or observation symbol, or the block popup.
  // Answers "what's on this block" without leaving the map (beta feedback).
  const [blockSummary, setBlockSummary] = useState({ open: false, blockId: null, blockName: null });
  const closeBlockSummary = useCallback(() => {
    setBlockSummary({ open: false, blockId: null, blockName: null });
  }, []);

  // Map instance
  const { map, mapRef, mapReady, activeStyle, is3D, setStyle, containerRef } =
    useMapbox();

  // Fullscreen the map page: hide site footer + lock body scroll while mounted.
  // Restored on unmount so other pages keep their normal layout.
  // useLayoutEffect, not useEffect: .v2-maps-page draws its height from the
  // pinned shell these rules create, so applying the class after the first
  // paint would flash a zero-height map.
  useLayoutEffect(() => {
    document.body.classList.add('maps-fullscreen');
    return () => {
      document.body.classList.remove('maps-fullscreen');
    };
  }, []);

  // Keep Mapbox sized to its container — sidebar collapse animates width over
  // 200ms, so a ResizeObserver on the container fires continuously through
  // the transition and avoids the canvas-stuck-at-old-width white-strip bug.
  useEffect(() => {
    if (!map || !containerRef?.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      try { map.resize(); } catch (_) { /* map disposed */ }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [map, containerRef]);

  // Drawing controller (MapboxDraw lifecycle)
  const drawing = useDrawingController(map, mapReady);

  // Builder state (persisted to localStorage)
  const builderState = useBuilderState(companyId);

  // Flyover animation (admin only)
  const flyover = useFlyoverAnimation(map, mapReady);

  // --- Layers ---
  // Blocks (always on)
  const { blocksData, blockCount, loading, error, refresh, flyToBlock } =
    useBlocksLayer(map, mapReady, companyId, isAuxeinAdmin);

  // Risks
  const { riskCount, loading: risksLoading, error: risksError } =
    useRisksLayer(map, mapReady, showRisks);

  // Spatial areas
  const { spatialData, areaCount, loading: areasLoading, error: areasError } =
    useSpatialAreasLayer(map, mapReady, showSpatialAreas);

  // Fly to a spatial-area feature using its bbox.
  const flyToSpatialArea = useCallback((feature) => {
    if (!map || !feature?.geometry) return;
    try {
      const bbox = turf.bbox(feature);
      map.fitBounds(bbox, { padding: 60, maxZoom: 17, duration: 1000 });
    } catch (err) {
      console.warn('flyToSpatialArea failed:', err);
    }
  }, [map]);

  // Parcels (admin only)
  const { parcelCount, loading: parcelsLoading, error: parcelsError, refresh: refreshParcels } =
    useParcelsLayer(map, mapReady, showParcels, isAdmin, isAuxeinAdmin, companyId);

  // Companies list (auxein admin only — for assignment dropdowns)
  const { companies: availableCompanies, loading: companiesLoading } = useAvailableCompanies(isAuxeinAdmin);

  // Tasks. The hook still exposes activeTrackId/showTrack/hideTrack for a
  // single task's GPS track — unused while GPS tracking is mothballed.
  const {
    tasks, taskCount, loading: tasksLoading, error: tasksError,
  } = useTasksLayer(map, mapReady, showTasks, blocksData);

  // Observations
  const { observations, obsCount, loading: obsLoading, error: obsError } =
    useObservationsLayer(map, mapReady, showObservations, blocksData);

  // Assets
  const { assetsData, assetCount, loading: assetsLoading, error: assetsError } =
    useAssetsLayer(map, mapReady, showAssets);

  // Points of interest
  const {
    mapFeaturesData, featureCount,
    loading: featuresLoading, error: featuresError,
    refresh: refreshMapFeatures,
  } = useMapFeaturesLayer(map, mapReady, showMapFeatures, featureTypes);

  // Property boundaries — admin-only subtle dashed-outline layer.
  // Refresh trigger is the `properties` array, which already reloads on demand.
  usePropertiesLayer(map, mapReady, properties, isAdmin);

  // Block split state machine
  const {
    isSplitting, isProcessing, isConfirming, isDrawingLine, isSelecting,
    splitBlock: splitBlockFeature, splitError, statusMessage: splitMessage,
    startSplit, selectBlock, lineDrawn, confirmSplit, cancel: cancelSplit,
  } = useBlockSplit(() => {
    // on success: refresh blocks, clear drawing
    drawing.freeze();
    drawing.clearDraft();
    refresh();
  });

  // --- Drawing callbacks ---
  const handleDrawBlock = useCallback(() => {
    setDrawMode('draw_polygon');
    drawing.freeze();
    drawing.clearDraft();
    drawing.startDrawPolygon();
    setStatus('Click on the map to draw a block polygon. Double-click to finish.');
  }, [drawing]);

  const handleDrawSpatial = useCallback(() => {
    setDrawMode('draw_spatial');
    drawing.freeze();
    drawing.clearDraft();
    drawing.startDrawPolygon();
    setStatus('Click on the map to draw a spatial area. Double-click to finish.');
  }, [drawing]);

  // Points of interest. Only the point tool is exposed on the toolbar — lines
  // and polygons are supported end to end (one generic geometry column, and the
  // layer renders all three), but a single "Add POI" button is the ask. Adding
  // a line/area tool later is another button and another draw mode, no schema,
  // no API and no layer change.
  const handleDrawFeature = useCallback(() => {
    setDrawMode('draw_poi');
    drawing.freeze();
    drawing.clearDraft();
    drawing.startDrawPoint();
    setStatus('Click on the map to place a point of interest.');
  }, [drawing]);

  const handleStartSplit = useCallback(() => {
    setDrawMode('split');
    drawing.freeze();
    drawing.clearDraft();
    startSplit();
  }, [drawing, startSplit]);

  // Split started straight from a block's popup — the block is already chosen,
  // so skip the "click a block to split" step and go right to drawing the line.
  const handleSplitBlockFromPopup = useCallback((feature) => {
    activePopupRef.current?.remove();
    if (!feature) return;
    setDrawMode('split');
    drawing.freeze();
    drawing.clearDraft();
    startSplit();          // → selecting
    selectBlock(feature);  // → drawing_line (pre-selected)
    drawing.startDrawLine();
  }, [drawing, startSplit, selectBlock]);

  const handleCancelDraw = useCallback(() => {
    setDrawMode('idle');
    drawing.freeze();
    drawing.clearDraft();
    setDrawGeometry(null);
    setDrawArea(0);
    setDrawCentroid(null);
    setShowBlockCreate(false);
    setShowSpatialCreate(false);
    setShowFeatureForm(false);
    setEditFeatureRecord(null);
    setStatus(null);
    setActivePropertyForBoundary(null);
    setPropertyDrawGeometry(null);
    propertyEditFeatureIdRef.current = null;
    if (isSplitting) cancelSplit();
  }, [drawing, isSplitting, cancelSplit]);

  // ── Property boundary draw/edit ─────────────────────────────────────────
  const handleDrawPropertyBoundary = useCallback((prop) => {
    if (!prop) return;
    setActivePropertyForBoundary(prop);
    setPropertyDrawGeometry(null);
    setDrawMode('draw_property');
    drawing.freeze();
    drawing.clearDraft();
    drawing.startDrawPolygon();
    setStatus(`Click on the map to draw the boundary of ${prop.name}. Double-click to finish.`);
  }, [drawing]);

  const handleEditPropertyBoundary = useCallback((prop) => {
    if (!prop || !prop.geometry || !drawing.isDrawActive) return;

    const editId = `edit-property-${prop.id}`;
    const editFeature = {
      id: editId,
      type: 'Feature',
      properties: { source: 'property-edit', property_id: prop.id },
      geometry: prop.geometry,
    };

    setActivePropertyForBoundary(prop);
    setPropertyDrawGeometry(prop.geometry);  // pre-populate so Save is enabled
    drawing.freeze();
    drawing.addFeature(editFeature);
    drawing.startDirectSelect(editId);
    propertyEditFeatureIdRef.current = editId;
    setDrawMode('edit_property_geometry');
    setStatus(`Drag vertices to reshape the boundary of ${prop.name}. Click Save when done.`);
  }, [drawing]);

  const handleSavePropertyBoundary = useCallback(async () => {
    if (!activePropertyForBoundary) return;

    // In edit mode, pull the latest from MapboxDraw; in draw mode, use the
    // captured geometry from the draw.create handler.
    let geometryToSave = propertyDrawGeometry;
    if (drawMode === 'edit_property_geometry' && propertyEditFeatureIdRef.current) {
      const edited = drawing.getFeature(propertyEditFeatureIdRef.current);
      if (edited?.geometry) geometryToSave = edited.geometry;
    }

    if (!geometryToSave) {
      setStatus('Draw a polygon first.');
      return;
    }
    if (geometryToSave.type !== 'Polygon' && geometryToSave.type !== 'MultiPolygon') {
      setStatus(`Boundary must be a Polygon (got ${geometryToSave.type}).`);
      return;
    }

    try {
      await propertyService.updatePropertyGeometry(activePropertyForBoundary.id, geometryToSave);
      setStatus(`Boundary saved for ${activePropertyForBoundary.name}.`);
      // Reset draw state; refresh the panel so the new geometry shows on the map.
      drawing.freeze();
      drawing.clearDraft();
      setDrawMode('idle');
      setActivePropertyForBoundary(null);
      setPropertyDrawGeometry(null);
      propertyEditFeatureIdRef.current = null;
      await fetchProperties();
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      console.error('Failed to save property boundary:', err);
      setStatus(`Error: ${err.response?.data?.detail || err.message || 'Failed to save'}`);
    }
  }, [activePropertyForBoundary, propertyDrawGeometry, drawMode, drawing, fetchProperties]);

  // Listen for draw.create events
  useEffect(() => {
    if (!map || !drawing.isDrawActive) return;

    const handleCreate = (e) => {
      if (!e.features?.length) return;
      const feature = e.features[0];
      const geom = feature.geometry;

      if (drawMode === 'split' && geom.type === 'LineString') {
        // Split: line drawn
        lineDrawn(feature);
        drawing.freeze();
        return;
      }

      if ((drawMode === 'draw_polygon' || drawMode === 'draw_spatial') && geom.type === 'Polygon') {
        // Calculate area + centroid
        const areaM2 = turf.area(geom);
        const areaHa = areaM2 / 10000;
        const centroidPt = turf.centroid({ type: 'Feature', geometry: geom, properties: {} });
        const centroidCoords = centroidPt.geometry.coordinates;

        setDrawGeometry(geom);
        setDrawArea(areaHa);
        setDrawCentroid(centroidCoords);

        // Freeze draw, show static preview
        drawing.freeze();
        drawing.showDraft(geom);

        if (drawMode === 'draw_polygon') {
          setShowBlockCreate(true);
          setStatus(null);
        } else if (drawMode === 'draw_spatial') {
          setShowSpatialCreate(true);
          setStatus(null);
        }
      }

      // POIs accept all three geometry types. `showDraft` only knows how to
      // paint fill+line, which a Point has no fill for — so the preview is
      // skipped for points and the Draw feature itself stays visible instead
      // (that is what the gl-draw-point-* styles are for).
      if (drawMode === 'draw_poi') {
        setDrawGeometry(geom);
        if (geom.type === 'Point') {
          drawing.resetMode();
        } else {
          drawing.freeze();
          drawing.showDraft(geom);
        }
        setEditFeatureRecord(null);
        setShowFeatureForm(true);
        setStatus(null);
        return;
      }

      if (drawMode === 'draw_property' && geom.type === 'Polygon') {
        // Capture geometry, show static preview, keep the toolbar in draw_property
        // mode so the Save button stays available.
        setPropertyDrawGeometry(geom);
        drawing.freeze();
        drawing.showDraft(geom);
        setStatus('Click Save to commit the boundary, or Cancel to discard.');
      }
    };

    const cleanup = drawing.onDrawCreate(handleCreate);
    return cleanup;
  }, [map, drawing, drawMode, lineDrawn]);

  // Split mode: block selection click handler
  useEffect(() => {
    if (!map || !mapReady || !isSelecting) return;

    const handleSplitSelect = (e) => {
      if (!map.getLayer('v2-blocks-fill')) return;
      const features = map.queryRenderedFeatures(e.point, { layers: ['v2-blocks-fill'] });
      if (!features?.length) return;

      selectBlock(features[0]);
      drawing.startDrawLine();
    };

    // Touch tap bridge — MapboxDraw suppresses tap->click on tablets (see the
    // main interaction effect for the full rationale). Detect a genuine tap and
    // run the same selection logic; never preventDefault so Draw is unaffected.
    const TAP_MOVE_PX = 10;
    const TAP_MAX_MS = 500;
    let tapStart = null;
    let lastTapHandledAt = 0;

    const onTouchStart = (e) => {
      tapStart = (e.points && e.points.length === 1)
        ? { x: e.point.x, y: e.point.y, t: Date.now() }
        : null;
    };
    const onTouchEnd = (e) => {
      if (!tapStart) return;
      const moved = Math.hypot(e.point.x - tapStart.x, e.point.y - tapStart.y);
      const elapsed = Date.now() - tapStart.t;
      tapStart = null;
      if (moved <= TAP_MOVE_PX && elapsed <= TAP_MAX_MS) {
        lastTapHandledAt = Date.now();
        handleSplitSelect(e);
      }
    };
    const onTouchCancel = () => { tapStart = null; };
    const onClick = (e) => {
      if (Date.now() - lastTapHandledAt < 700) return;
      handleSplitSelect(e);
    };

    map.on('click', onClick);
    map.on('touchstart', onTouchStart);
    map.on('touchend', onTouchEnd);
    map.on('touchcancel', onTouchCancel);
    return () => {
      map.off('click', onClick);
      map.off('touchstart', onTouchStart);
      map.off('touchend', onTouchEnd);
      map.off('touchcancel', onTouchCancel);
    };
  }, [map, mapReady, isSelecting, selectBlock, drawing]);

  // When a split finishes (success or the hook's internal cancel), the split
  // state returns to idle — bring drawMode back too so the toolbar + line
  // dimming reset (previously the toolbar stayed stuck in "Split Mode").
  useEffect(() => {
    if (!isSplitting && drawMode === 'split') {
      setDrawMode('idle');
      drawing.freeze();
    }
  }, [isSplitting, drawMode, drawing]);

  // Dim existing block / area / parcel outlines + fills while drawing or
  // splitting, so the active draw geometry reads clearly against them. Block
  // vertex editing ('edit') is excluded: there we KEEP the original outline
  // solid white and draw the edited shape as a white dotted line on top, so the
  // two read in direct contrast (see DRAW_STYLES in useDrawingController).
  const dimRestoreRef = useRef(null);
  useEffect(() => {
    if (!map) return;
    const DIM = [
      ['v2-blocks-fill', 'fill-opacity', 0.04],
      ['v2-blocks-outline', 'line-opacity', 0.22],
      ['v2-spatial-fill', 'fill-opacity', 0.04],
      ['v2-spatial-outline', 'line-opacity', 0.22],
      ['v2-parcels-fill', 'fill-opacity', 0.03],
      ['v2-parcels-outline', 'line-opacity', 0.22],
    ];
    const shouldDim = drawMode !== 'idle' && drawMode !== 'edit';
    if (shouldDim) {
      // Capture originals once, then apply the dimmed values.
      if (!dimRestoreRef.current) {
        const saved = [];
        for (const [id, prop] of DIM) {
          if (map.getLayer(id)) {
            let orig;
            try { orig = map.getPaintProperty(id, prop); } catch { orig = undefined; }
            saved.push([id, prop, orig]);
          }
        }
        dimRestoreRef.current = saved;
      }
      for (const [id, prop, dim] of DIM) {
        if (map.getLayer(id)) { try { map.setPaintProperty(id, prop, dim); } catch { /* layer gone */ } }
      }
    } else if (dimRestoreRef.current) {
      for (const [id, prop, orig] of dimRestoreRef.current) {
        if (map.getLayer(id)) { try { map.setPaintProperty(id, prop, orig); } catch { /* layer gone */ } }
      }
      dimRestoreRef.current = null;
    }
  }, [map, drawMode]);

  // --- Block edit handlers ---
  const handleOpenBlockEdit = useCallback(async (blockId) => {
    try {
      const data = await blocksService.getBlockById(blockId);
      setEditBlockData(data);
      setShowBlockEdit(true);
    } catch (err) {
      console.error('Failed to load block for editing:', err);
    }
  }, []);

  const handleStartGeometryEdit = useCallback(() => {
    if (!editBlockData || !drawing.isDrawActive || !blocksData) return;

    // Find the block feature in GeoJSON
    const feature = blocksData.features?.find(
      (f) => f.properties?.id === editBlockData.id
    );
    if (!feature) return;

    const editId = `edit-block-${editBlockData.id}`;
    const editFeature = {
      id: editId,
      type: 'Feature',
      properties: { source: 'block-edit', block_id: editBlockData.id },
      geometry: feature.geometry,
    };

    drawing.freeze();
    drawing.addFeature(editFeature);
    drawing.startDirectSelect(editId);
    editFeatureIdRef.current = editId;
    setIsEditingGeometry(true);
    setDrawMode('edit');
  }, [editBlockData, drawing, blocksData]);

  const handleSaveGeometry = useCallback(async () => {
    if (!editFeatureIdRef.current || !editBlockData) return;

    const edited = drawing.getFeature(editFeatureIdRef.current);
    if (!edited || edited.geometry.type !== 'Polygon') {
      setStatus('Invalid geometry');
      return;
    }

    try {
      blocksService.validateBlockGeometry(edited.geometry);
      await blocksService.updateBlockGeometry(editBlockData.id, edited.geometry);
      drawing.freeze();
      setIsEditingGeometry(false);
      editFeatureIdRef.current = null;
      setDrawMode('idle');
      refresh();
    } catch (err) {
      console.error('Geometry update failed:', err);
      setStatus(`Error: ${err.message}`);
    }
  }, [editBlockData, drawing, refresh]);

  const handleCancelGeometryEdit = useCallback(() => {
    drawing.freeze();
    setIsEditingGeometry(false);
    editFeatureIdRef.current = null;
    setDrawMode('idle');
  }, [drawing]);

  const handleBlockEditSubmit = useCallback(() => {
    setShowBlockEdit(false);
    setEditBlockData(null);
    setDrawMode('idle');
    refresh();
    fetchProperties();
  }, [refresh, fetchProperties]);

  const handleBlockDelete = useCallback(async (blockId) => {
    try {
      await blocksService.deleteBlock(blockId);
      setShowBlockEdit(false);
      setEditBlockData(null);
      refresh();
      fetchProperties();
    } catch (err) {
      console.error('Block delete failed:', err);
    }
  }, [refresh, fetchProperties]);

  // --- Spatial area edit handlers ---
  const handleOpenSpatialEdit = useCallback(async (areaId) => {
    try {
      const data = await spatialAreasService.getSpatialAreaById(areaId);
      setEditSpatialData(data);
      setShowSpatialEdit(true);
    } catch (err) {
      console.error('Failed to load spatial area for editing:', err);
    }
  }, []);

  const handleSpatialEditSubmit = useCallback(() => {
    setShowSpatialEdit(false);
    setEditSpatialData(null);
    // Refresh spatial areas by toggling visibility (simple approach)
    setLayerVisible('spatialAreas', false);
    setTimeout(() => setLayerVisible('spatialAreas', true), 100);
  }, []);

  // Block creation success
  const handleBlockCreateSuccess = useCallback(() => {
    setShowBlockCreate(false);
    setDrawGeometry(null);
    setDrawArea(0);
    setDrawCentroid(null);
    setDrawMode('idle');
    drawing.clearDraft();
    refresh();
    fetchProperties();
  }, [drawing, refresh, fetchProperties]);

  // Spatial area creation success
  const handleSpatialCreateSuccess = useCallback(() => {
    setShowSpatialCreate(false);
    setDrawGeometry(null);
    setDrawArea(0);
    setDrawCentroid(null);
    setDrawMode('idle');
    drawing.clearDraft();
    setLayerVisible('spatialAreas', false);
    setTimeout(() => setLayerVisible('spatialAreas', true), 100);
  }, [drawing, setLayerVisible]);

  // POI saved / updated / deleted. Unlike spatial areas above, this refetches
  // the layer's own data rather than flicking visibility off and on — the hook
  // exposes refresh(), so there is no need for the 100ms remount trick.
  const handleFeatureSaved = useCallback(() => {
    setShowFeatureForm(false);
    setEditFeatureRecord(null);
    setDrawGeometry(null);
    setDrawMode('idle');
    drawing.freeze();
    drawing.clearDraft();
    setLayerVisible('mapFeatures', true);
    refreshMapFeatures();
  }, [drawing, setLayerVisible, refreshMapFeatures]);

  // Click a POI on the map to edit it. The GeoJSON properties carry everything
  // the form needs, so no extra GET is required.
  const handleEditFeature = useCallback((props) => {
    if (!props?.id) return;
    setEditFeatureRecord({
      id: props.id,
      name: props.name,
      description: props.description,
      feature_type: props.feature_type,
      property_id: props.property_id ?? null,
      is_active: true,
    });
    setDrawGeometry(null);
    setShowFeatureForm(true);
  }, []);

  // ---- Parcel assignment handlers (auxein admin) ----
  const handleOpenParcelAssign = useCallback((parcelProps) => {
    setSelectedParcelForAssign(parcelProps);
    setShowParcelAssign(true);
  }, []);

  const handleParcelAssignSuccess = useCallback(() => {
    setShowParcelAssign(false);
    setSelectedParcelForAssign(null);
    if (refreshParcels) refreshParcels();
  }, [refreshParcels]);

  const handleRemoveParcelAssignment = useCallback(async (parcelId, companyIdToRemove) => {
    if (!parcelId || !companyIdToRemove) return;
    if (!window.confirm('Remove this parcel assignment? This cannot be undone.')) return;
    try {
      await parcelsService.removeParcelAssignment(parcelId, companyIdToRemove);
      if (refreshParcels) refreshParcels();
    } catch (err) {
      console.error('Remove parcel assignment failed:', err);
      alert(err?.response?.data?.detail || err.message || 'Failed to remove assignment');
    }
  }, [refreshParcels]);

  // ---- Block company assignment handlers (auxein admin) ----
  const handleOpenBlockCompanyAssign = useCallback(async (blockId) => {
    try {
      const data = await blocksService.getBlockById(blockId);
      setSelectedBlockForAssign(data);
      setShowBlockCompanyAssign(true);
    } catch (err) {
      console.error('Failed to load block for assignment:', err);
      alert('Failed to load block details');
    }
  }, []);

  const handleBlockAssignSuccess = useCallback(() => {
    setShowBlockCompanyAssign(false);
    setSelectedBlockForAssign(null);
    refresh();  // refresh blocks layer
  }, [refresh]);

  // Click handler using refs to avoid stale closures.
  // Uses map.on('click', layerId, ...) which fires BEFORE MapboxDraw's generic handler.
  // Re-attaches whenever layers are added via a polling interval.
  const drawModeRef = useRef(drawMode);
  drawModeRef.current = drawMode;
  const flyToBlockRef = useRef(flyToBlock);
  flyToBlockRef.current = flyToBlock;
  const handleOpenBlockEditRef = useRef(handleOpenBlockEdit);
  handleOpenBlockEditRef.current = handleOpenBlockEdit;
  const handleSplitBlockFromPopupRef = useRef(handleSplitBlockFromPopup);
  handleSplitBlockFromPopupRef.current = handleSplitBlockFromPopup;
  const handleOpenSpatialEditRef = useRef(handleOpenSpatialEdit);
  handleOpenSpatialEditRef.current = handleOpenSpatialEdit;
  const handleEditFeatureRef = useRef(handleEditFeature);
  handleEditFeatureRef.current = handleEditFeature;
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  // The click handler's effect depends only on [map, mapReady], so a value
  // captured directly never updates. A type created during this session would
  // otherwise be missing from the popup's lookup until a reload.
  const featureTypesRef = useRef(featureTypes.typeBySlug);
  featureTypesRef.current = featureTypes.typeBySlug;
  const isAuxeinAdminRef = useRef(isAuxeinAdmin);
  isAuxeinAdminRef.current = isAuxeinAdmin;
  const handleOpenParcelAssignRef = useRef(handleOpenParcelAssign);
  handleOpenParcelAssignRef.current = handleOpenParcelAssign;
  const handleRemoveParcelAssignmentRef = useRef(handleRemoveParcelAssignment);
  handleRemoveParcelAssignmentRef.current = handleRemoveParcelAssignment;
  const handleOpenBlockCompanyAssignRef = useRef(handleOpenBlockCompanyAssign);
  handleOpenBlockCompanyAssignRef.current = handleOpenBlockCompanyAssign;
  const setTaskDetailRef = useRef(setTaskDetail);
  setTaskDetailRef.current = setTaskDetail;
  const setBlockSummaryRef = useRef(setBlockSummary);
  setBlockSummaryRef.current = setBlockSummary;

  useEffect(() => {
    if (!map || !mapReady) return;

    // Priority order: first = highest priority. Point layers beat fill layers.
    const INTERACTIVE_LAYERS = [
      'v2-map-features-points',
      'v2-assets-points', 'v2-risks-circles', 'v2-observations-symbol',
      'v2-tasks-symbol', 'v2-assets-lines', 'v2-map-features-lines',
      'v2-map-features-fill',
      'v2-spatial-fill', 'v2-parcels-fill', 'v2-blocks-fill',
    ];

    const handleClick = (e) => {
      if (drawModeRef.current !== 'idle') return;

      // Query only layers that exist on the map right now
      const existingLayers = INTERACTIVE_LAYERS.filter((id) => map.getLayer(id));
      if (existingLayers.length === 0) return;

      // queryRenderedFeatures with a small buffer for easier clicking on icons
      const bbox = [
        [e.point.x - 8, e.point.y - 8],
        [e.point.x + 8, e.point.y + 8],
      ];
      const allFeatures = map.queryRenderedFeatures(bbox, { layers: existingLayers });
      if (!allFeatures?.length) return;

      // Pick highest-priority feature (lowest index in INTERACTIVE_LAYERS)
      let topFeature = null;
      let topPriority = Infinity;
      for (const f of allFeatures) {
        const idx = INTERACTIVE_LAYERS.indexOf(f.layer?.id);
        if (idx !== -1 && idx < topPriority) {
          topPriority = idx;
          topFeature = f;
        }
      }
      if (!topFeature) return;

      const layerId = topFeature.layer.id;
      const p = topFeature.properties || {};
      const nav = navigateRef.current;
      const lngLat = [e.lngLat.lng, e.lngLat.lat];

      if (MAP_FEATURE_CLICK_LAYERS.includes(layerId)) {
        showReactPopup(map, { lngLat, content: (
          <MapFeaturePopupContent
            properties={p}
            typeBySlug={featureTypesRef.current}
            onEdit={(props) => handleEditFeatureRef.current(props)}
          />
        ) });
      } else if (layerId === 'v2-assets-points' || layerId === 'v2-assets-lines') {
        showReactPopup(map, { lngLat, content: <AssetPopupContent properties={p} onNavigate={() => { const t = p.asset_type === 'consumable' ? 'consumables' : 'equipment'; nav(`/assets/${t}/${p.id}/edit`); }} /> });
      } else if (layerId === 'v2-risks-circles') {
        showReactPopup(map, { lngLat, content: <RiskPopupContent properties={p} onNavigate={() => nav('/riskdashboard')} /> });
      } else if (layerId === 'v2-observations-symbol' || layerId === 'v2-tasks-symbol') {
        // Both symbols sit at a block centroid and stand for "there is activity on
        // this block", so both open the same block summary — tasks and
        // observations together, in place. Previously the observation symbol
        // navigated away to the general /observations page and the task symbol
        // opened a bare task list; the beta asked for one block-scoped view.
        const blockId = p.block_id != null ? Number(p.block_id) : null;
        if (!blockId) return;
        setBlockSummaryRef.current({
          open: true,
          blockId,
          blockName: p.block_name || null,
        });
      } else if (layerId === 'v2-spatial-fill') {
        showReactPopup(map, { lngLat, content: (
          <div className="v2-popup">
            <div className="v2-popup-header"><div className="v2-popup-badge v2-popup-badge--owned">Spatial Area</div></div>
            <h3 className="v2-popup-title">{p.name || 'Unnamed Area'}</h3>
            {p.area_type && <div className="v2-popup-grid"><div className="v2-popup-row"><span className="v2-popup-label">Type</span><span className="v2-popup-value">{p.area_type}</span></div></div>}
            <div className="v2-popup-footer">{p.id && <button className="v2-popup-btn v2-popup-btn--accent" onClick={() => handleOpenSpatialEditRef.current(Number(p.id))}>Edit Area</button>}</div>
          </div>
        ) });
      } else if (layerId === 'v2-parcels-fill') {
        showReactPopup(map, { lngLat, content: (
          <ParcelPopupContent
            properties={p}
            isAuxeinAdmin={isAuxeinAdminRef.current}
            onAssign={(props) => handleOpenParcelAssignRef.current(props)}
            onRemove={(pid, cid) => handleRemoveParcelAssignmentRef.current(pid, cid)}
          />
        ) });
      } else if (layerId === 'v2-blocks-fill') {
        activePopupRef.current = showReactPopup(map, { lngLat, content: (
          <BlockPopupContent
            feature={topFeature}
            onFlyTo={flyToBlockRef.current}
            onEdit={(id) => { activePopupRef.current?.remove(); handleOpenBlockEditRef.current(id); }}
            onSummary={(id, name) => {
              activePopupRef.current?.remove();
              setBlockSummaryRef.current({ open: true, blockId: id, blockName: name || null });
            }}
            onSplit={(feature) => handleSplitBlockFromPopupRef.current(feature)}
            isAuxeinAdmin={isAuxeinAdminRef.current}
            onAssignCompany={handleOpenBlockCompanyAssignRef.current}
          />
        ) });
      }
    };

    const onMouseMove = (e) => {
      const existingLayers = INTERACTIVE_LAYERS.filter((id) => map.getLayer(id));
      if (existingLayers.length === 0) return;
      const features = map.queryRenderedFeatures(e.point, { layers: existingLayers });
      map.getCanvas().style.cursor = features?.length ? 'pointer' : '';
    };

    // --- Touch tap support (tablets) -------------------------------------
    // MapboxDraw is always attached to the map (see useDrawingController). On
    // touch devices its event handling suppresses Mapbox's tap->click
    // synthesis, so the `click` listener never fires on a tablet tap (works
    // fine with a mouse). Bridge it: detect a genuine tap via touchstart/
    // touchend and run the same selection logic. We never call preventDefault,
    // so Draw's own drawing gestures are unaffected. A timestamp guard
    // suppresses the duplicate synthesized click on hybrid touch+mouse devices.
    const TAP_MOVE_PX = 10;   // matches map clickTolerance
    const TAP_MAX_MS = 500;
    let tapStart = null;
    let lastTapHandledAt = 0;

    const onTouchStart = (e) => {
      tapStart = (e.points && e.points.length === 1)
        ? { x: e.point.x, y: e.point.y, t: Date.now() }
        : null; // ignore multi-touch (pinch / rotate)
    };
    const onTouchEnd = (e) => {
      if (!tapStart) return;
      const moved = Math.hypot(e.point.x - tapStart.x, e.point.y - tapStart.y);
      const elapsed = Date.now() - tapStart.t;
      tapStart = null;
      if (moved <= TAP_MOVE_PX && elapsed <= TAP_MAX_MS) {
        lastTapHandledAt = Date.now();
        handleClick(e); // MapTouchEvent carries point + lngLat
      }
    };
    const onTouchCancel = () => { tapStart = null; };
    const onClick = (e) => {
      // skip the synthesized click that follows a tap we already handled
      if (Date.now() - lastTapHandledAt < 700) return;
      handleClick(e);
    };

    map.on('click', onClick);
    map.on('touchstart', onTouchStart);
    map.on('touchend', onTouchEnd);
    map.on('touchcancel', onTouchCancel);
    map.on('mousemove', onMouseMove);

    return () => {
      map.off('click', onClick);
      map.off('touchstart', onTouchStart);
      map.off('touchend', onTouchEnd);
      map.off('touchcancel', onTouchCancel);
      map.off('mousemove', onMouseMove);
    };
  }, [map, mapReady]);

  return (
    <div className="v2-maps-page">
      <Sidebar mode={mode} onModeChange={setMode}>
        {mode === 'management' ? (
          <>
            {/* Properties first */}
            {isAdmin && properties.length > 0 && (
              <PropertiesPanel
                properties={properties}
                blocksData={blocksData}
                onFlyTo={(prop) => {
                  if (!map || !prop) return;
                  // Prefer the property's boundary bbox when drawn — gives a
                  // tight, accurate view regardless of property size. Falls back
                  // to averaged block centroids when no boundary exists yet.
                  if (prop.geometry) {
                    try {
                      const [minLng, minLat, maxLng, maxLat] = turf.bbox(prop.geometry);
                      map.fitBounds(
                        [[minLng, minLat], [maxLng, maxLat]],
                        { padding: 60, duration: 1500, maxZoom: 17 },
                      );
                      return;
                    } catch (err) {
                      console.warn('Failed to compute property bbox, falling back:', err);
                    }
                  }
                  // Fallback: centroid of associated blocks
                  const blocks = (blocksData?.features || []).filter(
                    (f) => f.properties?.property_id === prop.id,
                  );
                  let totalLng = 0, totalLat = 0, count = 0;
                  for (const f of blocks) {
                    const lng = f.properties?.centroid_longitude;
                    const lat = f.properties?.centroid_latitude;
                    if (lng && lat) { totalLng += lng; totalLat += lat; count++; }
                  }
                  if (count > 0) {
                    map.flyTo({
                      center: [totalLng / count, totalLat / count],
                      zoom: 14,
                      duration: 1500,
                    });
                  }
                }}
                onDrawBoundary={handleDrawPropertyBoundary}
                onEditBoundary={handleEditPropertyBoundary}
              />
            )}

            {/* Blocks — collapsible */}
            <div className="v2-panel">
              <div className="v2-panel-header" onClick={() => toggleCollapse('blocks')} style={{ cursor: 'pointer' }}>
                <h3 className="v2-panel-title">
                  {collapsed.blocks ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  Blocks
                  <span className="v2-panel-count">{blockCount}</span>
                </h3>
              </div>
              {!collapsed.blocks && (
                <BlocksPanel
                  blocksData={blocksData}
                  blockCount={blockCount}
                  loading={loading}
                  error={error}
                  flyToBlock={flyToBlock}
                  headerless
                />
              )}
            </div>

            {/* Risks — collapsible when visible */}
            <div className="v2-panel">
              <div className="v2-panel-header" style={{ cursor: 'pointer' }}>
                <h3 className="v2-panel-title" onClick={() => showRisks && toggleCollapse('risks')}>
                  {showRisks && !collapsed.risks ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <AlertTriangle size={16} style={{ color: '#f59e0b' }} />
                  Risks
                  <span className="v2-panel-count">{riskCount}</span>
                  <button className="v2-layer-toggle-btn" onClick={(e) => { e.stopPropagation(); toggleLayer('risks'); }} title={showRisks ? 'Hide risks' : 'Show risks'}>
                    {showRisks ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                </h3>
              </div>
              {showRisks && !collapsed.risks && (
                <RisksPanel riskCount={riskCount} loading={risksLoading} error={risksError} visible={showRisks} onToggle={() => toggleLayer('risks')} contentOnly />
              )}
            </div>

            {/* Spatial Areas */}
            <div className="v2-panel">
              <div className="v2-panel-header" style={{ cursor: 'pointer' }}>
                <h3 className="v2-panel-title" onClick={() => showSpatialAreas && toggleCollapse('spatialAreas')}>
                  {showSpatialAreas && !collapsed.spatialAreas ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <Layers size={16} style={{ color: '#5B6830' }} />
                  Spatial Areas
                  <span className="v2-panel-count">{areaCount}</span>
                  <button className="v2-layer-toggle-btn" onClick={(e) => { e.stopPropagation(); toggleLayer('spatialAreas'); }} title={showSpatialAreas ? 'Hide areas' : 'Show areas'}>
                    {showSpatialAreas ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                </h3>
              </div>
              {showSpatialAreas && !collapsed.spatialAreas && (
                <SpatialAreasPanel
                  spatialData={spatialData}
                  loading={areasLoading}
                  error={areasError}
                  visible={showSpatialAreas}
                  onFlyTo={flyToSpatialArea}
                  onEditArea={handleOpenSpatialEdit}
                  contentOnly
                />
              )}
            </div>

            {/* Land Parcels */}
            {isAdmin && (
              <div className="v2-panel">
                <div className="v2-panel-header" style={{ cursor: 'pointer' }}>
                  <h3 className="v2-panel-title" onClick={() => showParcels && toggleCollapse('parcels')}>
                    {showParcels && !collapsed.parcels ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <LandPlot size={16} style={{ color: '#6b7280' }} />
                    Land Parcels
                    <span className="v2-panel-count">{parcelCount}</span>
                    <button className="v2-layer-toggle-btn" onClick={(e) => { e.stopPropagation(); toggleLayer('parcels'); }} title={showParcels ? 'Hide parcels' : 'Show parcels'}>
                      {showParcels ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                  </h3>
                </div>
                {showParcels && !collapsed.parcels && (
                  <>
                    {parcelsLoading && <div className="v2-panel-loading">Loading parcels...</div>}
                    {parcelsError && <div className="v2-panel-error">{parcelsError}</div>}
                    {!parcelsLoading && <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', padding: '0 var(--space-md) var(--space-sm)' }}>Zoom in to level 12+ to see parcels</div>}
                  </>
                )}
              </div>
            )}

            {/* Tasks — collapsible when visible */}
            <div className="v2-panel">
              <div className="v2-panel-header" style={{ cursor: 'pointer' }}>
                <h3 className="v2-panel-title" onClick={() => showTasks && toggleCollapse('tasks')}>
                  {showTasks && !collapsed.tasks ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <ClipboardList size={16} style={{ color: '#D1583B' }} />
                  Tasks
                  <span className="v2-panel-count">{taskCount}</span>
                  <button className="v2-layer-toggle-btn" onClick={(e) => { e.stopPropagation(); toggleLayer('tasks'); }} title={showTasks ? 'Hide tasks' : 'Show tasks'}>
                    {showTasks ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                </h3>
              </div>
              {showTasks && !collapsed.tasks && (
                <TasksPanel tasks={tasks} taskCount={taskCount} loading={tasksLoading} error={tasksError} visible={showTasks} onToggle={() => toggleLayer('tasks')} blocksData={blocksData} contentOnly />
              )}
            </div>

            {/* Observations — collapsible when visible */}
            <div className="v2-panel">
              <div className="v2-panel-header" style={{ cursor: 'pointer' }}>
                <h3 className="v2-panel-title" onClick={() => showObservations && toggleCollapse('observations')}>
                  {showObservations && !collapsed.observations ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <Binoculars size={16} style={{ color: '#5B6830' }} />
                  Observations
                  <span className="v2-panel-count">{obsCount}</span>
                  <button className="v2-layer-toggle-btn" onClick={(e) => { e.stopPropagation(); toggleLayer('observations'); }} title={showObservations ? 'Hide obs' : 'Show obs'}>
                    {showObservations ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                </h3>
              </div>
              {showObservations && !collapsed.observations && (
                <ObservationsPanel observations={observations} obsCount={obsCount} loading={obsLoading} error={obsError} visible={showObservations} onToggle={() => toggleLayer('observations')} contentOnly />
              )}
            </div>

            {/* Points of interest */}
            <div className="v2-panel">
              <div className="v2-panel-header" style={{ cursor: 'pointer' }}>
                <h3 className="v2-panel-title" onClick={() => showMapFeatures && toggleCollapse('mapFeatures')}>
                  {showMapFeatures && !collapsed.mapFeatures ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <MapPin size={16} style={{ color: '#0369a1' }} />
                  Points of Interest
                  <span className="v2-panel-count">{featureCount}</span>
                  <button className="v2-layer-toggle-btn" onClick={(e) => { e.stopPropagation(); toggleLayer('mapFeatures'); }} title={showMapFeatures ? 'Hide points of interest' : 'Show points of interest'}>
                    {showMapFeatures ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                </h3>
              </div>
              {showMapFeatures && !collapsed.mapFeatures && (
                <>
                  {featuresLoading && <div className="v2-panel-loading">Loading points of interest...</div>}
                  {featuresError && <div className="v2-panel-error">{featuresError}</div>}
                  {!featuresLoading && !featuresError && featureCount === 0 && (
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', padding: '0 var(--space-md) var(--space-sm)' }}>
                      None yet. Use <strong>Add POI</strong> on the map toolbar.
                    </div>
                  )}
                  {!featuresLoading && featureCount > 0 && (
                    <ul className="v2-block-list">
                      {(mapFeaturesData?.features || []).map((feature) => {
                        const fp = feature.properties || {};
                        // Resolved against the company vocabulary, same rule the
                        // map and the popup use — the static five could not name
                        // a custom type and showed its raw slug instead.
                        const look = resolveAppearance(
                          fp.feature_type, fp.style, featureTypes.typeBySlug,
                        );
                        return (
                          <li
                            key={fp.id}
                            className="v2-block-item"
                            onClick={() => {
                              const geom = feature.geometry;
                              if (map && geom?.type === 'Point') {
                                map.flyTo({ center: geom.coordinates, zoom: 17, duration: 1200 });
                              }
                            }}
                          >
                            <span
                              style={{
                                display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                                background: look.colour, marginRight: 8, flexShrink: 0,
                              }}
                            />
                            <span className="v2-block-name">{fp.name}</span>
                            <span className="v2-block-meta">{look.label}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              )}
            </div>

            {/* Assets */}
            <div className="v2-panel">
              <div className="v2-panel-header" style={{ cursor: 'pointer' }}>
                <h3 className="v2-panel-title" onClick={() => showAssets && toggleCollapse('assets')}>
                  {showAssets && !collapsed.assets ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <Wrench size={16} style={{ color: '#5B6830' }} />
                  Assets
                  <span className="v2-panel-count">{assetCount}</span>
                  <button className="v2-layer-toggle-btn" onClick={(e) => { e.stopPropagation(); toggleLayer('assets'); }} title={showAssets ? 'Hide assets' : 'Show assets'}>
                    {showAssets ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                </h3>
              </div>
              {showAssets && !collapsed.assets && (
                <>
                  {assetsLoading && <div className="v2-panel-loading">Loading assets...</div>}
                  {assetsError && <div className="v2-panel-error">{assetsError}</div>}
                  {!assetsLoading && assetsData?.features?.length > 0 && (
                    <ul className="v2-block-list">
                      {assetsData.features.filter(f => f.geometry?.type === 'Point').map((feature) => {
                        const ap = feature.properties || {};
                        return (
                          <li key={ap.id || feature.id} className="v2-block-item" onClick={() => {
                            const coords = feature.geometry?.coordinates;
                            if (map && coords) map.flyTo({ center: coords, zoom: 17, duration: 1000 });
                          }}>
                            <div className="v2-block-name">{ap.name || 'Unnamed Asset'}</div>
                            <div className="v2-block-meta">
                              <span style={{ textTransform: 'capitalize' }}>{ap.category || 'Asset'}</span>
                              {ap.status && <span style={{ color: ap.status === 'active' ? 'var(--color-success)' : 'var(--color-text-muted)' }}>{ap.status}</span>}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {!assetsLoading && (!assetsData?.features?.length) && (
                    <div className="v2-block-empty" style={{ padding: 'var(--space-md)' }}>No assets with locations</div>
                  )}
                </>
              )}
            </div>

            {isAuxeinAdmin && (
              <FlyoverPanel
                flyover={flyover}
                blocksData={blocksData}
                properties={properties}
              />
            )}
          </>
        ) : (
          <MapBuilder
            map={map}
            mapReady={mapReady}
            isAdmin={isAdmin}
            builderState={builderState}
          />
        )}

        <div className="v2-sidebar-footer">
          <MapStyleSelector
            activeStyleId={activeStyle.id}
            onStyleChange={setStyle}
          />
        </div>
      </Sidebar>

      <div className="v2-map-area">
        <MapContainer containerRef={containerRef} />

        {/* Drawing toolbar */}
        <DrawingToolbar
          activeMode={drawMode}
          activePropertyName={activePropertyForBoundary?.name || null}
          onDrawBlock={handleDrawBlock}
          onDrawSpatial={handleDrawSpatial}
          onDrawFeature={handleDrawFeature}
          onSplit={handleStartSplit}
          onPrint={() => setShowPrintDialog(true)}
          onCancel={handleCancelDraw}
          onSaveProperty={handleSavePropertyBoundary}
          canSaveProperty={!!propertyDrawGeometry}
          disabled={!drawing.isDrawActive}
        />

        {/* Split flow UI */}
        {isSplitting && (
          <BlockSplitFlow
            statusMessage={splitMessage}
            isConfirming={isConfirming}
            isProcessing={isProcessing}
            error={splitError}
            onConfirm={confirmSplit}
            onCancel={handleCancelDraw}
          />
        )}

        {/* Pass the state object straight through — MapLegend does keyed
            lookups and ignores keys it doesn't know, so there is no second
            hand-maintained list to drift out of step. */}
        <MapLegend visible={layerVisibility} featureTypes={featureTypes.types} />

        <StatusBar message={status} />
      </div>

      {/* Block creation form (slide-in) */}
      <BlockCreateForm
        isOpen={showBlockCreate}
        geometry={drawGeometry}
        area={drawArea}
        centroid={drawCentroid}
        onSubmit={handleBlockCreateSuccess}
        onCancel={handleCancelDraw}
        properties={isAuxeinAdmin ? properties : []}
      />

      {/* Spatial area creation form */}
      <SpatialAreaForm
        isOpen={showSpatialCreate && !showSpatialEdit}
        geometry={drawGeometry}
        area={drawArea}
        onSubmit={handleSpatialCreateSuccess}
        onCancel={handleCancelDraw}
      />

      {/* Print / export. Takes the live map instance and reads its style,
          camera and canvas size at export time — nothing is pre-computed. */}
      <PrintDialog
        isOpen={showPrintDialog}
        map={map}
        layerVisibility={layerVisibility}
        featureTypes={featureTypes.types}
        isAdmin={isAdmin}
        defaultTitle={properties?.[0]?.name || ''}
        onClose={() => setShowPrintDialog(false)}
      />

      {/* Map feature (POI) create/edit — one form for both, since a POI has
          no geometry-editing step: to move one, delete it and place it again. */}
      <MapFeatureForm
        isOpen={showFeatureForm}
        existingFeature={editFeatureRecord}
        geometry={drawGeometry}
        properties={properties}
        vocabulary={featureTypes}
        canManageTypes={canManageTypes}
        onSubmit={handleFeatureSaved}
        onCancel={handleCancelDraw}
      />

      {/* Block edit form */}
      <BlockEditForm
        isOpen={showBlockEdit}
        blockData={editBlockData}
        isEditingGeometry={isEditingGeometry}
        onStartGeometryEdit={handleStartGeometryEdit}
        onSaveGeometry={handleSaveGeometry}
        onCancelGeometryEdit={handleCancelGeometryEdit}
        onSubmit={handleBlockEditSubmit}
        onDelete={handleBlockDelete}
        properties={isAuxeinAdmin ? properties : []}
        onCancel={() => {
          if (isEditingGeometry) handleCancelGeometryEdit();
          setShowBlockEdit(false);
          setEditBlockData(null);
        }}
      />

      {/* Spatial area edit form */}
      <SpatialAreaForm
        isOpen={showSpatialEdit}
        existingArea={editSpatialData}
        onSubmit={handleSpatialEditSubmit}
        onCancel={() => {
          setShowSpatialEdit(false);
          setEditSpatialData(null);
        }}
      />

      {/* Parcel assignment modal (auxein admin) */}
      <ParcelAssignmentModal
        isOpen={showParcelAssign}
        parcel={selectedParcelForAssign}
        companies={availableCompanies}
        companiesLoading={companiesLoading}
        onSubmit={handleParcelAssignSuccess}
        onCancel={() => { setShowParcelAssign(false); setSelectedParcelForAssign(null); }}
      />

      {/* Block company assignment modal (auxein admin) */}
      <BlockCompanyAssignModal
        isOpen={showBlockCompanyAssign}
        block={selectedBlockForAssign}
        companies={availableCompanies}
        companiesLoading={companiesLoading}
        onSubmit={handleBlockAssignSuccess}
        onCancel={() => { setShowBlockCompanyAssign(false); setSelectedBlockForAssign(null); }}
      />

      {/* Block summary (task/observation symbol + block popup) — picking a task
          in here hands off to the task modal below. */}
      <BlockSummaryModal
        open={blockSummary.open}
        blockId={blockSummary.blockId}
        blockName={blockSummary.blockName}
        tasks={tasks}
        observations={observations}
        onClose={closeBlockSummary}
        onOpenTask={(taskId) => {
          closeBlockSummary();
          setTaskDetail({ open: true, taskId, tasks: null });
        }}
        onEditBlock={handleOpenBlockEdit}
      />

      {/* Unified task detail modal (GPS track click + hand-off from the summary) */}
      <TaskDetailModal
        open={taskDetail.open}
        taskId={taskDetail.taskId}
        tasks={taskDetail.tasks}
        onClose={closeTaskDetail}
      />
    </div>
  );
}

export default function MapsPage() {
  return (
    <MapsErrorBoundary>
      <MapsPageInner />
    </MapsErrorBoundary>
  );
}
