// maps-v2/utils/cameraPath.js — Keyframe-based camera path interpolation for 3D flyovers
import * as turf from '@turf/turf';

/**
 * Catmull-Rom interpolation between 4 values at parameter t (0..1).
 */
function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

/**
 * Smoothly interpolate between two angles (in degrees), handling wrap-around.
 */
function lerpAngle(a, b, t) {
  let diff = ((b - a + 540) % 360) - 180;
  return a + diff * t;
}

/**
 * Linear interpolation.
 */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Apply ease-in-out to a linear progress value.
 */
export function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

/**
 * A keyframe captures the full camera state at a point in time.
 * @typedef {{
 *   center: [number, number],  // [lng, lat]
 *   zoom: number,
 *   pitch: number,
 *   bearing: number,
 *   label?: string,
 * }} Keyframe
 */

/**
 * Interpolate between keyframes using Catmull-Rom for position
 * and smooth lerp for zoom/pitch/bearing.
 *
 * @param {Keyframe[]} keyframes — at least 2 keyframes
 * @param {number} samplesPerSegment — frames between each keyframe pair
 * @returns {Array<{lng: number, lat: number, zoom: number, pitch: number, bearing: number, progress: number}>}
 */
export function interpolateKeyframes(keyframes, samplesPerSegment = 60) {
  if (keyframes.length < 2) return [];

  // Pad start/end for Catmull-Rom
  const kfs = [keyframes[0], ...keyframes, keyframes[keyframes.length - 1]];
  const totalSegments = kfs.length - 3;
  const frames = [];

  for (let seg = 0; seg < totalSegments; seg++) {
    const k0 = kfs[seg];
    const k1 = kfs[seg + 1];
    const k2 = kfs[seg + 2];
    const k3 = kfs[seg + 3];

    for (let s = 0; s < samplesPerSegment; s++) {
      const t = s / samplesPerSegment;
      const globalProgress =
        (seg * samplesPerSegment + s) / (totalSegments * samplesPerSegment);

      // Catmull-Rom for position (smooth curve through centers)
      const lng = catmullRom(
        k0.center[0], k1.center[0], k2.center[0], k3.center[0], t,
      );
      const lat = catmullRom(
        k0.center[1], k1.center[1], k2.center[1], k3.center[1], t,
      );

      // Linear lerp for zoom, pitch (these feel better linear between keyframes)
      const zoom = lerp(k1.zoom, k2.zoom, t);
      const pitch = lerp(k1.pitch, k2.pitch, t);

      // Angle lerp for bearing (handles 359° -> 1° correctly)
      const bearing = lerpAngle(k1.bearing, k2.bearing, t);

      frames.push({ lng, lat, zoom, pitch, bearing, progress: globalProgress });
    }
  }

  // Add final keyframe
  const last = keyframes[keyframes.length - 1];
  frames.push({
    lng: last.center[0],
    lat: last.center[1],
    zoom: last.zoom,
    pitch: last.pitch,
    bearing: last.bearing,
    progress: 1,
  });

  return frames;
}

/**
 * Convert keyframes to GeoJSON for rendering path preview on the map.
 *
 * @param {Keyframe[]} keyframes
 * @returns {object} GeoJSON FeatureCollection
 */
export function keyframesToGeoJSON(keyframes) {
  const features = [];

  // Keyframe markers
  keyframes.forEach((kf, i) => {
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: kf.center },
      properties: {
        index: i,
        label: `${i + 1}`,
        zoom: kf.zoom?.toFixed(1),
        pitch: Math.round(kf.pitch),
        bearing: Math.round(kf.bearing),
      },
    });
  });

  // Line connecting keyframes
  if (keyframes.length >= 2) {
    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: keyframes.map((kf) => kf.center),
      },
      properties: { type: 'path' },
    });
  }

  return { type: 'FeatureCollection', features };
}

/**
 * Convert interpolated frames to a GeoJSON LineString for the smooth preview curve.
 *
 * @param {Array<{lng: number, lat: number}>} frames
 * @returns {object|null} GeoJSON Feature
 */
export function framesToPreviewLine(frames) {
  if (frames.length < 2) return null;
  return {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: frames.map((f) => [f.lng, f.lat]),
    },
    properties: { type: 'preview' },
  };
}

/**
 * Generate orbit keyframes around a center point.
 * Each keyframe looks inward at the center.
 *
 * @param {number[]} center — [lng, lat]
 * @param {number} radiusKm
 * @param {number} zoom
 * @param {number} pitch
 * @param {number} points — number of keyframes
 * @returns {Keyframe[]}
 */
export function generateOrbitKeyframes(center, radiusKm = 0.5, zoom = 14, pitch = 55, points = 8) {
  const keyframes = [];
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * 360;
    const dest = turf.destination(
      turf.point(center), radiusKm, angle, { units: 'kilometers' },
    );
    // Bearing should point from orbit position toward center
    const bearing = turf.bearing(
      turf.point(dest.geometry.coordinates),
      turf.point(center),
    );
    keyframes.push({
      center: dest.geometry.coordinates,
      zoom,
      pitch,
      bearing,
      label: `Orbit ${i + 1}`,
    });
  }
  return keyframes;
}
