// services/writeQueue.js — Persistent offline queue for write operations
//
// Two kinds of entry live here:
//
//   'http'  — a replayed request, captured from the axios config of a call that
//             never reached the server. This is how nearly everything queues:
//             one mechanism instead of a bespoke handler per endpoint.
//   custom  — a typed entry with a handler registered via registerHandler(),
//             for work that isn't a straight request replay (see gpsQueue).
//
// SAFETY BOUNDARY — only requests that provably never executed are queued.
// The server has no idempotency keys, so replaying a POST whose response was
// merely lost would double-create. api.js therefore queues only on a transport
// failure (no `error.response` at all), which means the request never landed.
// A 5xx is NOT queued: the server saw it and may have applied it.
//
// ORDERING — the drain stops at the first transport failure rather than
// skipping ahead. Later entries routinely depend on earlier ones (complete a
// row on a task that is itself still queued), so FIFO has to hold.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { checkNetwork } from '../hooks/useNetworkStatus';

const QUEUE_KEY = '@auxein_write_queue';
const RESULTS_KEY = '@auxein_write_queue_results';
const HTTP_TYPE = 'http';

const handlers = new Map(); // type → async (payload, entry) => result
let _flushing = false;
let _pendingCount = 0;
let _listeners = [];

// Set by api.js at startup. Kept as an injected function so this module never
// imports the axios instance — api.js already imports this one, and a cycle
// between them would leave one side undefined at require time.
let _httpReplayer = null;
export function setHttpReplayer(fn) { _httpReplayer = fn; }

function notify() { _listeners.forEach(fn => fn(_pendingCount)); }

export function onPendingCountChange(fn) {
  _listeners.push(fn);
  fn(_pendingCount);
  return () => { _listeners = _listeners.filter(f => f !== fn); };
}

export function getPendingCount() { return _pendingCount; }

// Register a dispatch handler for a non-http operation type.
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

