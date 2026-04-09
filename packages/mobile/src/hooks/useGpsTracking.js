// hooks/useGpsTracking.js — GPS tracking for task execution
// Foreground-only mode for Expo Go compatibility.
// Background tracking (expo-task-manager) will be added when we move to dev builds.
import { useState, useRef, useCallback, useEffect } from 'react';
import * as Location from 'expo-location';
import { tasksService } from '../api/services';

const BATCH_INTERVAL_MS = 15000; // Upload every 15s
const DISTANCE_INTERVAL_M = 5;   // Or every 5m movement
const TIME_INTERVAL_MS = 5000;   // Or every 5s

// Haversine distance between two GPS points (meters)
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Format a location update into a GPS point payload
function formatPoint(coords, segmentId, deviceId) {
  return {
    latitude: parseFloat(coords.latitude.toFixed(7)),
    longitude: parseFloat(coords.longitude.toFixed(7)),
    altitude: coords.altitude != null ? parseFloat(coords.altitude.toFixed(2)) : null,
    accuracy: coords.accuracy != null ? parseFloat(coords.accuracy.toFixed(2)) : null,
    speed: coords.speed != null && coords.speed >= 0 ? parseFloat((coords.speed * 3.6).toFixed(2)) : null,
    heading: coords.heading != null && coords.heading >= 0 ? parseFloat(coords.heading.toFixed(2)) : null,
    timestamp: new Date().toISOString(),
    segment_id: segmentId,
    device_id: deviceId,
  };
}

// Module-level buffer (persists across re-renders)
let _buffer = [];
let _lastPoint = null;
let _segmentId = 1;
let _deviceId = 'mobile';
let _totalDistance = 0;
let _totalPoints = 0;

