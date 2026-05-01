// services/writeQueue.js — Persistent offline queue for write operations
// Operations are typed; handlers register their dispatch fn at startup.
// Mirrors gpsQueue.js semantics: 4xx (non-408) drops the entry, 5xx/network keeps it.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { checkNetwork } from '../hooks/useNetworkStatus';

const QUEUE_KEY = '@auxein_write_queue';
const handlers = new Map(); // type → async (payload) => unused
let _flushing = false;
let _pendingCount = 0;
let _listeners = [];

function notify() { _listeners.forEach(fn => fn(_pendingCount)); }

export function onPendingCountChange(fn) {
  _listeners.push(fn);
  fn(_pendingCount);
  return () => { _listeners = _listeners.filter(f => f !== fn); };
}

export function getPendingCount() { return _pendingCount; }

// Register a dispatch handler for a given operation type.
// Phase 4+ will register concrete handlers (task.complete, row.complete, etc.).
export function registerHandler(type, handlerFn) {
  handlers.set(type, handlerFn);
}

async function loadQueue() {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function saveQueue(queue) {
  _pendingCount = queue.length;
  notify();
  try { await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); }
  catch (e) { console.warn('[WriteQueue] Save failed:', e.message); }
}

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Enqueue an operation. Returns the assigned client ID.
export async function enqueueWrite({ type, payload, optimisticKey = null }) {
  const queue = await loadQueue();
  const entry = {
    id: makeId(),
    type,
    payload,
    optimisticKey,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  };
  queue.push(entry);
  await saveQueue(queue);
  console.log(`[WriteQueue] Queued ${type} (${queue.length} pending)`);
  return entry.id;
}

// Attempt to flush the queue. Calls registered handlers in FIFO order.
// Returns { synced, dropped, remaining } counts.
export async function flushWrites() {
  if (_flushing) return { synced: 0, dropped: 0, remaining: _pendingCount };
  _flushing = true;

  const result = { synced: 0, dropped: 0, remaining: 0 };
  try {
    const online = await checkNetwork();
    if (!online) { result.remaining = _pendingCount; return result; }

    const queue = await loadQueue();
    if (queue.length === 0) return result;

    const remaining = [];
    for (const entry of queue) {
      const handler = handlers.get(entry.type);
      if (!handler) {
        // Unknown type — keep so a future build can drain it
        console.warn(`[WriteQueue] No handler for ${entry.type}, keeping entry`);
        remaining.push(entry);
        continue;
      }
      try {
        await handler(entry.payload, entry);
        result.synced += 1;
        console.log(`[WriteQueue] Synced ${entry.type}`);
      } catch (err) {
        const status = err?.response?.status;
        if (status && status >= 400 && status < 500 && status !== 408) {
          console.warn(`[WriteQueue] Dropping ${entry.type}: ${status}`);
          result.dropped += 1;
        } else {
          entry.attempts = (entry.attempts || 0) + 1;
          remaining.push(entry);
        }
      }
    }

    await saveQueue(remaining);
    result.remaining = remaining.length;
    if (remaining.length === 0) console.log('[WriteQueue] Fully synced');
  } finally {
    _flushing = false;
  }
  return result;
}

export async function initWriteQueue() {
  const queue = await loadQueue();
  _pendingCount = queue.length;
  notify();
}
