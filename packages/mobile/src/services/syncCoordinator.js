// services/syncCoordinator.js — Orchestrates offline → online sync
// Listens for reconnect, drains GPS queue + write queue, exposes sync status
// and last-sync timestamp for UI consumers (banners, headers, profile).
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { flushQueue as flushGpsQueue, getPendingCount as gpsPending } from './gpsQueue';
import { flushWrites, getPendingCount as writePending, onPendingCountChange } from './writeQueue';

const LAST_SYNC_KEY = '@auxein_last_sync';

// Reconnect alone isn't enough. A write can fail on transport while the device
// still reports a connection — captive portal, dead cell in the block, server
// unreachable — and no offline→online edge ever fires to clear it. So anything
// left in the queue is retried on a backoff for as long as it's still there.
const RETRY_STEPS_MS = [15000, 30000, 60000, 120000, 300000];
let _retryTimer = null;
let _retryStep = 0;
let _pendingUnsub = null;

// Status values: 'idle' | 'syncing' | 'offline' | 'error'
let _status = 'idle';
let _lastSyncedAt = null;
let _listeners = [];
let _netUnsub = null;
let _wasOnline = true;

function notify() {
  const snapshot = {
    status: _status,
    lastSyncedAt: _lastSyncedAt,
    pending: gpsPending() + writePending(),
  };
  _listeners.forEach(fn => fn(snapshot));
}

export function onSyncStatusChange(fn) {
  _listeners.push(fn);
  fn({ status: _status, lastSyncedAt: _lastSyncedAt, pending: gpsPending() + writePending() });
  return () => { _listeners = _listeners.filter(f => f !== fn); };
}

export function getSyncStatus() {
  return { status: _status, lastSyncedAt: _lastSyncedAt, pending: gpsPending() + writePending() };
}

async function persistLastSync() {
  _lastSyncedAt = new Date().toISOString();
  try { await AsyncStorage.setItem(LAST_SYNC_KEY, _lastSyncedAt); } catch {}
}

async function loadLastSync() {
  try { _lastSyncedAt = await AsyncStorage.getItem(LAST_SYNC_KEY); } catch {}
}

function clearRetry() {
  if (_retryTimer) { clearTimeout(_retryTimer); _retryTimer = null; }
}

// Schedule the next attempt, backing off while the queue refuses to drain and
// resetting as soon as it does.
function scheduleRetry(madeProgress) {
  clearRetry();
  if (writePending() + gpsPending() === 0) { _retryStep = 0; return; }
  if (madeProgress) _retryStep = 0;
  const delay = RETRY_STEPS_MS[Math.min(_retryStep, RETRY_STEPS_MS.length - 1)];
  _retryStep += 1;
  _retryTimer = setTimeout(() => {
    _retryTimer = null;
    if (!_wasOnline) return; // the reconnect listener will pick it up
    triggerSync().catch(() => {});
  }, delay);
}

// Manual sync trigger (pull-to-refresh, app resume, banner tap, backoff timer).
export async function triggerSync() {
  if (_status === 'syncing') return getSyncStatus();
  const before = writePending() + gpsPending();
  _status = 'syncing';
  notify();
  try {
    await Promise.all([flushGpsQueue(), flushWrites()]);
    if (gpsPending() + writePending() === 0) await persistLastSync();
    _status = 'idle';
  } catch (e) {
    console.warn('[Sync] Trigger failed:', e?.message);
    _status = 'error';
  }
  const after = writePending() + gpsPending();
  notify();
  scheduleRetry(after < before);
  return getSyncStatus();
}

// Wire reconnect detection. Call once at app startup post-auth.
export async function initSyncCoordinator() {
  await loadLastSync();
  if (_netUnsub) return; // idempotent

  // Seed wasOnline from current state
  const initial = await NetInfo.fetch();
  _wasOnline = initial.isConnected && initial.isInternetReachable !== false;
  _status = _wasOnline ? 'idle' : 'offline';
  notify();

  _netUnsub = NetInfo.addEventListener(state => {
    const online = state.isConnected && state.isInternetReachable !== false;
    if (!_wasOnline && online) {
      // offline → online transition: drain queues
      _retryStep = 0;
      triggerSync().catch(() => {});
    }
    if (!online) {
      _status = 'offline';
      clearRetry();
      notify();
    }
    _wasOnline = online;
  });

  // A write that fails while nominally online queues without any network edge
  // to trigger a drain, so start the backoff as soon as something lands in the
  // queue rather than waiting for the next reconnect.
  _pendingUnsub = onPendingCountChange(count => {
    if (count > 0 && !_retryTimer && _status !== 'syncing' && _wasOnline) {
      scheduleRetry(false);
    }
    if (count === 0) { clearRetry(); _retryStep = 0; }
  });
}

export function teardownSyncCoordinator() {
  if (_netUnsub) { _netUnsub(); _netUnsub = null; }
  if (_pendingUnsub) { _pendingUnsub(); _pendingUnsub = null; }
  clearRetry();
}
