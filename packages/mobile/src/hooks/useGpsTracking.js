// hooks/useGpsTracking.js — GPS tracking for task execution
//
// Uses expo-location's foreground service (Android) + UIBackgroundModes
// "location" (iOS) to keep collecting points when the screen is off,
// WITHOUT requiring ACCESS_BACKGROUND_LOCATION or iOS Always authorization.
// See docs/plans/LOCATION_COMPLIANCE_V1.md.
//
// Architecture:
//   1. TaskManager.defineTask(LOCATION_TASK_NAME, handler) — registered at
//      module scope. Receives batches of locations from the OS while the
//      foreground service is running. Runs in the same JS context as the UI
//      thread (since expo-location keeps the bundle alive on Android via
//      the foreground service, and iOS keeps it alive via the location
//      background mode).
//   2. startTracking() — calls Location.startLocationUpdatesAsync with the
//      task name + foreground service notification config. The OS shows a
//      persistent notification and delivers location batches to the task.
//   3. stopTracking() — calls Location.stopLocationUpdatesAsync, which
//      tears down the foreground service AND its notification.
//   4. Pause/Resume — leaves the service + notification running, just sets
//      a `_paused` flag the task callback checks. Re-acquires nothing on
//      resume; the OS is still streaming points.
import { useState, useRef, useCallback, useEffect } from 'react';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { tasksService } from '../api/services';
import { enqueuePoints, flushQueue } from '../services/gpsQueue';
import { refreshSession, onSessionCleared } from '../services/tokenStore';
import { checkNetwork } from './useNetworkStatus';

const LOCATION_TASK_NAME = 'auxein-grow-gps-tracking';

// Proactively refresh the access token while a long track runs. The backend
// access-token TTL is 180 min; refreshing every 90 keeps a wide margin so the
// token never expires mid-session. Belt-and-braces on top of the keychain +
// interceptor fixes — if a tick slips under Doze, those still prevent logout.
const TOKEN_REFRESH_INTERVAL_MS = 90 * 60 * 1000;

// ─── CPU wake-lock — scoping note ──────────────────────────────────────
// expo-location's Android foreground service (when configured via the
// `foregroundService` option below) registers a Service with type
// `location` and acquires a `PARTIAL_WAKE_LOCK` internally while location
// updates are active. The wake lock is released when
// stopLocationUpdatesAsync is called or the JS process is torn down.
//
// What this gives us:
//   • CPU stays awake while location updates flow → JS task callback runs
//     promptly even when the screen is off and device is dozing.
//   • Foreground notification keeps the app process privileged so Android
//     doesn't kill it under memory pressure.
//
// What it does NOT give us:
//   • Doze-mode immunity for the `setInterval` timers (batch upload,
//     duration tick). These are JS-scheduled and may slip a few seconds
//     under heavy doze. Acceptable — upload is async-batched and duration
//     is cosmetic.
//   • Anything once the user force-stops the app or kills it from recents:
//     wake lock is released with the service.
//
// If field data later shows our wake-lock guarantees aren't enough (e.g.
// JS callback latency > 5s under doze), the explicit add would be:
//   1. Write a tiny Expo config plugin that drops a partial wake lock when
//      a flag in AsyncStorage is set, releases when cleared.
//   2. Acquire from startTracking, release from stopTracking.
//   3. Verify with `dumpsys power | grep -i wake` while a session is active.
// Not doing this in v1 — measure first.

// Foreground-service notification copy — body is updated per-task in
// startTracking when the caller supplies a task name. See spec §2.6.
let _notificationConfig = {
  title: 'Auxein Grow — Task in progress',
  body: 'Tracking equipment movement.',
  color: '#5B6830',
};

// Pause flag — task callback short-circuits when true so the service can
// stay alive (notification visible) without polluting the buffer/track.
let _paused = false;

const BATCH_INTERVAL_MS = 10000; // Upload every 10s
const DISTANCE_INTERVAL_M = 1;   // Every 1m movement (row-level resolution)
const TIME_INTERVAL_MS = 1000;   // Every 1s — Strava-class polling. The OS
                                 // treats this as a hint; under Doze pressure
                                 // it may coalesce, but starting from 1s gives
                                 // us a tighter ceiling than 2s when screen
                                 // is off + device is in low-power state.

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

// Format a location update into a GPS point payload. fixTimeMs is the true GPS
// fix time (ms epoch); falls back to now only when the platform omits it.
function formatPoint(coords, segmentId, deviceId, fixTimeMs) {
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
    timestamp: new Date(Number.isFinite(fixTimeMs) ? fixTimeMs : Date.now()).toISOString(),
    segment_id: segmentId,
    device_id: deviceId,
  };
}

