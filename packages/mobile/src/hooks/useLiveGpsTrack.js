// hooks/useLiveGpsTrack.js — Polls for any task currently GPS-tracking and
// fetches its track geojson while active. Single interval drives both:
//   1. Look at the visible task list for `gps_tracking_active === true`
//   2. If found, fetch /tasks/{id}/gps/track/geojson (a single Feature)
//
// Returns:
//   activeTask — { id, title, task_number, ... } | null
//   track     — GeoJSON Feature (LineString) | null
//   error     — last error message, if any
//
// 404 from the track endpoint is treated as "no points yet" — common in the
// first few seconds of a track — and silently ignored.

import { useCallback, useEffect, useRef, useState } from 'react';
import { tasksService } from '../api/services';

const POLL_INTERVAL_MS = 6000;

function findActiveTask(tasks) {
  if (!Array.isArray(tasks)) return null;
  return tasks.find(t => t?.gps_tracking_active === true) || null;
}

export default function useLiveGpsTrack({ enabled = true } = {}) {
  const [activeTask, setActiveTask] = useState(null);
  const [track, setTrack] = useState(null);
  const [error, setError] = useState(null);
  const cancelRef = useRef(false);

  const tick = useCallback(async () => {
    try {
      // Pull the task list once per tick. Cheap enough at V1 customer scale
      // (limit:500, property-scoped server-side). When a dedicated
      // /tasks/active-gps endpoint lands later, swap this single call.
      const list = await tasksService.getTasks({ limit: 500 });
      if (cancelRef.current) return;
      const found = findActiveTask(list);
      setActiveTask(prev => {
        if (!found) return null;
        if (prev?.id === found.id) return prev; // same task, avoid spurious renders
        return found;
      });
      setError(null);

      if (!found) {
        setTrack(null);
        return;
      }
      try {
        const feature = await tasksService.getGpsTrackGeojson(found.id);
        if (cancelRef.current) return;
        setTrack(feature && feature.geometry ? feature : null);
      } catch (trackErr) {
        if (trackErr?.response?.status === 404) {
          // No track points yet — normal at the start of a recording.
          setTrack(null);
        } else {
          console.warn('[useLiveGpsTrack] track fetch failed', trackErr?.message);
          setTrack(null);
        }
      }
    } catch (err) {
      if (cancelRef.current) return;
      console.warn('[useLiveGpsTrack] tick failed', err?.message);
      setError(err?.message || 'Failed to check GPS state');
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    cancelRef.current = false;
    tick(); // immediate first run; setInterval doesn't fire instantly
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelRef.current = true;
      clearInterval(id);
    };
  }, [enabled, tick]);

  return { activeTask, track, error };
}