export function useGpsTracking() {
  const [isTracking, setIsTracking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [stats, setStats] = useState({ distance: 0, duration: 0, pointCount: 0, avgSpeed: 0 });
  const [error, setError] = useState(null);

  const taskIdRef = useRef(null);
  const startTimeRef = useRef(null);
  const pausedDurationRef = useRef(0);
  const pauseStartRef = useRef(null);
  const batchIntervalRef = useRef(null);
  const durationIntervalRef = useRef(null);
  const watcherRef = useRef(null);

  // Duration timer — updates every second when tracking
  const startDurationTimer = useCallback(() => {
    durationIntervalRef.current = setInterval(() => {
      if (startTimeRef.current && !pauseStartRef.current) {
        const elapsed = (Date.now() - startTimeRef.current - pausedDurationRef.current) / 1000;
        setStats((prev) => {
          const durationMin = elapsed / 60;
          const distKm = prev.distance / 1000;
          return {
            ...prev,
            duration: elapsed,
            avgSpeed: durationMin > 0 ? parseFloat((distKm / (durationMin / 60)).toFixed(1)) : 0,
          };
        });
      }
    }, 1000);
  }, []);

  // Batch upload buffered points
  const flushBuffer = useCallback(async () => {
    if (_buffer.length === 0 || !taskIdRef.current) return;

    const points = [..._buffer];
    _buffer = [];
    try {
      await tasksService.bulkAddGpsPoints(taskIdRef.current, { points });
    } catch (err) {
      // Put points back for retry
      _buffer = [...points, ..._buffer];
      console.warn('[GPS] Bulk upload failed, will retry:', err.message);
    }
  }, []);

  // Start batch upload interval
  const startBatchInterval = useCallback(() => {
    batchIntervalRef.current = setInterval(flushBuffer, BATCH_INTERVAL_MS);
  }, [flushBuffer]);

  // Start foreground location watcher
  const startWatcher = useCallback(async () => {
    try {
      watcherRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: DISTANCE_INTERVAL_M,
          timeInterval: TIME_INTERVAL_MS,
        },
        (location) => {
          const point = formatPoint(location.coords, _segmentId, _deviceId);

          if (_lastPoint) {
            const d = haversine(_lastPoint.latitude, _lastPoint.longitude, point.latitude, point.longitude);
            _totalDistance += d;
          }
          _lastPoint = point;
          _totalPoints++;
          _buffer.push(point);

          setStats((prev) => ({
            ...prev,
            distance: _totalDistance,
            pointCount: _totalPoints,
          }));
        }
      );
    } catch (err) {
      console.warn('[GPS] Watcher failed:', err.message);
      setError(err.message);
    }
  }, []);

  const stopWatcher = useCallback(() => {
    if (watcherRef.current) {
      watcherRef.current.remove();
      watcherRef.current = null;
    }
  }, []);

  // --- Public API ---

  const startTracking = useCallback(async (taskId) => {
    try {
      setError(null);

      // Request foreground permission only (works in Expo Go)
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Location permission denied');
        return false;
      }

      // Get device ID
      try {
        const Constants = require('expo-constants').default;
        _deviceId = Constants.installationId || Constants.deviceName || 'mobile';
      } catch {}

      // Reset module-level state
      _buffer = [];
      _lastPoint = null;
      _segmentId = 1;
      _totalDistance = 0;
      _totalPoints = 0;

      // Get initial position
      const initialLoc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const initialPoint = formatPoint(initialLoc.coords, 1, _deviceId);
      _lastPoint = initialPoint;
      _totalPoints = 1;

      // Notify backend (if already active from a prior attempt, continue gracefully)
      try {
        await tasksService.startGpsTracking(taskId, {
          device_id: _deviceId,
          initial_point: initialPoint,
        });
      } catch (apiErr) {
        const detail = apiErr.response?.data?.detail || '';
        if (detail.toLowerCase().includes('already active')) {
          console.log('[GPS] Backend says already active — resuming tracking');
        } else {
          throw apiErr;
        }
      }

      taskIdRef.current = taskId;
      startTimeRef.current = Date.now();
      pausedDurationRef.current = 0;

      // Start foreground watcher
      await startWatcher();
      startBatchInterval();
      startDurationTimer();

      setIsTracking(true);
      setIsPaused(false);
      setStats({ distance: 0, duration: 0, pointCount: 1, avgSpeed: 0 });

      return true;
    } catch (err) {
      const detail = err.response?.data?.detail || err.message;
      console.error('[GPS] Start tracking error:', detail, err.response?.status);
      setError(detail);
      return false;
    }
  }, [startBatchInterval, startDurationTimer, startWatcher]);

  const pauseTracking = useCallback(async () => {
    try {
      stopWatcher();

      const finalPoint = _lastPoint ? {
        latitude: _lastPoint.latitude,
        longitude: _lastPoint.longitude,
        timestamp: new Date().toISOString(),
      } : null;

      await flushBuffer();

      await tasksService.pauseGpsTracking(taskIdRef.current, {
        final_point: finalPoint,
        reason: 'user_pause',
      });

      pauseStartRef.current = Date.now();
      setIsPaused(true);
    } catch (err) {
      console.error('[GPS] Pause error:', err);
      setError(err.message);
    }
  }, [flushBuffer, stopWatcher]);

  const resumeTracking = useCallback(async () => {
    try {
      if (pauseStartRef.current) {
        pausedDurationRef.current += Date.now() - pauseStartRef.current;
        pauseStartRef.current = null;
      }

      _segmentId++;

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const initialPoint = formatPoint(loc.coords, _segmentId, _deviceId);

      await tasksService.resumeGpsTracking(taskIdRef.current, {
        initial_point: initialPoint,
      });

      await startWatcher();
      setIsPaused(false);
    } catch (err) {
      console.error('[GPS] Resume error:', err);
      setError(err.message);
    }
  }, [startWatcher]);

  const stopTracking = useCallback(async () => {
    try {
      stopWatcher();
      await flushBuffer();

      const finalPoint = _lastPoint ? {
        latitude: _lastPoint.latitude,
        longitude: _lastPoint.longitude,
        timestamp: new Date().toISOString(),
      } : null;

      if (taskIdRef.current) {
        await tasksService.stopGpsTracking(taskIdRef.current, {
          final_point: finalPoint,
        });
      }

      if (batchIntervalRef.current) clearInterval(batchIntervalRef.current);
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
      batchIntervalRef.current = null;
      durationIntervalRef.current = null;

      taskIdRef.current = null;
      startTimeRef.current = null;
      pausedDurationRef.current = 0;
      pauseStartRef.current = null;
      _buffer = [];
      _lastPoint = null;

      setIsTracking(false);
      setIsPaused(false);
    } catch (err) {
      console.error('[GPS] Stop error:', err);
      setError(err.message);
    }
  }, [flushBuffer, stopWatcher]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (batchIntervalRef.current) clearInterval(batchIntervalRef.current);
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
      stopWatcher();
    };
  }, [stopWatcher]);

  return {
    isTracking,
    isPaused,
    stats,
    error,
    startTracking,
    pauseTracking,
    resumeTracking,
    stopTracking,
  };
}
