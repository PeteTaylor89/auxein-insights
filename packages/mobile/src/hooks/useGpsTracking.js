// hooks/useGpsTracking.js — GPS tracking for task execution
// Foreground-only mode for Expo Go compatibility.
// Background tracking (expo-task-manager) will be added when we move to dev builds.
import { useState, useRef, useCallback, useEffect } from 'react';
import * as Location from 'expo-location';
import { tasksService } from '../api/services';
import { enqueuePoints, flushQueue } from '../services/gpsQueue';
import { checkNetwork } from './useNetworkStatus';

const BATCH_INTERVAL_MS = 10000; // Upload every 10s
const DISTANCE_INTERVAL_M = 1;   // Every 1m movement (row-level resolution)
const TIME_INTERVAL_MS = 2000;   // Every 2s (keeps GPS warm)

// Accuracy filters
const ACCURACY_GOOD_M = 8;      // Accuracy we consider "good" — once seen, filter poor fixes
const ACCURACY_POOR_M = 15;     // Always reject worse than this regardless
const MIN_POINTS_BEFORE_FILTER = 5; // Accept first N points regardless (ensures a linestring)
const MAX_SPEED_KMH = 50;        // Discard points implying speed above this
const STATIONARY_RADIUS_M = 1;   // Movement threshold for stationary detection
const STATIONARY_TIMEOUT_MS = 30000; // Duration before suppressing duplicate stationary points
const ALTITUDE_WINDOW = 5;       // Median filter window for altitude smoothing

// Kalman filter parameters — tuned for 2-4m row spacing
const KALMAN_Q = 6;              // Process noise — high = forget old state faster, trust GPS more
const KALMAN_R_BASE = 2;         // Base measurement noise (m) — low = trust GPS position more

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
  const safeNum = (v, min, max) => {
    if (v == null || !Number.isFinite(v)) return null;
    if (min != null && v < min) return null;
    if (max != null && v > max) return null;
    return v;
  };
  return {
    latitude: parseFloat(coords.latitude.toFixed(7)),
    longitude: parseFloat(coords.longitude.toFixed(7)),
    altitude: coords.altitude != null && Number.isFinite(coords.altitude) ? parseFloat(coords.altitude.toFixed(2)) : null,
    accuracy: safeNum(coords.accuracy, 0) != null ? parseFloat(coords.accuracy.toFixed(2)) : null,
    speed: safeNum(coords.speed, 0) != null ? parseFloat((coords.speed * 3.6).toFixed(2)) : null,
    heading: safeNum(coords.heading, 0, 360) != null ? parseFloat(coords.heading.toFixed(2)) : null,
    timestamp: new Date().toISOString(),
    segment_id: segmentId,
    device_id: deviceId,
  };
}

// --- Kalman filter state ---
// 2D position filter with velocity model. Smooths GPS jitter while preserving
// real movement direction. Handles row-end turning circles by trusting high-accuracy
// measurements during direction changes (heading delta > 45°).
let _kalman = null;

function initKalman(lat, lon, accuracy) {
  const r = Math.max(accuracy || KALMAN_R_BASE, 1);
  _kalman = {
    lat, lon,
    vLat: 0, vLon: 0,       // velocity in degrees/s (tiny numbers, that's fine)
    p: r * r,                // position variance
    pV: 100,                 // velocity variance (high = uncertain)
    lastTime: Date.now(),
    lastHeading: null,
  };
}

function kalmanPredict(dt) {
  if (!_kalman || dt <= 0) return;
  // Predict position from velocity
  _kalman.lat += _kalman.vLat * dt;
  _kalman.lon += _kalman.vLon * dt;
  // Increase uncertainty
  _kalman.p += KALMAN_Q * KALMAN_Q * dt * dt;
  _kalman.pV += KALMAN_Q * dt;
}

function kalmanUpdate(measLat, measLon, accuracy, speed, heading) {
  if (!_kalman) { initKalman(measLat, measLon, accuracy); return { lat: measLat, lon: measLon }; }

  const now = Date.now();
  const dt = (now - _kalman.lastTime) / 1000;
  _kalman.lastTime = now;

  // Predict step
  kalmanPredict(dt);

  // Measurement noise — scale by reported GPS accuracy
  const r = Math.max(accuracy || KALMAN_R_BASE, 1);
  const rSq = r * r;

  // Detect turning (heading change > 45°) — trust measurement more during turns
  let isTurning = false;
  if (heading != null && _kalman.lastHeading != null) {
    let hDelta = Math.abs(heading - _kalman.lastHeading);
    if (hDelta > 180) hDelta = 360 - hDelta;
    isTurning = hDelta > 45;
  }
  if (heading != null) _kalman.lastHeading = heading;

  // During turns, reduce filter's position confidence so we follow the GPS
  const effectiveP = isTurning ? _kalman.p * 3 : _kalman.p;

  // Kalman gain
  const k = effectiveP / (effectiveP + rSq);

  // Update position
  const innovLat = measLat - _kalman.lat;
  const innovLon = measLon - _kalman.lon;
  _kalman.lat += k * innovLat;
  _kalman.lon += k * innovLon;

  // Update velocity estimate — conservative gain to prevent lateral drift
  if (dt > 0 && speed != null && speed > 0.5 && heading != null) {
    const speedDegPerSec = (speed / 3.6) / 111320;
    const headRad = (heading * Math.PI) / 180;
    const measVLat = speedDegPerSec * Math.cos(headRad);
    const measVLon = speedDegPerSec * Math.sin(headRad);
    const kV = _kalman.pV / (_kalman.pV + 100); // low gain — velocity is a hint, not a driver
    _kalman.vLat += kV * (measVLat - _kalman.vLat);
    _kalman.vLon += kV * (measVLon - _kalman.vLon);
    _kalman.pV *= (1 - kV);
  } else if (speed != null && speed <= 0.5) {
    // Dampen velocity toward zero when nearly stationary
    _kalman.vLat *= 0.5;
    _kalman.vLon *= 0.5;
  }

  // Update position variance
  _kalman.p *= (1 - k);

  return { lat: _kalman.lat, lon: _kalman.lon };
}

