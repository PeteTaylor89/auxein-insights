// hooks/useLiveLocalTrack.js — Live GPS trail sourced from the local
// useGpsTracking module (NOT the backend).
//
// Why local: the backend `/tasks/{id}/gps/track/geojson` endpoint builds the
// LineString from TaskGPSSummary, which is only populated at stop/reprocess
// time — so it 404s during a live recording. The useGpsTracking module
// retains every accepted (Kalman-filtered) point in memory and exposes a
// subscription API; this hook is just the React adapter.
//
// Returns:
//   active      — true while a recording is in progress
//   coordinates — [[lon, lat], ...] in capture order
//   lastCoord   — most recent point, or null
//   feature     — GeoJSON LineString Feature suitable for <Mapbox.ShapeSource>,
//                 or null when fewer than 2 points exist (Mapbox renders a
//                 1-point LineString as an empty path)

import { useEffect, useMemo, useState } from 'react';
import { subscribeToLiveTrack } from './useGpsTracking';

export default function useLiveLocalTrack() {
  const [state, setState] = useState(() => ({ coordinates: [], active: false }));

  useEffect(() => {
    const unsub = subscribeToLiveTrack(setState);
    return unsub;
  }, []);

  const { coordinates, active } = state;
  const lastCoord = coordinates.length ? coordinates[coordinates.length - 1] : null;

  const feature = useMemo(() => {
    if (!coordinates || coordinates.length < 2) return null;
    return {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates },
      properties: { live: true, point_count: coordinates.length },
    };
  }, [coordinates]);

  return { active, coordinates, lastCoord, feature };
}
