// mobile/src/components/ConditionsHero.js
// Hero card for the Home screen. Top band = static satellite-map preview of
// the active property with block polygons + task-count badges. Bottom band =
// date · time · greeting · status badge · 4-up weather strip.
//
// The map is non-interactive (scroll/zoom/pitch/rotate disabled). Tapping the
// whole card navigates to the Map tab. Avoids the previous photo+gradient
// stack which crashed on Android.
//
// Usage:
//   <ConditionsHero
//     firstName={user?.first_name ?? 'there'}
//     weather={{ temp, humidity, windKmh, gustKmh, rainMmNextHour }}
//     onPress={() => navigation.navigate('Map')}
//   />

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Constants from 'expo-constants';
import Mapbox from '@rnmapbox/maps';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, radius, shadows } from '../styles/theme';
import { phaseOf, greetingOf, statusBadgeFor } from '../utils/tod';
import useBlockGeojson from '../hooks/useBlockGeojson';
import useTasksByBlock from '../hooks/useTasksByBlock';
import useForecast from '../hooks/useForecast';
import { useProperty } from '../contexts/PropertyContext';
import { geojsonBbox, bboxToCameraBounds } from '../utils/geoBounds';

function hasForecastPoint(p) {
  return p && p.forecast_latitude != null && p.forecast_longitude != null;
}

// Module-load Mapbox token init. Mirror MapScreen — if the public token isn't
// in EAS env (e.g. Expo Go), the map renders inert and the card falls back to
// a flat colour block. App doesn't crash either way.
const MAPBOX_TOKEN = Constants.expoConfig?.extra?.mapboxPublicToken || '';
if (MAPBOX_TOKEN) {
  try { Mapbox.setAccessToken(MAPBOX_TOKEN); } catch {}
}

// Fallback camera position when the user has no blocks yet (or geojson hasn't
// loaded). Nelson/Tasman — matches MapScreen.
const FALLBACK_CENTER = [173.28, -41.27];
const FALLBACK_ZOOM = 5;

const DATE_FORMAT = { weekday: 'long', day: 'numeric', month: 'short' };

