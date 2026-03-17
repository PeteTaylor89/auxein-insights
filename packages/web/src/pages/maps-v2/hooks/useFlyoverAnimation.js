// maps-v2/hooks/useFlyoverAnimation.js — Keyframe-based 3D flyover with pre-rendering
import { useState, useCallback, useRef, useEffect } from 'react';
import {
  interpolateKeyframes,
  easeInOut,
  keyframesToGeoJSON,
  framesToPreviewLine,
  generateOrbitKeyframes,
} from '../utils/cameraPath';
import {
  TERRAIN_SOURCE,
  SKY_LAYER,
  DEFAULT_TERRAIN_EXAGGERATION,
} from '../utils/mapStyles';

const PATH_SOURCE = 'flyover-path';
const PREVIEW_SOURCE = 'flyover-preview';
const PATH_LINE_LAYER = 'flyover-path-line';
const PATH_POINTS_LAYER = 'flyover-path-points';
const PATH_LABELS_LAYER = 'flyover-path-labels';
const PREVIEW_LINE_LAYER = 'flyover-preview-line';

/**
 * Hook: keyframe-based 3D flyover with tile pre-rendering.
 *
 * Flow: idle -> editing (add keyframes) -> previewing -> buffering -> playing/paused
 */
export default function useFlyoverAnimation(map, mapReady) {
  const [state, setState] = useState('idle');
  // idle | editing | previewing | buffering | playing | paused
  const [progress, setProgress] = useState(0);
  const [bufferProgress, setBufferProgress] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [exaggeration, setExaggeration] = useState(DEFAULT_TERRAIN_EXAGGERATION);
  const [keyframes, setKeyframes] = useState([]);
  const [duration, setDuration] = useState(20); // seconds

  const framesRef = useRef([]);
  const rafRef = useRef(null);
  const startTimeRef = useRef(null);
  const pausedAtRef = useRef(0);
  const savedCameraRef = useRef(null);
  const bufferAbortRef = useRef(false);

  // ---- Path preview layers ----

  const updatePathLayers = useCallback((kfs) => {
    if (!map) return;
    try {
      const geojson = keyframesToGeoJSON(kfs);

      const pathSrc = map.getSource(PATH_SOURCE);
      if (pathSrc) {
        pathSrc.setData(geojson);
      } else {
        map.addSource(PATH_SOURCE, { type: 'geojson', data: geojson });

        map.addLayer({
          id: PATH_LINE_LAYER,
          type: 'line',
          source: PATH_SOURCE,
          filter: ['==', ['get', 'type'], 'path'],
          paint: {
            'line-color': '#D1583B',
            'line-width': 2.5,
            'line-dasharray': [4, 3],
            'line-opacity': 0.8,
          },
        });

        map.addLayer({
          id: PATH_POINTS_LAYER,
          type: 'circle',
          source: PATH_SOURCE,
          filter: ['has', 'index'],
          paint: {
            'circle-radius': 9,
            'circle-color': '#D1583B',
            'circle-stroke-color': '#fff',
            'circle-stroke-width': 2.5,
          },
        });

        map.addLayer({
          id: PATH_LABELS_LAYER,
          type: 'symbol',
          source: PATH_SOURCE,
          filter: ['has', 'label'],
          layout: {
            'text-field': ['get', 'label'],
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
            'text-size': 11,
            'text-allow-overlap': true,
          },
          paint: { 'text-color': '#ffffff' },
        });
      }

      // Smooth preview curve
      if (kfs.length >= 2) {
        const frames = interpolateKeyframes(kfs, 30);
        const previewLine = framesToPreviewLine(frames);

        const previewSrc = map.getSource(PREVIEW_SOURCE);
        if (previewSrc) {
          previewSrc.setData(previewLine || { type: 'FeatureCollection', features: [] });
        } else {
          map.addSource(PREVIEW_SOURCE, {
            type: 'geojson',
            data: previewLine || { type: 'FeatureCollection', features: [] },
          });
          map.addLayer({
            id: PREVIEW_LINE_LAYER,
            type: 'line',
            source: PREVIEW_SOURCE,
            paint: {
              'line-color': '#5B6830',
              'line-width': 3,
              'line-opacity': 0.6,
            },
          });
        }
      }
    } catch (e) {
      console.warn('updatePathLayers error:', e);
    }
  }, [map]);

  const removePathLayers = useCallback(() => {
    if (!map) return;
    try {
      [PREVIEW_LINE_LAYER, PATH_LABELS_LAYER, PATH_POINTS_LAYER, PATH_LINE_LAYER].forEach((id) => {
        if (map.getLayer(id)) map.removeLayer(id);
      });
      [PATH_SOURCE, PREVIEW_SOURCE].forEach((id) => {
        if (map.getSource(id)) map.removeSource(id);
      });
    } catch (e) {
      console.warn('removePathLayers error:', e);
    }
  }, [map]);

  // Sync layers with keyframes while editing/previewing
  useEffect(() => {
    if (!map || !mapReady) return;
    if (state === 'editing' || state === 'previewing') {
      updatePathLayers(keyframes);
    }
  }, [map, mapReady, keyframes, state, updatePathLayers]);

  // ---- 3D terrain ----

  const enable3D = useCallback((m) => {
    try {
      if (!m.getSource(TERRAIN_SOURCE.id)) {
        m.addSource(TERRAIN_SOURCE.id, {
          type: TERRAIN_SOURCE.type,
          url: TERRAIN_SOURCE.url,
          tileSize: TERRAIN_SOURCE.tileSize,
          maxzoom: TERRAIN_SOURCE.maxzoom,
        });
      }
      m.setTerrain({ source: TERRAIN_SOURCE.id, exaggeration });
      if (!m.getLayer(SKY_LAYER.id)) {
        m.addLayer(SKY_LAYER);
      }
    } catch (e) {
      console.warn('enable3D error:', e);
    }
  }, [exaggeration]);

  useEffect(() => {
    if (!map || state === 'idle') return;
    try {
      if (map.getSource(TERRAIN_SOURCE.id)) {
        map.setTerrain({ source: TERRAIN_SOURCE.id, exaggeration });
      }
    } catch (e) {}
  }, [map, exaggeration, state]);

  // ---- Camera save/restore ----

  const saveCamera = useCallback((m) => {
    savedCameraRef.current = {
      center: m.getCenter().toArray(),
      zoom: m.getZoom(),
      pitch: m.getPitch(),
      bearing: m.getBearing(),
    };
  }, []);

  const restoreCamera = useCallback((m) => {
    if (savedCameraRef.current) {
      m.easeTo({ ...savedCameraRef.current, duration: 1000 });
    }
  }, []);

  // ---- Pre-render / buffer tiles ----

  const bufferTiles = useCallback(async (frames) => {
    if (!map) return false;
    bufferAbortRef.current = false;
    setBufferProgress(0);
    setState('buffering');

    // Sample ~40 evenly-spaced frames to pre-load tiles
    const sampleCount = Math.min(40, frames.length);
    const step = Math.max(1, Math.floor(frames.length / sampleCount));

    for (let i = 0; i < frames.length; i += step) {
      if (bufferAbortRef.current) return false;

      const frame = frames[i];
      map.jumpTo({
        center: [frame.lng, frame.lat],
        zoom: frame.zoom,
        pitch: frame.pitch,
        bearing: frame.bearing,
      });

      // Wait for map to finish loading tiles
      await new Promise((resolve) => {
        if (map.areTilesLoaded()) {
          resolve();
        } else {
          const onIdle = () => resolve();
          map.once('idle', onIdle);
          // Timeout after 3 seconds per frame to avoid hanging
          setTimeout(() => {
            map.off('idle', onIdle);
            resolve();
          }, 3000);
        }
      });

      setBufferProgress((i + step) / frames.length);
    }

    setBufferProgress(1);
    return !bufferAbortRef.current;
  }, [map]);

  // ---- Animation loop ----

  const animate = useCallback((timestamp) => {
    if (!map || state !== 'playing') return;

    if (!startTimeRef.current) {
      startTimeRef.current = timestamp - pausedAtRef.current;
    }

    const elapsed = (timestamp - startTimeRef.current) * speed;
    const totalDuration = duration * 1000;
    const rawProgress = Math.min(elapsed / totalDuration, 1);
    const easedProgress = easeInOut(rawProgress);

    const frames = framesRef.current;
    if (!frames.length) return;

    const frameIndex = Math.min(
      Math.floor(easedProgress * (frames.length - 1)),
      frames.length - 1,
    );
    const frame = frames[frameIndex];

    map.jumpTo({
      center: [frame.lng, frame.lat],
      zoom: frame.zoom,
      pitch: frame.pitch,
      bearing: frame.bearing,
    });

    setProgress(rawProgress);

    if (rawProgress >= 1) {
      setState('paused');
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      startTimeRef.current = null;
      pausedAtRef.current = 0;
      setProgress(1);
      return;
    }

    rafRef.current = requestAnimationFrame(animate);
  }, [map, state, speed, duration]);

  useEffect(() => {
    if (state === 'playing' && map) {
      rafRef.current = requestAnimationFrame(animate);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [state, map, animate]);

  // ---- Controls ----

  /** Start editing — user navigates map freely and adds keyframes */
  const startEditing = useCallback(() => {
    if (!map || !mapReady) return;
    saveCamera(map);
    enable3D(map);
    setState('editing');
    setKeyframes([]);
    setProgress(0);
    framesRef.current = [];
  }, [map, mapReady, saveCamera, enable3D]);

  /** Capture the current camera view as a keyframe */
  const addKeyframe = useCallback(() => {
    if (!map) return;
    const center = map.getCenter();
    const kf = {
      center: [center.lng, center.lat],
      zoom: map.getZoom(),
      pitch: map.getPitch(),
      bearing: map.getBearing(),
      label: `KF ${(keyframes.length + 1)}`,
    };
    setKeyframes((prev) => [...prev, kf]);
  }, [map, keyframes.length]);

  /** Start orbit around a property center */
  const startOrbit = useCallback((center, radiusKm = 0.5) => {
    if (!map || !mapReady) return;
    saveCamera(map);
    enable3D(map);
    const kfs = generateOrbitKeyframes(center, radiusKm);
    setKeyframes(kfs);
    setState('previewing');
  }, [map, mapReady, saveCamera, enable3D]);

  /** Navigate to a keyframe to review it */
  const goToKeyframe = useCallback((index) => {
    if (!map || !keyframes[index]) return;
    const kf = keyframes[index];
    map.flyTo({
      center: kf.center,
      zoom: kf.zoom,
      pitch: kf.pitch,
      bearing: kf.bearing,
      duration: 1500,
    });
  }, [map, keyframes]);

  /** Finish editing, show preview */
  const finishEditing = useCallback(() => {
    if (keyframes.length < 2) return;
    const frames = interpolateKeyframes(keyframes, 60);
    framesRef.current = frames;
    setState('previewing');
  }, [keyframes]);

  /** Back to editing from preview */
  const backToEditing = useCallback(() => {
    setState('editing');
  }, []);

  /** Buffer tiles then play */
  const play = useCallback(async () => {
    if (!map || !mapReady) return;

    // If paused, just resume
    if (state === 'paused') {
      setState('playing');
      return;
    }

    // Generate frames if not already done
    if (framesRef.current.length < 2) {
      if (keyframes.length < 2) return;
      framesRef.current = interpolateKeyframes(keyframes, 60);
    }

    enable3D(map);

    // Hide path layers during playback
    removePathLayers();

    // Buffer tiles first
    const ok = await bufferTiles(framesRef.current);
    if (!ok) return; // aborted

    // Start playback from beginning
    startTimeRef.current = null;
    pausedAtRef.current = 0;
    setProgress(0);
    setState('playing');
  }, [map, mapReady, state, keyframes, enable3D, bufferTiles, removePathLayers]);

  const pause = useCallback(() => {
    if (state !== 'playing') return;
    setState('paused');
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (startTimeRef.current) {
      pausedAtRef.current = performance.now() - startTimeRef.current;
    }
    startTimeRef.current = null;
  }, [state]);

  const stop = useCallback(() => {
    bufferAbortRef.current = true;
    setState('idle');
    setProgress(0);
    setBufferProgress(0);
    setKeyframes([]);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    startTimeRef.current = null;
    pausedAtRef.current = 0;
    framesRef.current = [];
    removePathLayers();
    if (map) restoreCamera(map);
  }, [map, restoreCamera, removePathLayers]);

  const scrubTo = useCallback((fraction) => {
    if (!framesRef.current.length || !map) return;
    const frames = framesRef.current;
    const frameIndex = Math.min(
      Math.floor(fraction * (frames.length - 1)),
      frames.length - 1,
    );
    const frame = frames[frameIndex];

    map.jumpTo({
      center: [frame.lng, frame.lat],
      zoom: frame.zoom,
      pitch: frame.pitch,
      bearing: frame.bearing,
    });

    setProgress(fraction);
    pausedAtRef.current = fraction * duration * 1000;
  }, [map, duration]);

  // Keyframe manipulation
  const removeKeyframe = useCallback((index) => {
    setKeyframes((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const moveKeyframe = useCallback((fromIndex, toIndex) => {
    setKeyframes((prev) => {
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      return updated;
    });
  }, []);

  const updateKeyframe = useCallback((index) => {
    // Replace keyframe at index with current camera view
    if (!map) return;
    const center = map.getCenter();
    setKeyframes((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        center: [center.lng, center.lat],
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
      };
      return updated;
    });
  }, [map]);

  const clearKeyframes = useCallback(() => {
    setKeyframes([]);
    framesRef.current = [];
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    if (state === 'idle') return;
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && (state === 'playing' || state === 'paused')) {
        e.preventDefault();
        if (state === 'playing') pause();
        else setState('playing');
      } else if (e.code === 'Escape') {
        e.preventDefault();
        stop();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state, pause, stop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => removePathLayers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    state,
    isEditing: state === 'editing',
    isPreviewing: state === 'previewing',
    isBuffering: state === 'buffering',
    isPlaying: state === 'playing',
    isPaused: state === 'paused',
    isActive: state !== 'idle',
    progress,
    bufferProgress,
    speed, setSpeed,
    exaggeration, setExaggeration,
    duration, setDuration,
    keyframes,
    startEditing,
    startOrbit,
    addKeyframe,
    goToKeyframe,
    finishEditing,
    backToEditing,
    play,
    pause,
    stop,
    scrubTo,
    removeKeyframe,
    moveKeyframe,
    updateKeyframe,
    clearKeyframes,
  };
}
