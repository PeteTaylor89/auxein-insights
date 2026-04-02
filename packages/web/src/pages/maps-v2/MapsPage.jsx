// maps-v2/MapsPage.jsx — Page shell: sidebar + map + mode toggle
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import * as turf from '@turf/turf';
import { useAuth, blocksService, spatialAreasService, propertyService } from '@vineyard/shared';
import useMapbox from './hooks/useMapbox';
import useBlocksLayer from './hooks/useBlocksLayer';
import useRisksLayer from './hooks/useRisksLayer';
import useSpatialAreasLayer from './hooks/useSpatialAreasLayer';
import useParcelsLayer from './hooks/useParcelsLayer';
import useTasksLayer from './hooks/useTasksLayer';
import useObservationsLayer from './hooks/useObservationsLayer';
import useAssetsLayer from './hooks/useAssetsLayer';
import useDrawingController from './hooks/useDrawingController';
import useBlockSplit from './hooks/useBlockSplit';
import useFlyoverAnimation from './hooks/useFlyoverAnimation';
import FlyoverPanel from './components/flyover/FlyoverPanel';
import MapContainer from './components/MapContainer';
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
import {
  showReactPopup,
  BlockPopupContent,
  ObservationPopupContent,
  TaskPopupContent,
  RiskPopupContent,
} from './components/shared/MapPopup';
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
  const [showObservations, setShowObservations] = useState(true);
  const [showAssets, setShowAssets] = useState(false);

  // Properties state (admin only)
  const [properties, setProperties] = useState([]);

  // Fetch properties for admin
  const fetchProperties = useCallback(async () => {
    if (!isAuxeinAdmin) return;
    try {
      const data = await propertyService.listProperties({ limit: 500 });
      setProperties(data);
    } catch (err) {
      console.error('Failed to load properties:', err);
    }
  }, [isAuxeinAdmin]);

  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  // Drawing state
  const [drawMode, setDrawMode] = useState('idle'); // idle | draw_polygon | draw_spatial | split | edit
  const [drawGeometry, setDrawGeometry] = useState(null);
  const [drawArea, setDrawArea] = useState(0);
  const [drawCentroid, setDrawCentroid] = useState(null);

  // Form state
  const [showBlockCreate, setShowBlockCreate] = useState(false);
  const [showSpatialCreate, setShowSpatialCreate] = useState(false);
  const [showBlockEdit, setShowBlockEdit] = useState(false);
  const [editBlockData, setEditBlockData] = useState(null);
  const [isEditingGeometry, setIsEditingGeometry] = useState(false);
  const editFeatureIdRef = useRef(null);
  const [showSpatialEdit, setShowSpatialEdit] = useState(false);
  const [editSpatialData, setEditSpatialData] = useState(null);

  // Map instance
  const { map, mapRef, mapReady, activeStyle, is3D, setStyle, containerRef } =
    useMapbox();

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
  const { areaCount, loading: areasLoading, error: areasError } =
    useSpatialAreasLayer(map, mapReady, showSpatialAreas);

  // Parcels (admin only)
  const { parcelCount, loading: parcelsLoading, error: parcelsError } =
    useParcelsLayer(map, mapReady, showParcels, isAuxeinAdmin);

  // Tasks
  const {
    tasks, taskCount, loading: tasksLoading, error: tasksError,
    activeTrackId, showTrack, hideTrack,
  } = useTasksLayer(map, mapReady, showTasks, blocksData);

  // Observations
  const { observations, obsCount, loading: obsLoading, error: obsError } =
    useObservationsLayer(map, mapReady, showObservations, blocksData);

  // Assets
  const { assetCount, loading: assetsLoading, error: assetsError } =
    useAssetsLayer(map, mapReady, showAssets);

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
    if (isSplitting) cancelSplit();
  }, [drawing, isSplitting, cancelSplit]);

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

    map.on('click', handleSplitSelect);
    return () => map.off('click', handleSplitSelect);
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

  // Unified click handler — only the topmost interactive layer gets a popup
  useEffect(() => {
    if (!map || !mapReady) return;

    // Priority order: point layers first (risks, observations, tasks), then fill (blocks)
    const INTERACTIVE_LAYERS = [
      'v2-assets-points',
      'v2-risks-circles',
      'v2-observations-symbol',
      'v2-tasks-symbol',
      'v2-blocks-fill',
    ];

    const handleClick = (e) => {
      // Skip popups when drawing/splitting/editing
      if (drawMode !== 'idle') return;

      // Query all interactive layers that currently exist on the map
      const activeLayers = INTERACTIVE_LAYERS.filter((id) => map.getLayer(id));
      if (activeLayers.length === 0) return;

      const features = map.queryRenderedFeatures(e.point, { layers: activeLayers });
      if (!features?.length) return;

      // First feature is from the topmost layer — show only that popup
      const feature = features[0];
      const layerId = feature.layer?.id;
      const p = feature.properties || {};

      if (layerId === 'v2-assets-points') {
        const coords = feature.geometry.coordinates;
        showReactPopup(map, {
          lngLat: coords,
          content: (
            <div style={{ minWidth: 160 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{p.name || 'Asset'}</div>
              <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                {p.category}{p.subcategory ? ` / ${p.subcategory}` : ''}
              </div>
              {p.asset_number && <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>#{p.asset_number}</div>}
              {p.location_label && <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: 2 }}>{p.location_label}</div>}
              <div style={{ fontSize: '0.75rem', marginTop: 4, color: p.status === 'active' ? '#059669' : '#dc2626' }}>
                {p.status}
              </div>
            </div>
          ),
        });
      } else if (layerId === 'v2-risks-circles') {
        const coords = feature.geometry.coordinates;
        showReactPopup(map, {
          lngLat: coords,
          content: <RiskPopupContent properties={p} />,
        });
      } else if (layerId === 'v2-observations-symbol') {
        const coords = feature.geometry.coordinates;
        showReactPopup(map, {
          lngLat: coords,
          content: <ObservationPopupContent properties={p} />,
        });
      } else if (layerId === 'v2-tasks-symbol') {
        const coords = feature.geometry.coordinates;
        showReactPopup(map, {
          lngLat: coords,
          content: <TaskPopupContent properties={p} />,
        });
      } else if (layerId === 'v2-blocks-fill') {
        showReactPopup(map, {
          lngLat: [e.lngLat.lng, e.lngLat.lat],
          content: (
            <BlockPopupContent
              feature={feature}
              onFlyTo={flyToBlock}
              onEdit={handleOpenBlockEdit}
            />
          ),
        });
      }
    };

    map.on('click', handleClick);

    // Cursor: pointer when hovering any interactive layer
    const onMouseMove = (e) => {
      const activeLayers = INTERACTIVE_LAYERS.filter((id) => map.getLayer(id));
      if (activeLayers.length === 0) return;
      const features = map.queryRenderedFeatures(e.point, { layers: activeLayers });
      map.getCanvas().style.cursor = features?.length ? 'pointer' : '';
    };

    map.on('mousemove', onMouseMove);

    return () => {
      map.off('click', handleClick);
      map.off('mousemove', onMouseMove);
    };
  }, [map, mapReady, flyToBlock, drawMode, handleOpenBlockEdit]);

  return (
    <div className="v2-maps-page">
      <Sidebar mode={mode} onModeChange={setMode}>
        {mode === 'management' ? (
          <>
            <BlocksPanel
              blocksData={blocksData}
              blockCount={blockCount}
              loading={loading}
              error={error}
              flyToBlock={flyToBlock}
            />

            <RisksPanel
              riskCount={riskCount}
              loading={risksLoading}
              error={risksError}
              visible={showRisks}
              onToggle={() => setShowRisks((v) => !v)}
            />

            <SpatialAreasPanel
              areaCount={areaCount}
              loading={areasLoading}
              error={areasError}
              visible={showSpatialAreas}
              onToggle={() => setShowSpatialAreas((v) => !v)}
            />

            {isAuxeinAdmin && (
              <div className="v2-panel">
                <div className="v2-panel-header">
                  <h3 className="v2-panel-title">
                    Land Parcels
                    <span className="v2-panel-count">{parcelCount}</span>
                    <button
                      className="v2-layer-toggle-btn"
                      onClick={() => setShowParcels((v) => !v)}
                    >
                      {showParcels ? 'On' : 'Off'}
                    </button>
                  </h3>
                </div>
                {parcelsLoading && <div className="v2-panel-loading">Loading parcels...</div>}
                {parcelsError && <div className="v2-panel-error">{parcelsError}</div>}
                {showParcels && !parcelsLoading && (
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', padding: '0 var(--space-md)' }}>
                    Zoom in to level 12+ to see parcels
                  </div>
                )}
              </div>
            )}

            <TasksPanel
              tasks={tasks}
              taskCount={taskCount}
              loading={tasksLoading}
              error={tasksError}
              visible={showTasks}
              onToggle={() => setShowTasks((v) => !v)}
              activeTrackId={activeTrackId}
              showTrack={showTrack}
              hideTrack={hideTrack}
            />

            <ObservationsPanel
              observations={observations}
              obsCount={obsCount}
              loading={obsLoading}
              error={obsError}
              visible={showObservations}
              onToggle={() => setShowObservations((v) => !v)}
            />

            <div className="v2-panel">
              <div className="v2-panel-header">
                <h3 className="v2-panel-title">
                  Assets
                  <span className="v2-panel-count">{assetCount}</span>
                  <button
                    className="v2-layer-toggle-btn"
                    onClick={() => setShowAssets((v) => !v)}
                  >
                    {showAssets ? 'On' : 'Off'}
                  </button>
                </h3>
              </div>
              {assetsLoading && <div className="v2-panel-loading">Loading assets...</div>}
              {assetsError && <div className="v2-panel-error">{assetsError}</div>}
            </div>

            {isAuxeinAdmin && properties.length > 0 && (
              <PropertiesPanel
                properties={properties}
                blocksData={blocksData}
                onFlyTo={(coords) => {
                  if (map && coords) {
                    map.flyTo({ center: coords, zoom: 14, duration: 1500 });
                  }
                }}
              />
            )}

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
            isAdmin={isAuxeinAdmin}
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
          onDrawBlock={handleDrawBlock}
          onDrawSpatial={handleDrawSpatial}
          onSplit={handleStartSplit}
          onCancel={handleCancelDraw}
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
