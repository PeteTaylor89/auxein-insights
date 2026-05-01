// services/syncCoordinator.js — Orchestrates offline → online sync
// Listens for reconnect, drains GPS queue + write queue, exposes sync status
// and last-sync timestamp for UI consumers (banners, headers, profile).
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { flushQueue as flushGpsQueue, getPendingCount as gpsPending } from './gpsQueue';
import { flushWrites, getPendingCount as writePending } from './writeQueue';

const LAST_SYNC_KEY = '@auxein_last_sync';

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

// Manual sync trigger (pull-to-refresh, app resume, etc.)
export async function triggerSync() {
  if (_status === 'syncing') return getSyncStatus();
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
  notify();
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
      triggerSync().catch(() => {});
    }
    if (!online) {
      _status = 'offline';
      notify();
    }
    _wasOnline = online;
  });
}

export function teardownSyncCoordinator() {
  if (_netUnsub) { _netUnsub(); _netUnsub = null; }
}