// Module-level buffer (persists across re-renders)
let _buffer = [];
let _lastPoint = null;
let _segmentId = 1;
let _deviceId = 'mobile';
let _totalDistance = 0;
let _totalPoints = 0;
let _stationaryAnchor = null;   // { lat, lon, time } — last significant movement
let _altitudeWindow = [];        // Recent altitude values for median smoothing
let _filteredCount = 0;          // Points discarded by filters
let _bestAccuracy = Infinity;    // Best accuracy seen so far (adaptive threshold)

function medianAltitude(alt) {
  if (alt == null) return null;
  _altitudeWindow.push(alt);
  if (_altitudeWindow.length > ALTITUDE_WINDOW) _altitudeWindow.shift();
  const sorted = [..._altitudeWindow].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

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

  // Batch upload buffered points — falls back to persistent queue on failure
  const flushBuffer = useCallback(async () => {
    if (_buffer.length === 0 || !taskIdRef.current) return;

    const points = [..._buffer];
    _buffer = [];
    try {
      const isOnline = await checkNetwork();
      if (!isOnline) {
        await enqueuePoints(taskIdRef.current, points);
        return;
      }
      await tasksService.bulkAddGpsPoints(taskIdRef.current, { points });
      // After a successful upload, try flushing any previously queued points
      flushQueue().catch(() => {});
    } catch (err) {
      // Persist to offline queue instead of volatile in-memory retry
      await enqueuePoints(taskIdRef.current, points);
      console.warn('[GPS] Upload failed, queued offline:', err.message);
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
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: DISTANCE_INTERVAL_M,
          timeInterval: TIME_INTERVAL_MS,
        },
        (location) => {
          const { coords } = location;

          // Filter 1: adaptive accuracy threshold
          // Always reject very poor fixes. Once we've seen a good fix, reject mediocre ones too.
          // First MIN_POINTS_BEFORE_FILTER points always pass (ensures a linestring).
          if (coords.accuracy != null) {
            if (coords.accuracy < _bestAccuracy) _bestAccuracy = coords.accuracy;
            const pastWarmup = _totalPoints >= MIN_POINTS_BEFORE_FILTER;
            const haveGoodFix = _bestAccuracy <= ACCURACY_GOOD_M;
            if (coords.accuracy > ACCURACY_POOR_M && pastWarmup) {
              _filteredCount++;
              return;
            }
            if (haveGoodFix && coords.accuracy > ACCURACY_GOOD_M * 2 && pastWarmup) {
              _filteredCount++;
              return;
            }
          }

          // Filter 2: speed sanity — check both reported speed and calculated speed
          if (coords.speed != null && coords.speed * 3.6 > MAX_SPEED_KMH) {
            _filteredCount++;
            return;
          }
          if (_lastPoint) {
            const d = haversine(_lastPoint.latitude, _lastPoint.longitude, coords.latitude, coords.longitude);
            const dtSec = (Date.now() - new Date(_lastPoint.timestamp).getTime()) / 1000;
            if (dtSec > 0 && (d / dtSec) * 3.6 > MAX_SPEED_KMH) {
              _filteredCount++;
              return;
            }
          }

          // Filter 3: stationary detection — suppress duplicates when not moving
          const now = Date.now();
          if (_stationaryAnchor) {
            const dFromAnchor = haversine(_stationaryAnchor.lat, _stationaryAnchor.lon, coords.latitude, coords.longitude);
            if (dFromAnchor < STATIONARY_RADIUS_M) {
              if (now - _stationaryAnchor.time > STATIONARY_TIMEOUT_MS) {
                _filteredCount++;
                return;
              }
            } else {
              _stationaryAnchor = { lat: coords.latitude, lon: coords.longitude, time: now };
            }
          } else {
            _stationaryAnchor = { lat: coords.latitude, lon: coords.longitude, time: now };
          }

          // Kalman filter: smooth position using speed + heading prediction model
          const rawSpeed = coords.speed != null && coords.speed >= 0 ? coords.speed * 3.6 : null;
          const rawHeading = coords.heading != null && coords.heading >= 0 ? coords.heading : null;
          const filtered = kalmanUpdate(
            coords.latitude, coords.longitude,
            coords.accuracy, rawSpeed, rawHeading
          );

          // Build point from filtered coordinates
          const filteredCoords = {
            ...coords,
            latitude: filtered.lat,
            longitude: filtered.lon,
          };
          const point = formatPoint(filteredCoords, _segmentId, _deviceId);
          const smoothedAlt = medianAltitude(coords.altitude);
          point.altitude = smoothedAlt != null ? parseFloat(smoothedAlt.toFixed(2)) : null;

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
      _stationaryAnchor = null;
      _altitudeWindow = [];
      _filteredCount = 0;
      _bestAccuracy = Infinity;
      _kalman = null;

      // Get initial position (BestForNavigation for max accuracy)
      const initialLoc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
      initKalman(initialLoc.coords.latitude, initialLoc.coords.longitude, initialLoc.coords.accuracy);
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

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
      initKalman(loc.coords.latitude, loc.coords.longitude, loc.coords.accuracy);
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