// --- Kalman filter state ---
// 2D position filter with velocity model. Smooths GPS jitter while preserving
// real movement direction. Handles row-end turning circles by trusting high-accuracy
// measurements during direction changes (heading delta > 45°).
let _kalman = null;

function initKalman(lat, lon, accuracy, lastTimeMs) {
  const r = Math.max(accuracy || KALMAN_R_BASE, 1);
  _kalman = {
    lat, lon,
    vLat: 0, vLon: 0,       // velocity in degrees/s (tiny numbers, that's fine)
    p: r * r,                // position variance
    pV: 100,                 // velocity variance (high = uncertain)
    lastTime: Number.isFinite(lastTimeMs) ? lastTimeMs : Date.now(),
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

function kalmanUpdate(measLat, measLon, accuracy, speed, heading, nowMs) {
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  if (!_kalman) { initKalman(measLat, measLon, accuracy, now); return { lat: measLat, lon: measLon }; }

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

// ─── Session binding ───────────────────────────────────────────────────────
// Every active recording has a unique _sessionId and the _sessionTaskId it
// belongs to. Captured points are dropped unless a session is active, and
// uploads are bound to _sessionTaskId — NOT to a React ref that can change.
// This is what stops a zombie OS location stream (e.g. after a mid-track
// logout) from bleeding the previous physical path onto the next task.
let _sessionId = null;
let _sessionTaskId = null;
// Wall-clock ms the active session started. Persisted at module scope so a
// remounted hook can restore its duration timer's origin (the React ref is
// lost on unmount). Inside _sessionId we already embed Date.now(); this is the
// plain numeric form the duration math needs.
let _sessionStartedAt = null;

// ─── Live-track subscription API ──────────────────────────────────────────
// The backend `/track/geojson` endpoint builds the LineString from
// TaskGPSSummary, which is only populated at stop/reprocess time — so it
// returns 404 during a live recording. The map needs the trail in real time,
// so we keep an in-memory copy of every accepted (Kalman-filtered) point in
// [lon, lat] order and let consumers (MapScreen) subscribe.
//
// _trackPoints is separate from _buffer: _buffer drains every 10s on upload,
// but _trackPoints is retained until the next startTracking() call.
let _trackPoints = [];          // [[lon, lat], ...] ordered by capture time
let _trackActive = false;        // Mirrors isTracking but readable outside React
const _trackSubscribers = new Set();
const TRACK_MAX_POINTS = 10000;  // ~5h of tracking at 2s cadence — soft cap

// Safety valve for _buffer (the upload staging array). Normally drained every
// 10s by the batch interval. If that interval is ever dead (e.g. the screen
// unmounted mid-session and remount didn't re-arm it before this fix), the
// buffer would grow unbounded in RAM and be lost on an OS kill. When it crosses
// this size we persist the overflow straight to the durable offline queue so it
// can never be RAM-only. Set well above a healthy 10s batch (~5-10 points).
const MAX_BUFFER_POINTS = 2000;

function _notifyTrack() {
  // Snapshot the array so subscribers see an immutable reference per emit.
  const snapshot = _trackPoints.slice();
  for (const cb of _trackSubscribers) {
    try { cb({ coordinates: snapshot, active: _trackActive }); } catch {}
  }
}

export function subscribeToLiveTrack(cb) {
  _trackSubscribers.add(cb);
  // Push current state immediately so subscribers don't wait for the next point.
  try { cb({ coordinates: _trackPoints.slice(), active: _trackActive }); } catch {}
  return () => { _trackSubscribers.delete(cb); };
}

export function getLiveTrackSnapshot() {
  return { coordinates: _trackPoints.slice(), active: _trackActive };
}

function medianAltitude(alt) {
  if (alt == null) return null;
  _altitudeWindow.push(alt);
  if (_altitudeWindow.length > ALTITUDE_WINDOW) _altitudeWindow.shift();
  const sorted = [..._altitudeWindow].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// Process one location update — runs filter chain → Kalman → buffer + track.
// Extracted from the old watchPositionAsync inline callback so the same
// logic is shared between the foreground-service task callback and any
// fallback path. Updates module-level state; the hook polls it for React
// state updates.
function processLocationUpdate(location) {
  // Session guard — drop any point that arrives while no recording is active.
  // Belt-and-braces with teardownTracking(): even if a zombie OS stream slips
  // through, its points can never accumulate or attach to a later task.
  if (_sessionId == null) return;

  const { coords } = location;

  // Real GPS fix time (ms epoch). Critical for batched delivery: under Android
  // Doze the OS hands over a burst of buffered fixes on screen wake. Stamping
  // them with the true fix time (not wall-clock now) keeps their spacing — so
  // the speed filter sees realistic speeds instead of a zero-dt "teleport" and
  // discarding all but the first point of each batch (the straight-line bug).
  const fixTime = (location && Number.isFinite(location.timestamp)) ? location.timestamp : Date.now();

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
    const dtSec = (fixTime - new Date(_lastPoint.timestamp).getTime()) / 1000;
    if (dtSec > 0 && (d / dtSec) * 3.6 > MAX_SPEED_KMH) {
      _filteredCount++;
      return;
    }
  }

  // Filter 3: stationary detection — suppress duplicates when not moving
  const now = fixTime;
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
    coords.accuracy, rawSpeed, rawHeading, fixTime
  );

  const filteredCoords = {
    ...coords,
    latitude: filtered.lat,
    longitude: filtered.lon,
  };
  const point = formatPoint(filteredCoords, _segmentId, _deviceId, fixTime);
  const smoothedAlt = medianAltitude(coords.altitude);
  point.altitude = smoothedAlt != null ? parseFloat(smoothedAlt.toFixed(2)) : null;

  if (_lastPoint) {
    const d = haversine(_lastPoint.latitude, _lastPoint.longitude, point.latitude, point.longitude);
    _totalDistance += d;
  }
  _lastPoint = point;
  _totalPoints++;
  _buffer.push(point);

  // Safety valve — if the batch interval isn't draining (dead after a remount,
  // or stalled), persist the overflow to the durable offline queue rather than
  // letting _buffer grow unbounded in RAM. flushQueue (run on the next
  // successful upload / reconnect) will sync it. No-op in the healthy case.
  if (_buffer.length >= MAX_BUFFER_POINTS && _sessionTaskId) {
    const overflow = _buffer.splice(0, _buffer.length - Math.floor(MAX_BUFFER_POINTS / 2));
    enqueuePoints(_sessionTaskId, overflow).catch((e) => {
      // Re-insert at the front if persistence failed, so it's retried next time.
      _buffer.unshift(...overflow);
      console.warn('[GPS] buffer overflow persist failed:', e?.message);
    });
  }

  // Live polyline source — retained across upload flushes. Capped to bound
  // memory; oldest points drop first. Coordinate order is [lon, lat] to
  // match Mapbox LineString expectations.
  _trackPoints.push([point.longitude, point.latitude]);
  if (_trackPoints.length > TRACK_MAX_POINTS) {
    _trackPoints.splice(0, _trackPoints.length - TRACK_MAX_POINTS);
  }
  _notifyTrack();
}

// Register the TaskManager task at module scope. defineTask is idempotent
// per task name — safe to call multiple times across bundle reloads. The
// callback only fires when expo-location's foreground service delivers
// batches.
TaskManager.defineTask(LOCATION_TASK_NAME, ({ data, error }) => {
  if (error) {
    console.warn('[GPS task] error:', error.message);
    return;
  }
  if (!data || _paused) return;
  const { locations } = data;
  if (!locations || locations.length === 0) return;
  for (const loc of locations) {
    try { processLocationUpdate(loc); }
    catch (err) { console.warn('[GPS task] processLocation failed:', err?.message); }
  }
});

// Hard teardown — stop the OS location service and wipe all session state.
// Called on user stop (indirectly), and on session loss (logout / auth
// rejection) via the tokenStore listener below. Idempotent and React-free so
// it works even when no screen is mounted.
async function teardownTracking() {
  try {
    const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
    if (running) await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => {});
  } catch { /* best-effort */ }
  _paused = false;
  _sessionId = null;
  _sessionTaskId = null;
  _sessionStartedAt = null;
  _buffer = [];
  _lastPoint = null;
  // Drop the live trail too, so a stale path can't render on the next task's map.
  _trackPoints = [];
  _trackActive = false;
  _notifyTrack();
}

export { teardownTracking };

// When the session is cleared (logout, or an interceptor auth rejection that
// wiped the tokens), kill any zombie GPS stream so it can't keep recording or
// attach its points to whatever task is opened next.
onSessionCleared(() => { teardownTracking().catch(() => {}); });

export function useGpsTracking() {
  const [isTracking, setIsTracking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [hasBeenStopped, setHasBeenStopped] = useState(false);
  const [stats, setStats] = useState({ distance: 0, duration: 0, pointCount: 0, avgSpeed: 0 });
  const [error, setError] = useState(null);

  const taskIdRef = useRef(null);
  const startTimeRef = useRef(null);
  const pausedDurationRef = useRef(0);
  const pauseStartRef = useRef(null);
  const batchIntervalRef = useRef(null);
  const durationIntervalRef = useRef(null);
  const tokenRefreshIntervalRef = useRef(null);

  // Duration timer — also pulls module-level distance/pointCount into React
  // state since the task callback that updates them runs outside the hook.
  const startDurationTimer = useCallback(() => {
    durationIntervalRef.current = setInterval(() => {
      if (startTimeRef.current && !pauseStartRef.current) {
        const elapsed = (Date.now() - startTimeRef.current - pausedDurationRef.current) / 1000;
        setStats((prev) => {
          const distance = _totalDistance;
          const pointCount = _totalPoints;
          const durationMin = elapsed / 60;
          const distKm = distance / 1000;
          return {
            distance,
            pointCount,
            duration: elapsed,
            avgSpeed: durationMin > 0 ? parseFloat((distKm / (durationMin / 60)).toFixed(1)) : 0,
          };
        });
      }
    }, 1000);
  }, []);

  // Batch upload buffered points — falls back to persistent queue on failure
  const flushBuffer = useCallback(async () => {
    // Bind the upload to the SESSION's task, not taskIdRef — the ref can be
    // nulled or repointed by lifecycle churn, the session id cannot. Skip
    // entirely if no session is active (a fired interval after teardown).
    const sessionTaskId = _sessionTaskId;
    if (_buffer.length === 0 || !sessionTaskId || _sessionId == null) return;

    const points = [..._buffer];
    _buffer = [];
    try {
      const isOnline = await checkNetwork();
      if (!isOnline) {
        await enqueuePoints(sessionTaskId, points);
        return;
      }
      await tasksService.bulkAddGpsPoints(sessionTaskId, { points });
      // After a successful upload, try flushing any previously queued points
      flushQueue().catch(() => {});
    } catch (err) {
      // Persist to offline queue instead of volatile in-memory retry
      await enqueuePoints(sessionTaskId, points);
      console.warn('[GPS] Upload failed, queued offline:', err.message);
    }
  }, []);

  // Start batch upload interval
  const startBatchInterval = useCallback(() => {
    batchIntervalRef.current = setInterval(flushBuffer, BATCH_INTERVAL_MS);
  }, [flushBuffer]);

  // Start the OS-level foreground service. Once running, the OS streams
  // location batches to the TaskManager task defined at module scope —
  // even when the screen is off or the app is backgrounded, because the
  // foreground service notification keeps the process privileged.
  // No ACCESS_BACKGROUND_LOCATION needed: this is the foreground-service
  // exemption pattern (spec §2.3, §2.4).
  const startWatcher = useCallback(async () => {
    try {
      _paused = false;
      const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
      if (alreadyRunning) {
        // Tear down + restart so a fresh notification with the new task
        // name shows. Otherwise the OS keeps the previous body text.
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => {});
      }
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.BestForNavigation,
        distanceInterval: DISTANCE_INTERVAL_M,
        timeInterval: TIME_INTERVAL_MS,
        // Android — persistent notification config (foreground service).
        // killServiceOnDestroy:false means the service survives task-removal
        // (user swipes app from recents) without continuing to track —
        // expo-location stops the service when the JS context is cleaned up.
        foregroundService: {
          notificationTitle: _notificationConfig.title,
          notificationBody: _notificationConfig.body,
          notificationColor: _notificationConfig.color,
        },
        // iOS — bind to "When In Use" auth + Background Modes "location",
        // never to Always. Indicator visible per spec §3.4.4.
        showsBackgroundLocationIndicator: true,
        pausesUpdatesAutomatically: false,
        activityType: Location.ActivityType.OtherNavigation,
      });
    } catch (err) {
      console.warn('[GPS] Foreground service start failed:', err.message);
      setError(err.message);
    }
  }, []);

  const stopWatcher = useCallback(async () => {
    try {
      const isRegistered = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
      if (isRegistered) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      }
    } catch (err) {
      console.warn('[GPS] Foreground service stop failed:', err?.message);
    }
  }, []);


  // --- Public API ---

  const startTracking = useCallback(async (taskId, taskName) => {
    try {
      setError(null);

      // Foreground permission is the only one we ever request. The
      // foreground service does the heavy lifting for screen-off tracking
      // — no ACCESS_BACKGROUND_LOCATION or iOS Always needed.
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Location permission denied');
        return false;
      }

      // Refresh the access token up-front so a long session starts on a fresh
      // 180-min window. Best-effort: a failure here doesn't block tracking
      // (the interceptor will refresh on demand if the current token is valid).
      await refreshSession().catch(() => {});

      // Clear any prior/zombie session before starting a new one — stops a
      // still-running OS stream and wipes stale buffers/trail so nothing bleeds
      // into this task.
      await teardownTracking();

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
      // Open a fresh session bound to THIS task. Points are dropped and uploads
      // are skipped unless _sessionId is set, and uploads target _sessionTaskId.
      _sessionStartedAt = Date.now();
      _sessionId = `${taskId}-${_sessionStartedAt}`;
      _sessionTaskId = taskId;
      // Fresh tracking session — clear the live-trail buffer + flip the flag.
      _trackPoints = [];
      _trackActive = true;
      _notifyTrack();

      // Personalise the foreground-service notification body per spec §2.6.
      // Falls back to the generic copy when caller doesn't pass a task name.
      _notificationConfig.body = taskName
        ? `Task in progress: ${taskName}`
        : 'Tracking equipment movement.';

      // Get initial position (BestForNavigation for max accuracy)
      const initialLoc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
      initKalman(initialLoc.coords.latitude, initialLoc.coords.longitude, initialLoc.coords.accuracy, initialLoc.timestamp);
      const initialPoint = formatPoint(initialLoc.coords, 1, _deviceId, initialLoc.timestamp);
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

      // Start the foreground-service-backed location stream. Once this
      // returns the OS notification is visible and points will flow into
      // the TaskManager task regardless of screen state.
      await startWatcher();
      startBatchInterval();
      startDurationTimer();

      // Keep the access token fresh for the whole session.
      if (tokenRefreshIntervalRef.current) clearInterval(tokenRefreshIntervalRef.current);
      tokenRefreshIntervalRef.current = setInterval(() => {
        refreshSession().catch(() => {});
      }, TOKEN_REFRESH_INTERVAL_MS);

      setIsTracking(true);
      setIsPaused(false);
      setHasBeenStopped(false);
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
      // Flip the gate first so any in-flight task callback drops its points.
      // The foreground service stays alive — the notification is part of
      // the active session contract per spec §2.4 ("active" includes paused).
      _paused = true;

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
  }, [flushBuffer]);

  const resumeTracking = useCallback(async () => {
    try {
      if (pauseStartRef.current) {
        pausedDurationRef.current += Date.now() - pauseStartRef.current;
        pauseStartRef.current = null;
      }

      _segmentId++;

      // One-shot fresh fix to re-seed the Kalman state — the service has
      // been running but we've been discarding points, so the filter is
      // stale.
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
      initKalman(loc.coords.latitude, loc.coords.longitude, loc.coords.accuracy, loc.timestamp);
      const initialPoint = formatPoint(loc.coords, _segmentId, _deviceId, loc.timestamp);

      await tasksService.resumeGpsTracking(taskIdRef.current, {
        initial_point: initialPoint,
      });

      // Re-open the gate — the still-running foreground service will start
      // delivering points to the buffer again.
      _paused = false;
      setIsPaused(false);
    } catch (err) {
      console.error('[GPS] Resume error:', err);
      setError(err.message);
    }
  }, []);

  const stopTracking = useCallback(async () => {
    const taskId = taskIdRef.current;
    let stopFailed = false;

    try {
      // Tear down the foreground service first — drops the notification +
      // releases location resources within seconds (spec §2.4.3).
      await stopWatcher();
      _paused = false;
      await flushBuffer();

      const finalPoint = _lastPoint ? {
        latitude: _lastPoint.latitude,
        longitude: _lastPoint.longitude,
        timestamp: new Date().toISOString(),
      } : null;

      if (taskId) {
        try {
          await tasksService.stopGpsTracking(taskId, { final_point: finalPoint });
        } catch (stopErr) {
          // Stop call failed — points are still in the backend from earlier
          // bulkAddGpsPoints uploads. Fire a best-effort /reprocess so the
          // backend builds the summary anyway. With the server-side lazy-build
          // on /track/geojson this is belt-and-braces; either path recovers
          // the historical view. Don't await — let it run in the background.
          stopFailed = true;
          console.warn('[GPS] Stop call failed — firing reprocess fallback:', stopErr?.message);
          tasksService.reprocessGpsTrack(taskId).catch((reprocessErr) => {
            console.warn('[GPS] Reprocess fallback also failed:', reprocessErr?.message);
          });
        }
      }
    } catch (err) {
      console.error('[GPS] Stop error (pre-API):', err);
    } finally {
      // Local cleanup runs regardless of network outcome — without this, the
      // app gets stuck in "tracking" state on stop failure.
      if (batchIntervalRef.current) clearInterval(batchIntervalRef.current);
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
      if (tokenRefreshIntervalRef.current) clearInterval(tokenRefreshIntervalRef.current);
      batchIntervalRef.current = null;
      durationIntervalRef.current = null;
      tokenRefreshIntervalRef.current = null;

      taskIdRef.current = null;
      startTimeRef.current = null;
      pausedDurationRef.current = 0;
      pauseStartRef.current = null;
      // Close the session — no further points buffer or upload until the next
      // startTracking opens a fresh one.
      _sessionId = null;
      _sessionTaskId = null;
      _sessionStartedAt = null;
      _buffer = [];
      _lastPoint = null;
      // Live-trail buffer: flip the flag (so the map knows tracking ended) but
      // retain the polyline so the user can see what they recorded for a few
      // seconds before navigating away. Next startTracking() resets it.
      _trackActive = false;
      _notifyTrack();

      setIsTracking(false);
      setIsPaused(false);
      setHasBeenStopped(true);
      // Surface a soft notice so the user knows recovery is in progress. Not
      // an error per se — the track will appear when they next open Map.
      if (stopFailed) {
        setError('Network hiccup on stop — track will recover automatically.');
      }
    }
  }, [flushBuffer, stopWatcher]);

  // Resync local hook state from the foreground service on mount. If the
  // service is running (because we started it earlier and a re-mount lost
  // the hook's useState — common when the screen sleeps + RN remounts the
  // screen on resume) we'd otherwise report isTracking=false and miss the
  // stopTracking call on task complete → no summary built.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
        if (!running || cancelled) return;
        // Service is still alive from a prior session. Reflect that locally
        // so the rest of the UI (Complete task → stopTracking gate) behaves.
        setIsTracking(true);
        setIsPaused(_paused);
        _trackActive = true;
        _notifyTrack();

        // Re-arm the per-mount intervals that the previous unmount cleared.
        // Without this, a mid-session remount leaves the OS service streaming
        // points into _buffer with nothing draining it (RAM-only, lost on an
        // OS kill), frozen on-screen stats, and a stalled web live-view —
        // until the user taps Complete. Guard on the ref so we never double-arm
        // when this same mount also ran startTracking.
        if (!batchIntervalRef.current && _sessionId != null) {
          // Restore the duration timer's origin from module scope (the ref was
          // lost on unmount). Pause time accumulated before the remount can't be
          // recovered; treat an in-progress pause as starting now so the timer
          // doesn't count through it.
          startTimeRef.current = _sessionStartedAt || Date.now();
          pauseStartRef.current = _paused ? Date.now() : null;
          taskIdRef.current = _sessionTaskId;
          startBatchInterval();
          startDurationTimer();
          // Resume proactive token refresh too (on-demand refresh still covers
          // us via the interceptor, but keep the belt-and-braces layer alive).
          if (!tokenRefreshIntervalRef.current) {
            tokenRefreshIntervalRef.current = setInterval(() => {
              refreshSession().catch(() => {});
            }, TOKEN_REFRESH_INTERVAL_MS);
          }
        }
      } catch {
        // Best-effort — failure here just means the user has to manually
        // stop GPS before completing the task, which was the prior behaviour.
      }
    })();
    return () => { cancelled = true; };
  }, [startBatchInterval, startDurationTimer]);

  // Cleanup on unmount — DON'T tear the service down here, since RN often
  // unmounts screens transiently (focus changes, lock cycles) while the
  // user is still in-session. stopTracking() is the canonical user exit;
  // unmount only stops the intervals.
  useEffect(() => {
    return () => {
      if (batchIntervalRef.current) clearInterval(batchIntervalRef.current);
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
      if (tokenRefreshIntervalRef.current) clearInterval(tokenRefreshIntervalRef.current);
    };
  }, []);

  return {
    isTracking,
    isPaused,
    hasBeenStopped,
    stats,
    error,
    startTracking,
    pauseTracking,
    resumeTracking,
    stopTracking,
  };
}