function formatDateLine(d) {
  const datePart = d.toLocaleDateString('en-NZ', DATE_FORMAT);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${datePart} · ${h}:${m}`;
}

export default function ConditionsHero({
  firstName = 'there',
  onPress,
}) {
  const { properties, selectedPropertyId, selectedProperty } = useProperty();

  // Auto-pick the property that drives the weather strip:
  //   1. If the active property has a forecast point set, use it.
  //   2. Otherwise (covers "All properties" + properties with no point yet),
  //      find the first property in the list that has a forecast point.
  //   3. If none exist, pass null — useForecast returns error 'no_point' and
  //      the strip shows em-dashes.
  // This means the weather strip stays populated for managers viewing "All
  // properties" as long as at least one property in their scope is configured.
  const forecastPropertyId = useMemo(() => {
    if (hasForecastPoint(selectedProperty)) return selectedPropertyId;
    const fallback = (properties || []).find(hasForecastPoint);
    return fallback?.id ?? null;
  }, [selectedProperty, selectedPropertyId, properties]);

  const { current: forecastCurrent } = useForecast(forecastPropertyId);

  // Map the backend's flat forecast shape into the prop shape the rest of the
  // hero already uses. Falls back to em-dashes via `fmt()` when null.
  const weather = useMemo(() => (forecastCurrent ? {
    temp: forecastCurrent.temperature_c,
    humidity: forecastCurrent.humidity_pct,
    windKmh: forecastCurrent.wind_speed_kmh,
    gustKmh: forecastCurrent.wind_gust_kmh,
    rainMmNextHour: forecastCurrent.precipitation_mm_h ?? 0,
  } : {}), [forecastCurrent]);
  const [now, setNow] = useState(() => new Date());
  const cameraRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [didFit, setDidFit] = useState(false);

  // re-evaluate the clock every 60s and on focus — drives the date/time line
  // and the status badge's TOD precedence rule (LIGHT FADING after sunset).
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(id);
  }, []);
  useFocusEffect(useCallback(() => { setNow(new Date()); }, []));

  const phase = phaseOf(now);
  const badge = statusBadgeFor(weather, phase);
  const greeting = greetingOf(phase, firstName);
  const dateLine = formatDateLine(now);

  // Block layer for the map preview. Scoped by the active property; when "All
  // properties" is selected the camera fits to every visible block.
  const { data: blocksGeojson } = useBlockGeojson(selectedPropertyId);
  const { tasksByBlock } = useTasksByBlock();

  // Task badges — block centroids that have any task. Same data path as the
  // full Map screen (active = scheduled/ready/in_progress, otherwise inactive)
  // so the colour cue is consistent across home + map.
  const OPEN_STATUSES = useMemo(() => new Set(['scheduled', 'ready', 'in_progress']), []);
  const taskBadges = useMemo(() => {
    if (!blocksGeojson?.features?.length) return [];
    const out = [];
    for (const block of blocksGeojson.features) {
      const props = block.properties || {};
      const tasks = tasksByBlock[props.id];
      if (!tasks?.length) continue;
      const lng = props.centroid_longitude;
      const lat = props.centroid_latitude;
      if (typeof lng !== 'number' || typeof lat !== 'number') continue;
      out.push({
        blockId: props.id,
        coordinate: [lng, lat],
        count: tasks.length,
        hasActive: tasks.some((t) => OPEN_STATUSES.has(t.status)),
      });
    }
    return out;
  }, [blocksGeojson, tasksByBlock, OPEN_STATUSES]);

  // Fit the camera to the property's blocks once the map is ready + data has
  // arrived. Same readiness gate as MapScreen to avoid Android's "command
  // dropped before onDidFinishLoadingMap" bug.
  //
  // Slight overzoom: shrink the bbox ~12% toward its centre before fitting.
  // Cropping a sliver off the edges reads as "one zoom point in from full
  // view" without forcing the user to do math on zoomLevel. Works the same
  // on iOS + Android (negative padding is finicky on Android).
  const blocksBounds = useMemo(() => {
    const bbox = geojsonBbox(blocksGeojson);
    if (!bbox) return null;
    const [w, s, e, n] = bbox;
    const cx = (w + e) / 2;
    const cy = (s + n) / 2;
    const k = 0.88; // 12% tighter
    return {
      ne: [cx + (e - cx) * k, cy + (n - cy) * k],
      sw: [cx + (w - cx) * k, cy + (s - cy) * k],
    };
  }, [blocksGeojson]);

  // Reset the fit flag when the property switches so the camera moves to the
  // new property's blocks.
  useEffect(() => { setDidFit(false); }, [selectedPropertyId]);

  useEffect(() => {
    if (didFit) return;
    if (!mapReady || !blocksBounds || !cameraRef.current) return;
    cameraRef.current.fitBounds(
      blocksBounds.ne,
      blocksBounds.sw,
      [12, 12, 12, 12], // tight padding — preview band is only 140px
      0,                 // no animation — static feel
    );
    setDidFit(true);
  }, [mapReady, blocksBounds, didFit]);

  const tokenMissing = !MAPBOX_TOKEN;
  const hasBlocks = !!blocksGeojson?.features?.length;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={onPress ? 0.85 : 1}
      disabled={!onPress}
    >
      {/* Map preview band */}
      <View style={styles.mapBand} pointerEvents="none">
        {!tokenMissing ? (
          <Mapbox.MapView
            style={styles.map}
            styleURL="mapbox://styles/mapbox/satellite-streets-v12"
            logoEnabled={false}
            scaleBarEnabled={false}
            attributionEnabled={false}
            compassEnabled={false}
            scrollEnabled={false}
            zoomEnabled={false}
            pitchEnabled={false}
            rotateEnabled={false}
            onDidFinishLoadingMap={() => setMapReady(true)}
          >
            <Mapbox.Camera
              ref={cameraRef}
              defaultSettings={{
                centerCoordinate: FALLBACK_CENTER,
                zoomLevel: FALLBACK_ZOOM,
              }}
            />
            {hasBlocks && (
              <Mapbox.ShapeSource id="hero-blocks-src" shape={blocksGeojson}>
                <Mapbox.FillLayer
                  id="hero-blocks-fill"
                  style={{ fillColor: colors.olive, fillOpacity: 0.35 }}
                />
                <Mapbox.LineLayer
                  id="hero-blocks-line"
                  style={{ lineColor: '#FFFFFF', lineWidth: 1.5, lineOpacity: 0.95 }}
                />
              </Mapbox.ShapeSource>
            )}
            {/* Task pills — rounded oval with ☑ + count. Matches the full
                Map tab's MarkerView styling so the visual reads identically.
                Non-interactive (band has pointerEvents="none"); the whole
                card handles the tap → Map nav. */}
            {taskBadges.map((b) => (
              <Mapbox.MarkerView
                key={`hero-task-${b.blockId}`}
                coordinate={b.coordinate}
                anchor={{ x: 0.5, y: 0.5 }}
                allowOverlap
              >
                <View style={[styles.taskPill, !b.hasActive && styles.taskPillInactive]}>
                  <Text style={styles.taskPillIcon}>☑</Text>
                  <Text style={styles.taskPillCount}>{b.count}</Text>
                </View>
              </Mapbox.MarkerView>
            ))}
          </Mapbox.MapView>
        ) : (
          // Token missing (Expo Go etc.) — flat olive block with a hint. Still
          // visually distinct from the content band so the card reads as a hero.
          <View style={[styles.map, styles.mapFallback]}>
            <Feather name="map" size={20} color={colors.white} />
            <Text style={styles.mapFallbackText}>Map preview unavailable</Text>
          </View>
        )}

        {/* Empty-state overlay — visible when the property has no blocks yet.
            Sits on top of the map so the user sees what's missing rather than
            an empty satellite tile. */}
        {!tokenMissing && !hasBlocks && (
          <View style={styles.emptyOverlay}>
            <Text style={styles.emptyText}>No blocks on this property yet</Text>
          </View>
        )}
      </View>

      {/* Content band */}
      <View style={styles.content}>
        <View style={styles.contentRow}>
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.dateLine}>{dateLine}</Text>
            <Text style={styles.greeting} numberOfLines={1}>{greeting}</Text>
          </View>

          <View style={[styles.badge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
            <View style={[styles.badgeDot, { backgroundColor: badge.dot }]} />
            <Text style={[styles.badgeText, { color: badge.text }]}>{badge.label}</Text>
          </View>
        </View>

        {/* Weather strip */}
        <View style={styles.weatherStrip}>
          <WeatherCell icon="thermometer" value={fmt(weather.temp, '°')} label="Temp" />
          <WeatherCell icon="droplet" value={fmt(weather.humidity, '%')} label="Humid" />
          <WeatherCell icon="wind" value={fmt(weather.windKmh)} label="km/h" />
          <WeatherCell icon="cloud-rain" value={fmt(weather.rainMmNextHour ?? 0, '', 1)} label="mm" />
        </View>
      </View>
    </TouchableOpacity>
  );
}

function WeatherCell({ icon, value, label }) {
  return (
    <View style={styles.cell}>
      <Feather name={icon} size={18} color={colors.olive} />
      <Text style={styles.cellValue}>{value}</Text>
      <Text style={styles.cellLabel}>{label}</Text>
    </View>
  );
}

function fmt(n, suffix = '', decimals = 0) {
  if (n == null || Number.isNaN(n)) return '—';
  return Number(n).toFixed(decimals) + suffix;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginHorizontal: spacing.base,
    marginTop: spacing.base,
    ...shadows.card,
  },
  mapBand: {
    height: 140,
    backgroundColor: colors.olive,
    position: 'relative',
  },
  map: { flex: 1 },
  mapFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  mapFallbackText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.9,
  },
  emptyOverlay: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
  },
  emptyText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  content: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14 },
  contentRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  dateLine: { fontSize: 13, color: colors.textMuted, fontWeight: '500' },
  greeting: {
    fontSize: 20, fontWeight: '700', color: colors.text,
    letterSpacing: -0.2, marginTop: 2,
  },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
    borderWidth: 1, flexShrink: 0,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },

  // Task pill — mirrors MapScreen.styles.taskPill so home + map read identically.
  // Slightly smaller padding to suit the 140px preview band.
  taskPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
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
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
  taskPillCount: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 14,
  },

  weatherStrip: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, gap: 4 },
  cell: { flex: 1, alignItems: 'center', gap: 2 },
  cellValue: {
    fontSize: 17, fontWeight: '700', color: colors.text,
    lineHeight: 17, marginTop: 4,
  },
  cellLabel: {
    fontSize: 10, fontWeight: '600', color: colors.textMuted,
    letterSpacing: 0.3, textTransform: 'uppercase',
  },
});
