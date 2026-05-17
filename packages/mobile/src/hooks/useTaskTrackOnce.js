// hooks/useTaskTrackOnce.js — One-shot fetch of a task's GPS track + task
// metadata. Used by the Map when navigated to with a viewTaskId param so we
// can render a completed track as a static polyline (vs. useLiveGpsTrack
// which polls).
//
// Returns:
//   track   — GeoJSON Feature (LineString) | null
//   task    — full Task row | null (used for the "Viewing: <name>" pill)
//   loading — true while either request is in flight
//
// 404 on the track endpoint = no recorded points; surfaces as track=null
// (the task itself still loads so we can render a meaningful empty state).

import { useEffect, useState } from 'react';
import { tasksService } from '../api/services';

export default function useTaskTrackOnce(taskId) {
  const [track, setTrack] = useState(null);
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!taskId) {
      setTrack(null);
      setTask(null);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      tasksService.getGpsTrackGeojson(taskId).catch((err) => {
        if (err?.response?.status !== 404) {
          console.warn('[useTaskTrackOnce] track fetch failed', err?.message);
        }
        return null;
      }),
      tasksService.getTask(taskId).catch((err) => {
        console.warn('[useTaskTrackOnce] task fetch failed', err?.message);
        return null;
      }),
    ]).then(([feature, taskData]) => {
      if (cancelled) return;
      setTrack(feature && feature.geometry ? feature : null);
      setTask(taskData);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [taskId]);

  return { track, task, loading };
}
