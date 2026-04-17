// services/gpsQueue.js — Persistent offline queue for GPS points
// Stores failed bulk uploads in AsyncStorage. Flushes when online.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { checkNetwork } from '../hooks/useNetworkStatus';
import { tasksService } from '../api/services';

const QUEUE_KEY = '@auxein_gps_queue';
let _flushing = false;
let _pendingCount = 0;
let _listeners = [];

function notifyListeners() {
  _listeners.forEach(fn => fn(_pendingCount));
}

export function onPendingCountChange(fn) {
  _listeners.push(fn);
  fn(_pendingCount);
  return () => { _listeners = _listeners.filter(f => f !== fn); };
}

async function loadQueue() {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function saveQueue(queue) {
  try {
    _pendingCount = queue.reduce((sum, entry) => sum + entry.points.length, 0);
    notifyListeners();
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.warn('[GPSQueue] Failed to save queue:', e.message);
  }
}

// Enqueue a failed batch of GPS points for later sync
export async function enqueuePoints(taskId, points) {
  const queue = await loadQueue();
  queue.push({ taskId, points, queuedAt: new Date().toISOString() });
  await saveQueue(queue);
  console.log(`[GPSQueue] Queued ${points.length} points for task ${taskId} (${_pendingCount} total pending)`);
}

// Attempt to flush the queue — call on reconnect or periodically
export async function flushQueue() {
  if (_flushing) return;
  _flushing = true;

  try {
    const isOnline = await checkNetwork();
    if (!isOnline) return;

    const queue = await loadQueue();
    if (queue.length === 0) return;

    const remaining = [];
    for (const entry of queue) {
      try {
        await tasksService.bulkAddGpsPoints(entry.taskId, { points: entry.points });
        console.log(`[GPSQueue] Synced ${entry.points.length} points for task ${entry.taskId}`);
      } catch (err) {
        const status = err.response?.status;
        if (status && status >= 400 && status < 500 && status !== 408) {
          // 4xx (except timeout) = permanent failure, drop the entry
          console.warn(`[GPSQueue] Dropping ${entry.points.length} points for task ${entry.taskId}: ${status}`);
        } else {
          // Network error or 5xx = keep for retry
          remaining.push(entry);
        }
      }
    }

    await saveQueue(remaining);
    if (remaining.length === 0) {
      console.log('[GPSQueue] Queue fully synced');
    } else {
      console.log(`[GPSQueue] ${remaining.length} entries remaining`);
    }
  } finally {
    _flushing = false;
  }
}

// Get current pending count (synchronous, from memory)
export function getPendingCount() {
  return _pendingCount;
}

// Initialize — load count from storage on app start
export async function initQueue() {
  const queue = await loadQueue();
  _pendingCount = queue.reduce((sum, entry) => sum + entry.points.length, 0);
  notifyListeners();
}
