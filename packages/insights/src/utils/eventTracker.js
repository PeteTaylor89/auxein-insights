// src/utils/eventTracker.js - Dual-track engagement event system
// Sends to Umami (anonymous) + backend batch API (authenticated)
import { trackEvent } from './analytics';
import publicApi from '../services/publicApi';

const FLUSH_INTERVAL_MS = 15_000; // 15 seconds
const MAX_BATCH_SIZE = 50;

let eventQueue = [];
let flushTimer = null;
let sessionId = null;
let flushing = false;
let failCount = 0;

function getSessionId() {
  if (!sessionId) {
    sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
  return sessionId;
}

function getToken() {
  return localStorage.getItem('public_access_token');
}

/**
 * Queue an engagement event. Immediately sent to Umami; queued for backend batch.
 */
export function queueEvent(eventType, eventData = {}) {
  // Always send to Umami (anonymous)
  trackEvent(eventType, eventData);

  // Queue for backend batch (only if authenticated)
  if (getToken()) {
    eventQueue.push({
      event_type: eventType,
      event_data: eventData,
      session_id: getSessionId(),
    });
  }
}

/**
 * Flush queued events to backend batch endpoint via publicApi (includes auth).
 */
export async function flushEvents() {
  if (eventQueue.length === 0 || flushing) return;
  if (!getToken()) {
    eventQueue = [];
    return;
  }

  flushing = true;
  const batch = eventQueue.splice(0, MAX_BATCH_SIZE);

  try {
    await publicApi.post('/public/events/batch', { events: batch });
    failCount = 0;
  } catch (err) {
    const status = err?.response?.status;
    failCount++;

    // Only re-queue on transient errors (network, 5xx) and if we haven't failed too many times
    if ((!status || status >= 500) && failCount < 5) {
      eventQueue.unshift(...batch);
    }

    if (failCount <= 3) {
      console.warn(`[EventTracker] flush failed (attempt ${failCount}):`, status || err.message);
    }
  } finally {
    flushing = false;
  }
}

/**
 * Best-effort flush using fetch with keepalive (works on page hide/unload).
 * keepalive allows the request to outlive the page, unlike regular XHR.
 */
function beaconFlush() {
  if (eventQueue.length === 0) return;
  const token = getToken();
  if (!token) { eventQueue = []; return; }

  const batch = eventQueue.splice(0, MAX_BATCH_SIZE);
  const baseUrl = publicApi.defaults.baseURL || '';
  const url = `${baseUrl}/public/events/batch`;

  try {
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ events: batch }),
      keepalive: true, // survives page unload
    });
    // Fire-and-forget — no await, no error handling needed for page-hide scenario
  } catch {
    // Best effort — events may be lost on page close, that's acceptable
  }
}

/**
 * Start periodic flushing + page lifecycle listeners.
 */
export function startEventTracking() {
  if (flushTimer) return;
  sessionId = null; // New session
  failCount = 0;

  // Queue a session_start event
  queueEvent('session_start', { timestamp: new Date().toISOString() });

  flushTimer = setInterval(flushEvents, FLUSH_INTERVAL_MS);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('pagehide', handlePageHide);
}

/**
 * Stop tracking: flush remaining events and clear timer.
 */
export function stopEventTracking() {
  flushEvents();
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  window.removeEventListener('pagehide', handlePageHide);
}

function handleVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    beaconFlush();
  }
}

function handlePageHide() {
  beaconFlush();
}

/**
 * Expose queue length for debugging in browser console:
 *   window.__eventTrackerDebug()
 */
if (typeof window !== 'undefined') {
  window.__eventTrackerDebug = () => ({
    queueLength: eventQueue.length,
    sessionId,
    isTracking: !!flushTimer,
    hasToken: !!getToken(),
    failCount,
    queue: [...eventQueue],
  });
}
