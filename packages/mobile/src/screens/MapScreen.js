// screens/MapScreen.js — MAP.1 boot.
// Satellite-streets base, user-location dot, recenter FAB. No data layers yet
// (those land in MAP.2+). See docs/plans/MOBILE_MAP_PLAN.md.
//
// Requires the @rnmapbox/maps native module — won't render in Expo Go. Use an
// EAS dev build (`eas build --profile development`) or the production build.

import { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Modal, FlatList, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { Feather } from '@expo/vector-icons';
import Mapbox from '@rnmapbox/maps';

import { colors, spacing, fontSize, radius } from '../styles/theme';
import useBlockGeojson from '../hooks/useBlockGeojson';
import useTasksByBlock from '../hooks/useTasksByBlock';
import useAssetGeojson from '../hooks/useAssetGeojson';
import useRiskGeojson from '../hooks/useRiskGeojson';
import useLayerVisibility from '../hooks/useLayerVisibility';
import useLiveLocalTrack from '../hooks/useLiveLocalTrack';
import useTaskTrackOnce from '../hooks/useTaskTrackOnce';
import { useAuth } from '../contexts/AuthContext';
import { useProperty } from '../contexts/PropertyContext';
import { geojsonBbox, bboxToCameraBounds } from '../utils/geoBounds';
import MapBlockSheet from '../components/MapBlockSheet';
import MapRiskSheet from '../components/MapRiskSheet';
import MapAssetSheet from '../components/MapAssetSheet';
import MapLayerSheet from '../components/MapLayerSheet';
import { assetService } from '../api/services';

// Category → fill colour for asset pins. Falls back to muted grey for unknown.
const ASSET_COLOR_BY_CATEGORY = [
  'match',
  ['get', 'category'],
  'vehicle', '#2563eb',         // blue
  'equipment', colors.primary,  // olive
  'tool', colors.accent,        // terracotta
  'consumable', '#06b6d4',      // cyan
  'infrastructure', colors.charcoal,
  '#6b7280',                    // default grey
];

// Risk level → marker colour. Driven by inherent_risk_level; values match the
// backend enum (low/medium/high/critical). Polygon area-risks use the same
// colour at low opacity for the fill + full opacity for the outline.
const RISK_COLOR_BY_LEVEL = [
  'match',
  ['get', 'inherent_risk_level'],
  'low', '#16a34a',       // green
  'medium', '#f59e0b',    // amber
  'high', '#ea580c',      // orange
  'critical', '#dc2626',  // red
  '#6b7280',              // unknown — grey
];

// Pull the public token from EAS env (wired in app.config.js) and hand it to
// Mapbox at module load time. Empty token short-circuits Mapbox into an inert
// state — we surface that as a banner so it's visible in builds where the env
// var wasn't injected (e.g. Expo Go).
const MAPBOX_TOKEN = Constants.expoConfig?.extra?.mapboxPublicToken || '';
if (MAPBOX_TOKEN) {
  Mapbox.setAccessToken(MAPBOX_TOKEN);
}

// Fallback camera target while we don't have a user location or property bounds.
// Roughly Nelson/Tasman — the centre of mass of the V1 customer base.
const FALLBACK_CENTER = [173.28, -41.27];
const FALLBACK_ZOOM = 5;

export default function MapScreen({ navigation, route }) {
  // Optional deep-link param — set when navigating from TaskDetail's
  // "View on Map" button on a completed-GPS task. When present we render
  // that task's track as a static polyline instead of the live one.
  const viewTaskId = route?.params?.viewTaskId ?? null;
  // viewAssetId: when navigated in from AssetDetail's "View on Map" CTA, the
  // map auto-centres on the asset and opens its summary sheet. Optional
  // viewAssetLat/Lng are used to position the camera before the asset detail
  // fetch resolves, so the user sees the right spot immediately.
  const viewAssetId = route?.params?.viewAssetId ?? null;
  const viewAssetLat = route?.params?.viewAssetLat ?? null;
  const viewAssetLng = route?.params?.viewAssetLng ?? null;
  const cameraRef = useRef(null);
  const [permissionGranted, setPermissionGranted] = useState(null);
  const [initialCenter, setInitialCenter] = useState(null);
  const [didFitBlocks, setDidFitBlocks] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [selectedRisk, setSelectedRisk] = useState(null);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [layerSheetOpen, setLayerSheetOpen] = useState(false);
  const [propertyPickerOpen, setPropertyPickerOpen] = useState(false);
  // Android: Mapbox's native view silently drops camera commands fired before
  // the map has finished loading. iOS handles the queue itself. Track readiness
  // and gate every cameraRef call on it so deep-link param effects (viewAssetId,
  // viewTaskId) and the initial-fit-to-blocks effect re-fire once the map mounts.
  const [mapReady, setMapReady] = useState(false);

  // Follow-the-user mode. Auto-engages when a live GPS recording starts;
  // disengages when the user interacts with the map (tap-to-open-sheet,
  // recenter button re-engages). Each new live point pans the camera while
  // followUser is true.
  const [followUser, setFollowUser] = useState(false);
  useEffect(() => {
    if (liveActive && !viewTaskId) setFollowUser(true);
  }, [liveActive, viewTaskId]);

  useEffect(() => {
    if (!followUser || !mapReady || !liveLastCoord || !cameraRef.current) return;
    cameraRef.current.setCamera({
      centerCoordinate: liveLastCoord,
      animationDuration: 400,
    });
  }, [followUser, mapReady, liveLastCoord]);
  // Bottom inset for sheet padding so the Android gesture bar doesn't sit on
  // top of sheet content (edge-to-edge is enabled in app.json).
  const insets = useSafeAreaInsets();

  const { visible: layerVisible, toggle: toggleLayer } = useLayerVisibility();
  const { properties, selectedPropertyId, selectedProperty, setSelectedPropertyId } = useProperty();
  // Live polyline reads from the in-memory buffer in useGpsTracking — the
  // backend track/geojson endpoint only returns data after stop/reprocess, so
  // polling it during a live recording yields 404. The local buffer carries
  // every accepted (Kalman-filtered) point and updates as they arrive.
  // Also works for contractors (no /tasks list call required).
  const { isManagerOrAbove } = useAuth();
  const { feature: liveTrack, active: liveActive, lastCoord: liveLastCoord } = useLiveLocalTrack();
  const { track: historicalTrack, task: viewingTask, loading: viewingLoading } = useTaskTrackOnce(viewTaskId);

  // Historical (explicit user intent — TaskDetail "View on Map") wins. Live
  // suppressed while a historical track is being viewed to avoid two lines.
  const displayTrack = viewTaskId ? historicalTrack : liveTrack;

  // Fit camera to the historical track once when it lands. Live tracks
  // intentionally don't auto-fit — the user is likely the one moving and
  // shouldn't have the camera yanked out from under them every 6s.
  const [didFitHistoricalTrack, setDidFitHistoricalTrack] = useState(false);
  useEffect(() => {
    setDidFitHistoricalTrack(false);
  }, [viewTaskId]);
  useEffect(() => {
    if (didFitHistoricalTrack) return;
    if (!mapReady || !historicalTrack || !cameraRef.current) return;
    const bbox = geojsonBbox({ type: 'FeatureCollection', features: [historicalTrack] });
    const bounds = bboxToCameraBounds(bbox);
    if (!bounds) return;
    cameraRef.current.fitBounds(bounds.ne, bounds.sw, [80, 40, 80, 40], 800);
    setDidFitHistoricalTrack(true);
  }, [mapReady, historicalTrack, didFitHistoricalTrack]);

  // Use null (not undefined) so React Navigation reliably persists the cleared
  // state across re-renders. Setting to undefined sometimes leaves the param
  // in place. Also clears the historical-track display state so the polyline
  // disappears even if the route param is briefly stale.
  const dismissViewingTrack = () => {
    setDidFitHistoricalTrack(false);
    navigation?.setParams?.({
      viewTaskId: null,
      viewAssetId: null,
      viewAssetLat: null,
      viewAssetLng: null,
    });
  };

  // Block / asset / risk layers — all scoped by the active property from
  // PropertyContext. Selecting a different property re-fetches each layer and
  // refits the camera to the new property's blocks (see didFitBlocks reset
  // effect below).
  const { data: blocksGeojson, loading: blocksLoading, error: blocksError } = useBlockGeojson(selectedPropertyId);
  const { tasksByBlock, getBlockTasks } = useTasksByBlock();
  const { data: assetsGeojson, loading: assetsLoading, error: assetsError } = useAssetGeojson({ propertyId: selectedPropertyId });
  const { data: risksGeojson, loading: risksLoading, error: risksError } = useRiskGeojson({ propertyId: selectedPropertyId });

  // Refit the camera when the property changes. Without this, switching
  // property leaves the camera on the previous polygons until the user pans.
  useEffect(() => {
    setDidFitBlocks(false);
  }, [selectedPropertyId]);

  // Task badges — derive a point FeatureCollection from blocks that have any
  // task. Position each at the block centroid (provided by /blocks/geojson).
  // Properties drive the symbol colour (active vs inactive) + count label.
  const taskBadgeFeatures = useMemo(() => {
    if (!blocksGeojson?.features?.length) {
      return { type: 'FeatureCollection', features: [] };
    }
    const OPEN = new Set(['scheduled', 'ready', 'in_progress']);
    const features = [];
    for (const block of blocksGeojson.features) {
      const props = block.properties || {};
      const tasks = tasksByBlock[props.id];
      if (!tasks || tasks.length === 0) continue;
      const lng = props.centroid_longitude;
      const lat = props.centroid_latitude;
      if (typeof lng !== 'number' || typeof lat !== 'number') continue;
      const hasActive = tasks.some(t => OPEN.has(t.status));
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: {
          block_id: props.id,
          block_name: props.block_name,
          task_count: tasks.length,
          // Mapbox style expressions handle numeric comparisons more reliably
          // than booleans, so encode active state as 1/0.
          has_active: hasActive ? 1 : 0,
        },
      });
    }
    return { type: 'FeatureCollection', features };
  }, [blocksGeojson, tasksByBlock]);

  const blocksBounds = useMemo(
    () => bboxToCameraBounds(geojsonBbox(blocksGeojson)),
    [blocksGeojson],
  );

  // On first successful blocks load, fit the camera to the polygons. Skipped if
  // we already fit once (so a later refetch doesn't yank the camera away from
  // the user's current pan/zoom). Gated on mapReady because Android drops
  // camera ops fired before onDidFinishLoadingMap.
  useEffect(() => {
    if (didFitBlocks) return;
    if (!mapReady || !blocksBounds || !cameraRef.current) return;
    cameraRef.current.fitBounds(
      blocksBounds.ne,
      blocksBounds.sw,
      [60, 40, 60, 40], // padding: top, right, bottom, left — leaves room for FAB + banner
      800,
    );
    setDidFitBlocks(true);
  }, [mapReady, blocksBounds, didFitBlocks]);

  // Tap a polygon → open the detail sheet. Mapbox passes the tapped features
  // in event.features; we take the first (top-most under the press).
  const handleBlockPress = (e) => {
    const f = e?.features?.[0];
    if (!f) return;
    disengageFollow();
    setSelectedBlock(f.properties || null);
  };

  // Tap a task badge → same sheet as tapping the underlying block. Badge
  // features carry only block_id, so look up the full block properties from
  // blocksGeojson before opening.
  const handleTaskBadgePress = (e) => {
    const f = e?.features?.[0];
    const blockId = f?.properties?.block_id;
    if (!blockId || !blocksGeojson?.features) return;
    const block = blocksGeojson.features.find(b => b?.properties?.id === blockId);
    if (block) setSelectedBlock(block.properties);
  };

  const handleSheetTaskPress = (task) => {
    setSelectedBlock(null);
    // Tasks live in their own tab stack; cross-tab nav goes via the parent tab navigator.
    // initial: false stacks TaskList beneath TaskDetail so back returns to the list.
    navigation?.navigate?.('Tasks', {
      screen: 'TaskDetail',
      initial: false,
      params: { taskId: task.id },
    });
  };

  const handleSheetViewAll = () => {
    setSelectedBlock(null);
    // TODO: pass blockId once TasksScreen accepts a route-param filter.
    navigation?.navigate?.('Tasks', { screen: 'TaskList' });
  };

  // Tap an asset → open the summary sheet. Sheet's "View details" CTA does the
  // cross-tab nav into AssetDetail. Feature.properties already carries the
  // summary fields the sheet needs (id, name, asset_number, category,
  // subcategory, status, location_label).
  const handleAssetPress = (e) => {
    const f = e?.features?.[0];
    if (!f?.properties?.id) return;
    disengageFollow();
    setSelectedAsset(f.properties);
  };

  const handleSheetAssetDetails = () => {
    const id = selectedAsset?.id;
    setSelectedAsset(null);
    if (!id) return;
    // initial: false sets the Assets stack to [AssetList, AssetDetail] so the
    // back gesture / system back button returns to the list. Without it the
    // stack initializes with AssetDetail as the only entry and back exits to
    // the previous tab.
    navigation?.navigate?.('Assets', {
      screen: 'AssetDetail',
      initial: false,
      params: { assetId: id },
    });
  };

  // Tap a risk → bottom sheet (no mobile RiskDetail screen yet; the sheet
  // surfaces enough metadata for the field-worker safety use case).
  const handleRiskPress = (e) => {
    const f = e?.features?.[0];
    if (!f) return;
    disengageFollow();
    setSelectedRisk(f.properties || null);
  };

  // "View on Map" from AssetDetail lands here with viewAssetId (+ optional
  // lat/lng for an immediate camera centre). Centre first using the param
  // coords, then fetch the asset detail to populate the sheet. The lat/lng
  // fallback keeps the camera responsive even if the network is slow.
  // Gated on mapReady so the cold-start case (Map tab not yet mounted when the
  // CTA is tapped) still fires once the native view is ready on Android.
  useEffect(() => {
    if (!viewAssetId) return undefined;
    let cancelled = false;

    if (
      mapReady &&
      cameraRef.current &&
      typeof viewAssetLat === 'number' &&
      typeof viewAssetLng === 'number'
    ) {
      cameraRef.current.setCamera({
        centerCoordinate: [viewAssetLng, viewAssetLat],
        zoomLevel: 17,
        animationDuration: 600,
      });
    }

    (async () => {
      try {
        const asset = await assetService.getAsset(viewAssetId);
        if (cancelled) return;
        setSelectedAsset(asset);
      } catch (err) {
        console.warn('[MapScreen] viewAssetId fetch failed', err?.message);
      }
    })();

    return () => { cancelled = true; };
  }, [mapReady, viewAssetId, viewAssetLat, viewAssetLng]);

  // Clear the route param when the asset sheet closes so re-entering the Map
  // tab doesn't snap back to the same asset. Null (not undefined) is used to
  // ensure the param is reliably cleared in React Navigation.
  const handleAssetSheetClose = () => {
    setSelectedAsset(null);
    if (viewAssetId) {
      navigation?.setParams?.({
        viewAssetId: null,
        viewAssetLat: null,
        viewAssetLng: null,
      });
    }
  };


  // Foreground-location permission on mount. We only use it for the user dot
  // + recenter — background tracking lives on the GPS task flow elsewhere.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        const granted = status === 'granted';
        setPermissionGranted(granted);

        if (!granted) {
          setInitialCenter(FALLBACK_CENTER);
          return;
        }
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        if (cancelled) return;
        setInitialCenter([loc.coords.longitude, loc.coords.latitude]);
      } catch (err) {
        console.warn('[MapScreen] location bootstrap failed', err);
        if (!cancelled) {
          setPermissionGranted(false);
          setInitialCenter(FALLBACK_CENTER);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const recenter = async () => {
    if (!permissionGranted) return;
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const c = [loc.coords.longitude, loc.coords.latitude];
      cameraRef.current?.setCamera({
        centerCoordinate: c,
        zoomLevel: 17,
        animationDuration: 600,
      });
      // If a live recording is active, re-engage follow mode — the user
      // wants the camera to keep up with them again.
      if (liveActive) setFollowUser(true);
    } catch (err) {
      console.warn('[MapScreen] recenter failed', err);
    }
  };

  // Any sheet-opening tap on the map content disengages follow so the user
  // can read the sheet without the camera yanking. Recenter re-engages.
  const disengageFollow = () => { if (followUser) setFollowUser(false); };

  // Wait for the bootstrap effect to either grant + locate, or fall back.
  // Mapbox throws if you mount it without a defaultSettings camera.
  if (initialCenter === null) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.bootText}>Loading map…</Text>
      </View>
    );
  }

  const tokenMissing = !MAPBOX_TOKEN;

  return (
    <View style={styles.container}>
      {!tokenMissing && (
        <Mapbox.MapView
          style={styles.map}
          styleURL="mapbox://styles/mapbox/satellite-streets-v12"
          logoEnabled
          scaleBarEnabled={false}
          attributionEnabled
          compassEnabled={false}
          onDidFinishLoadingMap={() => setMapReady(true)}
        >
          <Mapbox.Camera
            ref={cameraRef}
            defaultSettings={{
              centerCoordinate: initialCenter,
              zoomLevel: permissionGranted ? 16 : FALLBACK_ZOOM,
            }}
          />

          {layerVisible.blocks && blocksGeojson && blocksGeojson.features?.length > 0 && (
            <Mapbox.ShapeSource
              id="blocks-src"
              shape={blocksGeojson}
              onPress={handleBlockPress}
              hitbox={{ width: 12, height: 12 }}
            >
              <Mapbox.FillLayer
                id="blocks-fill"
                style={{
                  fillColor: colors.primary,
                  fillOpacity: 0.30,
                }}
              />
              <Mapbox.LineLayer
                id="blocks-line"
                style={{
                  lineColor: '#FFFFFF',
                  lineWidth: 1.5,
                  lineOpacity: 0.95,
                }}
              />
            </Mapbox.ShapeSource>
          )}

          {/* Task badges — pill-shaped markers at each block's centroid.
              Rendered as <Mapbox.MarkerView> (real RN views) so we can use a
              true rounded-rectangle pill — Mapbox's native layers only do
              circles or raster icons. Active = olive, inactive = grey. Tap
              opens the block sheet (same as tapping the polygon). */}
          {layerVisible.tasks && taskBadgeFeatures.features.map((feat) => (
            <Mapbox.MarkerView
              key={`task-badge-${feat.properties.block_id}`}
              coordinate={feat.geometry.coordinates}
              anchor={{ x: 0.5, y: 0.5 }}
              allowOverlap
            >
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => handleTaskBadgePress({ features: [feat] })}
                style={[
                  styles.taskPill,
                  !feat.properties.has_active && styles.taskPillInactive,
                ]}
                hitSlop={6}
              >
                <Text style={styles.taskPillIcon}>☑</Text>
                <Text style={styles.taskPillCount}>{feat.properties.task_count}</Text>
              </TouchableOpacity>
            </Mapbox.MarkerView>
          ))}

          {/* Asset pins. Categories drive fill colour; white halo for legibility
              over satellite. Polygon/line geometries render as outlined shapes;
              points render as filled circles. Tap → AssetDetail. */}
          {layerVisible.assets && assetsGeojson && assetsGeojson.features?.length > 0 && (
            <Mapbox.ShapeSource
              id="assets-src"
              shape={assetsGeojson}
              onPress={handleAssetPress}
              hitbox={{ width: 16, height: 16 }}
            >
              <Mapbox.CircleLayer
                id="assets-circle"
                filter={['==', ['geometry-type'], 'Point']}
                style={{
                  circleColor: ASSET_COLOR_BY_CATEGORY,
                  circleRadius: 7,
                  circleStrokeColor: '#FFFFFF',
                  circleStrokeWidth: 2,
                  circleOpacity: 0.95,
                }}
              />
              <Mapbox.FillLayer
                id="assets-fill"
                filter={[
                  'any',
                  ['==', ['geometry-type'], 'Polygon'],
                  ['==', ['geometry-type'], 'MultiPolygon'],
                ]}
                style={{
                  fillColor: ASSET_COLOR_BY_CATEGORY,
                  fillOpacity: 0.20,
                }}
              />
              <Mapbox.LineLayer
                id="assets-line"
                filter={[
                  'any',
                  ['==', ['geometry-type'], 'Polygon'],
                  ['==', ['geometry-type'], 'MultiPolygon'],
                  ['==', ['geometry-type'], 'LineString'],
                  ['==', ['geometry-type'], 'MultiLineString'],
                ]}
                style={{
                  lineColor: ASSET_COLOR_BY_CATEGORY,
                  lineWidth: 2,
                  lineOpacity: 0.9,
                }}
              />
            </Mapbox.ShapeSource>
          )}

          {/* Risk markers. Level → colour (green/amber/orange/red). Area-risks
              render as outlined polygons; point-risks render as larger pins
              than assets (8px) to stand out as safety information. */}
          {layerVisible.risks && risksGeojson && risksGeojson.features?.length > 0 && (
            <Mapbox.ShapeSource
              id="risks-src"
              shape={risksGeojson}
              onPress={handleRiskPress}
              hitbox={{ width: 18, height: 18 }}
            >
              <Mapbox.FillLayer
                id="risks-fill"
                filter={[
                  'any',
                  ['==', ['geometry-type'], 'Polygon'],
                  ['==', ['geometry-type'], 'MultiPolygon'],
                ]}
                style={{
                  fillColor: RISK_COLOR_BY_LEVEL,
                  fillOpacity: 0.20,
                }}
              />
              <Mapbox.LineLayer
                id="risks-line"
                filter={[
                  'any',
                  ['==', ['geometry-type'], 'Polygon'],
                  ['==', ['geometry-type'], 'MultiPolygon'],
                ]}
                style={{
                  lineColor: RISK_COLOR_BY_LEVEL,
                  lineWidth: 2.5,
                  lineOpacity: 0.95,
                }}
              />
              {/* Coloured disc with white "!" overlay. Mapbox's
                  satellite-streets-v12 sprite doesn't ship Maki SDF icons, so
                  we compose the warning visual with a circle + text rather
                  than relying on `iconImage: 'danger'`. */}
              <Mapbox.CircleLayer
                id="risks-circle"
                filter={['==', ['geometry-type'], 'Point']}
                style={{
                  circleColor: RISK_COLOR_BY_LEVEL,
                  circleRadius: 11,
                  circleStrokeColor: '#FFFFFF',
                  circleStrokeWidth: 2,
                  circleOpacity: 0.95,
                }}
              />
              <Mapbox.SymbolLayer
                id="risks-bang"
                filter={['==', ['geometry-type'], 'Point']}
                style={{
                  textField: '!',
                  textColor: '#FFFFFF',
                  textSize: 15,
                  textFont: ['Open Sans Bold', 'Arial Unicode MS Bold'],
                  textIgnorePlacement: true,
                  textAllowOverlap: true,
                  textHaloColor: 'rgba(0,0,0,0.25)',
                  textHaloWidth: 0.6,
                }}
              />
            </Mapbox.ShapeSource>
          )}

          {/* GPS track polyline. Renders either the live track (auto from
              useLiveGpsTrack polling) or a historical track (loaded once via
              viewTaskId route param). Drawn last so it sits above all data
              layers. */}
          {displayTrack && displayTrack.geometry && (
            <Mapbox.ShapeSource id="display-track-src" shape={displayTrack}>
              <Mapbox.LineLayer
                id="display-track-line"
                style={{
                  lineColor: colors.trackBlue,
                  lineWidth: 4,
                  lineCap: 'round',
                  lineJoin: 'round',
                  lineOpacity: 0.95,
                }}
              />
            </Mapbox.ShapeSource>
          )}

          {permissionGranted && (
            <Mapbox.UserLocation visible animated androidRenderMode="normal" />
          )}
        </Mapbox.MapView>
      )}

      {tokenMissing && (
        <View style={[styles.container, styles.centered]}>
          <Feather name="alert-triangle" size={28} color={colors.warningDark} />
          <Text style={styles.bootText}>Mapbox token not loaded.</Text>
          <Text style={styles.bootHint}>
            Build the app via EAS (the public token is injected from EAS env).
            Expo Go won't render the map.
          </Text>
        </View>
      )}

      {permissionGranted === false && !tokenMissing && (
        <View style={styles.banner}>
          <Feather name="map-pin" size={14} color={colors.warningDark} />
          <Text style={styles.bannerText}>
            Location permission denied — the recenter button is disabled.
          </Text>
        </View>
      )}

      {/* Property pill — top-left, matches Home's pill style + behaviour.
          Renders when a property is selected; tap opens the picker if there's
          more than one property to choose from (or one + the All option for
          managers/admins). Suppressed while the historical-track viewing pill
          takes the same slot. */}
      {!tokenMissing && !viewTaskId && properties.length > 0 && (
        <TouchableOpacity
          style={styles.propertyPill}
          onPress={() => (properties.length > 1 || isManagerOrAbove) && setPropertyPickerOpen(true)}
          activeOpacity={(properties.length > 1 || isManagerOrAbove) ? 0.7 : 1}
          accessibilityLabel="Switch property"
        >
          <Feather
            name={selectedPropertyId === null ? 'globe' : 'map-pin'}
            size={15}
            color={colors.primary}
          />
          <Text style={styles.propertyPillName} numberOfLines={1}>
            {selectedPropertyId === null ? 'All properties' : (selectedProperty?.name || '—')}
          </Text>
          {(properties.length > 1 || isManagerOrAbove) && (
            <Feather name="chevron-down" size={15} color={colors.textMuted} />
          )}
        </TouchableOpacity>
      )}

      {/* Historical-track viewing pill. Appears when navigated in with
          viewTaskId. Tap the close button to clear and return to normal map
          state. Hit target is generous (24 hitSlop + 28px touch surface) so
          fat-finger dismissals work reliably. */}
      {viewTaskId && (
        <View style={styles.viewingPill}>
          <Feather name="map" size={14} color="#FFFFFF" />
          <Text style={styles.viewingPillText} numberOfLines={1}>
            {viewingLoading
              ? 'Loading track…'
              : historicalTrack
                ? `Viewing: ${viewingTask?.title || viewingTask?.task_number || `Task #${viewTaskId}`}`
                : `No track recorded for ${viewingTask?.title || `Task #${viewTaskId}`}`}
          </Text>
          <TouchableOpacity
            onPress={dismissViewingTrack}
            hitSlop={24}
            style={styles.viewingPillClose}
            accessibilityLabel="Dismiss track view"
          >
            <Feather name="x" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      )}

{/* Layer status pills — bottom-left, stacked. Loading is brief on V1 data
          volumes; errors are sticky so the user knows the map is partial.
          Each pill renders independently so a slow assets fetch doesn't hide
          a block error. */}
      {!tokenMissing && (
        <View style={styles.statusPillStack} pointerEvents="none">
          {(blocksLoading || blocksError) && (
            <View style={[styles.statusPill, blocksError && styles.statusPillError]}>
              <Feather
                name={blocksError ? 'alert-triangle' : 'layers'}
                size={12}
                color={blocksError ? colors.dangerDark : colors.text}
              />
              <Text
                style={[styles.statusPillText, blocksError && styles.statusPillTextError]}
                numberOfLines={1}
              >
                {blocksError ? `Blocks: ${blocksError}` : 'Loading blocks…'}
              </Text>
            </View>
          )}
          {(assetsLoading || assetsError) && (
            <View style={[styles.statusPill, assetsError && styles.statusPillError]}>
              <Feather
                name={assetsError ? 'alert-triangle' : 'package'}
                size={12}
                color={assetsError ? colors.dangerDark : colors.text}
              />
              <Text
                style={[styles.statusPillText, assetsError && styles.statusPillTextError]}
                numberOfLines={1}
              >
                {assetsError ? `Assets: ${assetsError}` : 'Loading assets…'}
              </Text>
            </View>
          )}
          {(risksLoading || risksError) && (
            <View style={[styles.statusPill, risksError && styles.statusPillError]}>
              <Feather
                name={risksError ? 'alert-triangle' : 'alert-octagon'}
                size={12}
                color={risksError ? colors.dangerDark : colors.text}
              />
              <Text
                style={[styles.statusPillText, risksError && styles.statusPillTextError]}
                numberOfLines={1}
              >
                {risksError ? `Risks: ${risksError}` : 'Loading risks…'}
              </Text>
            </View>
          )}
        </View>
      )}

      <TouchableOpacity
        style={[styles.recenter, !permissionGranted && styles.recenterDisabled]}
        onPress={recenter}
        disabled={!permissionGranted}
        accessibilityLabel="Recenter map on my location"
      >
        <Feather
          name="crosshair"
          size={22}
          color={permissionGranted ? colors.primary : colors.textMuted}
        />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.layersBtn}
        onPress={() => setLayerSheetOpen(true)}
        accessibilityLabel="Toggle map layers"
      >
        <Feather name="layers" size={22} color={colors.primary} />
      </TouchableOpacity>

      <MapLayerSheet
        visible={layerSheetOpen}
        layers={layerVisible}
        onToggle={toggleLayer}
        onClose={() => setLayerSheetOpen(false)}
      />

      <MapBlockSheet
        visible={!!selectedBlock}
        block={selectedBlock}
        tasks={selectedBlock ? getBlockTasks(selectedBlock.id) : []}
        onClose={() => setSelectedBlock(null)}
        onTaskPress={handleSheetTaskPress}
        onViewAllTasks={handleSheetViewAll}
      />

      <MapRiskSheet
        visible={!!selectedRisk}
        risk={selectedRisk}
        onClose={() => setSelectedRisk(null)}
      />

      <MapAssetSheet
        visible={!!selectedAsset}
        asset={selectedAsset}
        onClose={handleAssetSheetClose}
        onViewDetails={handleSheetAssetDetails}
      />

      {/* Property picker — same flat list pattern as HomeScreen so the two
          places the user switches property feel identical. Manager+ users get
          an "All properties" entry at the top that drops the property filter
          across blocks / assets / risks / tasks. */}
      <Modal visible={propertyPickerOpen} transparent animationType="fade">
        <Pressable
          style={styles.pickerOverlay}
          onPress={() => setPropertyPickerOpen(false)}
        >
          <Pressable
            style={[styles.pickerSheet, { paddingBottom: spacing.xl + insets.bottom }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.pickerHandle} />
            <Text style={styles.pickerTitle}>Switch property</Text>
            {isManagerOrAbove && (
              <TouchableOpacity
                style={styles.pickerItem}
                onPress={() => {
                  setSelectedPropertyId(null);
                  setPropertyPickerOpen(false);
                }}
              >
                <Feather
                  name={selectedPropertyId === null ? 'check-circle' : 'globe'}
                  size={18}
                  color={selectedPropertyId === null ? colors.success : colors.textMuted}
                />
                <Text style={styles.pickerItemName}>All properties</Text>
              </TouchableOpacity>
            )}
            <FlatList
              data={properties}
              keyExtractor={(p) => String(p.id)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.pickerItem}
                  onPress={() => {
                    setSelectedPropertyId(item.id);
                    setPropertyPickerOpen(false);
                  }}
                >
                  <Feather
                    name={item.id === selectedPropertyId ? 'check-circle' : 'circle'}
                    size={18}
                    color={item.id === selectedPropertyId ? colors.success : colors.textMuted}
                  />
                  <Text style={styles.pickerItemName}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  map: {
    flex: 1,
  },
  bootText: {
    marginTop: 8,
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  bootHint: {
    marginTop: 4,
    textAlign: 'center',
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
    maxWidth: 280,
  },
  banner: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: colors.warningBg,
    borderColor: colors.warningBorder,
    borderWidth: 1,
    borderRadius: 8,
  },
  bannerText: {
    color: colors.warningDark,
    fontSize: 12,
    flex: 1,
  },
  recenter: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  recenterDisabled: {
    opacity: 0.5,
  },
  layersBtn: {
    position: 'absolute',
    right: 16,
    top: 60,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  viewingPill: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 70,  // clears the layers FAB at top-right
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.trackBlueDark,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  propertyPill: {
    position: 'absolute',
    top: 12,
    left: 12,
    maxWidth: '60%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  propertyPillName: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
    maxWidth: 160,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    // paddingBottom is applied inline so we can add the Android gesture-bar inset
    maxHeight: '70%',
  },
  pickerHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center', marginBottom: spacing.md,
  },
  pickerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  pickerItemName: {
    fontSize: fontSize.base,
    color: colors.text,
    flex: 1,
  },
  viewingPillText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  viewingPillClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  taskPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: colors.primary,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  taskPillInactive: {
    backgroundColor: colors.textMuted,
  },
  taskPillIcon: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
  taskPillCount: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
  statusPillStack: {
    position: 'absolute',
    left: 16,
    bottom: 32,
    gap: 6,
    maxWidth: 240,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: colors.surface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  statusPillError: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
  },
  statusPillText: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '500',
  },
  statusPillTextError: {
    color: colors.dangerDark,
  },
});