// Server responses for entries that already synced, keyed by entry id. A later
// entry referencing `{__ref}` resolves against this. Pruned once nothing in the
// queue still points at an id.
async function loadResults() {
  try {
    const raw = await AsyncStorage.getItem(RESULTS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

async function saveResults(results) {
  try { await AsyncStorage.setItem(RESULTS_KEY, JSON.stringify(results)); } catch {}
}

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---- Reference resolution -------------------------------------------------
// A queued create returns no real id, so anything queued behind it has to carry
// a placeholder instead: { __ref: '<entryId>', path: 'id' }. At flush time the
// placeholder is swapped for the value the server actually returned.

export function ref(entryId, path = 'id') {
  return { __ref: entryId, path };
}

function isRef(v) {
  return v && typeof v === 'object' && typeof v.__ref === 'string';
}

// The id to use when building a URL or payload from a record that may itself
// still be queued. A queued create has no server id yet, so this yields a token
// that resolveRefs() swaps for the real one at flush time. Without it, a URL
// built from a queued parent would read `/observation-runs/undefined/spots`.
export function idFor(created) {
  if (created && typeof created === 'object') {
    if (created.__queued && created.__entryId) return `{{ref:${created.__entryId}}}`;
    return created.id;
  }
  return created;
}

// The same idea for a value that goes in a request BODY rather than a URL.
// A body keeps its types, so this yields the structured {__ref} form instead of
// a string token — sending "{{ref:abc}}" where the server expects an integer
// would just 422.
export function refOrId(created) {
  if (created && typeof created === 'object') {
    if (created.__queued && created.__entryId) return ref(created.__entryId, 'id');
    return created.id ?? null;
  }
  return created ?? null;
}

class UnresolvedRef extends Error {}

function readPath(obj, path) {
  return String(path || 'id').split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

function resolveRefs(value, results) {
  if (isRef(value)) {
    const source = results[value.__ref];
    if (source === undefined) throw new UnresolvedRef(value.__ref);
    const resolved = readPath(source, value.path);
    if (resolved === undefined) throw new UnresolvedRef(value.__ref);
    return resolved;
  }
  if (Array.isArray(value)) return value.map(v => resolveRefs(v, results));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveRefs(v, results);
    return out;
  }
  // A URL captured before its parent existed, e.g. /tasks/{{ref:abc}}/complete
  if (typeof value === 'string' && value.includes('{{ref:')) {
    return value.replace(/\{\{ref:([^}:]+)(?::([^}]+))?\}\}/g, (_, id, path) => {
      const source = results[id];
      if (source === undefined) throw new UnresolvedRef(id);
      const v = readPath(source, path || 'id');
      if (v === undefined) throw new UnresolvedRef(id);
      return String(v);
    });
  }
  return value;
}

// ---- Enqueue --------------------------------------------------------------

// Enqueue an operation. Returns the assigned client ID, which callers can hand
// to ref() so dependent work queues behind this one.
export async function enqueueWrite({ type = HTTP_TYPE, payload, label = null, optimisticKey = null }) {
  const queue = await loadQueue();
  const entry = {
    id: makeId(),
    type,
    payload,
    label,
    optimisticKey,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  };
  queue.push(entry);
  await saveQueue(queue);
  console.log(`[WriteQueue] Queued ${label || type} (${queue.length} pending)`);
  return entry.id;
}

// Convenience for api.js: capture a failed axios config for later replay.
export async function enqueueRequest(config, label) {
  return enqueueWrite({
    type: HTTP_TYPE,
    label: label || `${String(config.method || 'post').toUpperCase()} ${config.url}`,
    payload: {
      method: config.method || 'post',
      url: config.url,
      data: config.data,
      params: config.params,
      headers: config.headers,
      baseURL: config.baseURL,
    },
  });
}

// ---- Flush ----------------------------------------------------------------

export async function flushWrites() {
  if (_flushing) return { synced: 0, dropped: 0, remaining: _pendingCount };
  _flushing = true;

  const result = { synced: 0, dropped: 0, remaining: 0, blocked: false };
  try {
    const online = await checkNetwork();
    if (!online) { result.remaining = _pendingCount; return result; }

    const queue = await loadQueue();
    if (queue.length === 0) return result;

    const results = await loadResults();
    const remaining = [];
    let halted = false;

    for (const entry of queue) {
      // Once the drain halts, everything behind it keeps its place in line.
      if (halted) { remaining.push(entry); continue; }

      const handler = entry.type === HTTP_TYPE ? _httpReplayer : handlers.get(entry.type);
      if (!handler) {
        console.warn(`[WriteQueue] No handler for ${entry.type}, keeping entry`);
        remaining.push(entry);
        continue;
      }

      let payload;
      try {
        payload = resolveRefs(entry.payload, results);
      } catch (err) {
        if (err instanceof UnresolvedRef) {
          // Parent hasn't synced (or was dropped). Hold this one and stop —
          // applying anything behind it would reorder dependent work.
          console.warn(`[WriteQueue] ${entry.label}: waiting on ${err.message}`);
          remaining.push(entry);
          halted = true;
          result.blocked = true;
          continue;
        }
        throw err;
      }

      try {
        const res = await handler(payload, entry);
        results[entry.id] = res ?? null;
        result.synced += 1;
        console.log(`[WriteQueue] Synced ${entry.label || entry.type}`);
      } catch (err) {
        const status = err?.response?.status;
        if (!err?.response) {
          // Transport failure — still offline. Stop; keep FIFO intact.
          entry.attempts = (entry.attempts || 0) + 1;
          remaining.push(entry);
          halted = true;
          continue;
        }
        if (status >= 400 && status < 500 && status !== 408) {
          // The server understood and refused. Replaying won't help.
          console.warn(`[WriteQueue] Dropping ${entry.label || entry.type}: ${status}`);
          result.dropped += 1;
        } else {
          entry.attempts = (entry.attempts || 0) + 1;
          remaining.push(entry);
          halted = true;
        }
      }
    }

    await saveQueue(remaining);
    // Keep only results still referenced by something in the queue.
    const stillNeeded = new Set();
    const scan = (v) => {
      if (isRef(v)) stillNeeded.add(v.__ref);
      else if (Array.isArray(v)) v.forEach(scan);
      else if (v && typeof v === 'object') Object.values(v).forEach(scan);
      else if (typeof v === 'string') {
        const m = v.matchAll(/\{\{ref:([^}:]+)/g);
        for (const hit of m) stillNeeded.add(hit[1]);
      }
    };
    remaining.forEach(e => scan(e.payload));
    await saveResults(
      Object.fromEntries(Object.entries(results).filter(([k]) => stillNeeded.has(k)))
    );

    result.remaining = remaining.length;
    if (remaining.length === 0) console.log('[WriteQueue] Fully synced');
  } finally {
    _flushing = false;
  }
  return result;
}

// A readable list for the sync screen — what is actually waiting.
export async function listPending() {
  const queue = await loadQueue();
  return queue.map(e => ({
    id: e.id,
    label: e.label || e.type,
    queuedAt: e.queuedAt,
    attempts: e.attempts || 0,
  }));
}

export async function clearQueue() {
  await saveQueue([]);
  await saveResults({});
}

export async function initWriteQueue() {
  const queue = await loadQueue();
  _pendingCount = queue.length;
  notify();
}
