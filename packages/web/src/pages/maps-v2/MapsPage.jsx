// maps-v2/MapsPage.jsx — Page shell: sidebar + map + mode toggle
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import * as turf from '@turf/turf';
import { useAuth, blocksService, spatialAreasService, propertyService, parcelsService } from '@vineyard/shared';
import useMapbox from './hooks/useMapbox';
import useBlocksLayer from './hooks/useBlocksLayer';
import useRisksLayer from './hooks/useRisksLayer';
import useSpatialAreasLayer from './hooks/useSpatialAreasLayer';
import useParcelsLayer from './hooks/useParcelsLayer';
import useTasksLayer from './hooks/useTasksLayer';
import useGpsTracksLayer from './hooks/useGpsTracksLayer';
import useObservationsLayer from './hooks/useObservationsLayer';
import useAssetsLayer from './hooks/useAssetsLayer';
import useDrawingController from './hooks/useDrawingController';
import useBlockSplit from './hooks/useBlockSplit';
import useFlyoverAnimation from './hooks/useFlyoverAnimation';
import usePropertiesLayer from './hooks/usePropertiesLayer';
import FlyoverPanel from './components/flyover/FlyoverPanel';
import MapContainer from './components/MapContainer';
import Sidebar from './components/Sidebar';
import BlocksPanel from './components/management/BlocksPanel';
import RisksPanel from './components/management/RisksPanel';
import SpatialAreasPanel from './components/management/SpatialAreasPanel';
import TasksPanel from './components/management/TasksPanel';
import GpsTracksPanel from './components/management/GpsTracksPanel';
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
import { useNavigate } from 'react-router-dom';
import {
  Eye, EyeOff, ChevronDown, ChevronRight,
  ClipboardList, AlertTriangle, Binoculars, Wrench, Activity, Layers, LandPlot,
} from 'lucide-react';
import {
  showReactPopup,
  BlockPopupContent,
  ObservationPopupContent,
  RiskPopupContent,
  AssetPopupContent,
  ParcelPopupContent,
} from './components/shared/MapPopup';
import ParcelAssignmentModal from './components/drawing/ParcelAssignmentModal';
import BlockCompanyAssignModal from './components/drawing/BlockCompanyAssignModal';
import TaskDetailModal from './components/TaskDetailModal';
import useAvailableCompanies from './hooks/useAvailableCompanies';
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

  // Layer visibility toggles
  const [showRisks, setShowRisks] = useState(true);
  const [showSpatialAreas, setShowSpatialAreas] = useState(false);
  const [showParcels, setShowParcels] = useState(false);
  const [showTasks, setShowTasks] = useState(true);
  const [showGpsTracks, setShowGpsTracks] = useState(false);
  const [showObservations, setShowObservations] = useState(true);
  const [showAssets, setShowAssets] = useState(false);

  // Panel collapse state (for sidebar cleanliness)
  const [collapsed, setCollapsed] = useState({
    blocks: true,
    risks: true,
    spatialAreas: true,
    parcels: true,
    tasks: true,
    gpsTracks: true,
    observations: true,
    assets: true,
  });
  const toggleCollapse = (key) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));

  // Properties state (admin only)
  const [properties, setProperties] = useState([]);

  const isAdmin = isAuxeinAdmin || userTypeRole === 'company_admin';

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

  // Map instance
  const { map, mapRef, mapReady, activeStyle, is3D, setStyle, containerRef } =
    useMapbox();

  // Fullscreen the map page: hide site footer + lock body scroll while mounted.
  // Restored on unmount so other pages keep their normal layout.
  useEffect(() => {
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

  // Tasks
  const {
    tasks, taskCount, loading: tasksLoading, error: tasksError,
    activeTrackId, showTrack, hideTrack,
  } = useTasksLayer(map, mapReady, showTasks, blocksData);

  // GPS Tracks (recent, all tasks)
  const {
    tracksData: gpsTracksData,
    trackCount: gpsTrackCount,
    loading: gpsTracksLoading,
    error: gpsTracksError,
  } = useGpsTracksLayer(map, mapReady, showGpsTracks);

  // Observations
  const { observations, obsCount, loading: obsLoading, error: obsError } =
    useObservationsLayer(map, mapReady, showObservations, blocksData);

  // Assets
  const { assetsData, assetCount, loading: assetsLoading, error: assetsError } =
    useAssetsLayer(map, mapReady, showAssets);

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

  const handleStartSplit = useCallback(() => {
    setDrawMode('split');
    drawing.freeze();
    drawing.clearDraft();
    startSplit();
  }, [drawing, startSplit]);

  const handleCancelDraw = useCallback(() => {
    setDrawMode('idle');
    drawing.freeze();
    drawing.clearDraft();
    setDrawGeometry(null);
    setDrawArea(0);
    setDrawCentroid(null);
    setShowBlockCreate(false);
    setShowSpatialCreate(false);
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
    setShowSpatialAreas(false);
    setTimeout(() => setShowSpatialAreas(true), 100);
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
    setShowSpatialAreas(false);
    setTimeout(() => setShowSpatialAreas(true), 100);
  }, [drawing]);

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
  const handleOpenSpatialEditRef = useRef(handleOpenSpatialEdit);
  handleOpenSpatialEditRef.current = handleOpenSpatialEdit;
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
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
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  useEffect(() => {
    if (!map || !mapReady) return;

    // Priority order: first = highest priority. Point layers beat fill layers.
    // GPS track lines sit just above blocks/spatial so a track segment can be
    // clicked through the block fill but is still below point markers.
    const INTERACTIVE_LAYERS = [
      'v2-assets-points', 'v2-risks-circles', 'v2-observations-symbol',
      'v2-tasks-symbol', 'v2-gps-tracks-line', 'v2-assets-lines',
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

      if (layerId === 'v2-assets-points' || layerId === 'v2-assets-lines') {
        showReactPopup(map, { lngLat, content: <AssetPopupContent properties={p} onNavigate={() => { const t = p.asset_type === 'consumable' ? 'consumables' : 'equipment'; nav(`/assets/${t}/${p.id}/edit`); }} /> });
      } else if (layerId === 'v2-risks-circles') {
        showReactPopup(map, { lngLat, content: <RiskPopupContent properties={p} onNavigate={() => nav('/riskdashboard')} /> });
      } else if (layerId === 'v2-observations-symbol') {
        showReactPopup(map, { lngLat, content: <ObservationPopupContent properties={p} onNavigate={() => nav('/observations')} /> });
      } else if (layerId === 'v2-tasks-symbol') {
        const blockId = p.block_id != null ? Number(p.block_id) : null;
        const blockTasks = (tasksRef.current || []).filter((t) => t.block_id === blockId);
        if (blockTasks.length === 0) return;
        setTaskDetailRef.current({
          open: true,
          taskId: blockTasks.length === 1 ? blockTasks[0].id : null,
          tasks: blockTasks,
        });
      } else if (layerId === 'v2-gps-tracks-line') {
        const tid = p.task_id != null ? Number(p.task_id) : null;
        if (!tid) return;
        setTaskDetailRef.current({ open: true, taskId: tid, tasks: null });
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
        showReactPopup(map, { lngLat, content: (
          <BlockPopupContent
            feature={topFeature}
            onFlyTo={flyToBlockRef.current}
            onEdit={handleOpenBlockEditRef.current}
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
                  <button className="v2-layer-toggle-btn" onClick={(e) => { e.stopPropagation(); setShowRisks((v) => !v); }} title={showRisks ? 'Hide risks' : 'Show risks'}>
                    {showRisks ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                </h3>
              </div>
              {showRisks && !collapsed.risks && (
                <RisksPanel riskCount={riskCount} loading={risksLoading} error={risksError} visible={showRisks} onToggle={() => setShowRisks((v) => !v)} contentOnly />
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
                  <button className="v2-layer-toggle-btn" onClick={(e) => { e.stopPropagation(); setShowSpatialAreas((v) => !v); }} title={showSpatialAreas ? 'Hide areas' : 'Show areas'}>
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
                    <button className="v2-layer-toggle-btn" onClick={(e) => { e.stopPropagation(); setShowParcels((v) => !v); }} title={showParcels ? 'Hide parcels' : 'Show parcels'}>
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
                  <button className="v2-layer-toggle-btn" onClick={(e) => { e.stopPropagation(); setShowTasks((v) => !v); }} title={showTasks ? 'Hide tasks' : 'Show tasks'}>
                    {showTasks ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                </h3>
              </div>
              {showTasks && !collapsed.tasks && (
                <TasksPanel tasks={tasks} taskCount={taskCount} loading={tasksLoading} error={tasksError} visible={showTasks} onToggle={() => setShowTasks((v) => !v)} activeTrackId={activeTrackId} showTrack={showTrack} hideTrack={hideTrack} blocksData={blocksData} contentOnly />
              )}
            </div>

            {/* GPS Tracks — collapsible when visible */}
            <div className="v2-panel">
              <div className="v2-panel-header" style={{ cursor: 'pointer' }}>
                <h3 className="v2-panel-title" onClick={() => showGpsTracks && toggleCollapse('gpsTracks')}>
                  {showGpsTracks && !collapsed.gpsTracks ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <Activity size={16} style={{ color: '#5B6830' }} />
                  GPS Tracks
                  <span className="v2-panel-count">{gpsTrackCount}</span>
                  <button className="v2-layer-toggle-btn" onClick={(e) => { e.stopPropagation(); setShowGpsTracks((v) => !v); }} title={showGpsTracks ? 'Hide GPS tracks' : 'Show GPS tracks'}>
                    {showGpsTracks ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                </h3>
              </div>
              {showGpsTracks && !collapsed.gpsTracks && (
                <GpsTracksPanel
                  tracksData={gpsTracksData}
                  trackCount={gpsTrackCount}
                  loading={gpsTracksLoading}
                  error={gpsTracksError}
                  visible={showGpsTracks}
                />
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
                  <button className="v2-layer-toggle-btn" onClick={(e) => { e.stopPropagation(); setShowObservations((v) => !v); }} title={showObservations ? 'Hide obs' : 'Show obs'}>
                    {showObservations ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                </h3>
              </div>
              {showObservations && !collapsed.observations && (
                <ObservationsPanel observations={observations} obsCount={obsCount} loading={obsLoading} error={obsError} visible={showObservations} onToggle={() => setShowObservations((v) => !v)} contentOnly />
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
                  <button className="v2-layer-toggle-btn" onClick={(e) => { e.stopPropagation(); setShowAssets((v) => !v); }} title={showAssets ? 'Hide assets' : 'Show assets'}>
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
          onSplit={handleStartSplit}
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

      {/* Unified task detail modal (task symbol + GPS track click) */}
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
