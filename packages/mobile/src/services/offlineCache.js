// services/offlineCache.js — Generic stale-while-revalidate cache
// Stores keyed responses in AsyncStorage with a fetched-at timestamp.
// Read-side helpers; consumers decide when to call swr() vs raw get().
import AsyncStorage from '@react-native-async-storage/async-storage';
import { checkNetwork } from '../hooks/useNetworkStatus';

const PREFIX = '@auxein_cache:';
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24; // 24h before considered stale

function k(key) { return PREFIX + key; }

export async function cacheGet(key, ttlMs = DEFAULT_TTL_MS) {
  try {
    const raw = await AsyncStorage.getItem(k(key));
    if (!raw) return null;
    const entry = JSON.parse(raw);
    const age = Date.now() - (entry.fetchedAt || 0);
    return {
      data: entry.data,
      fetchedAt: entry.fetchedAt,
      isStale: age > ttlMs,
    };
  } catch {
    return null;
  }
}

export async function cacheSet(key, data) {
  try {
    await AsyncStorage.setItem(k(key), JSON.stringify({ data, fetchedAt: Date.now() }));
  } catch (e) {
    console.warn('[Cache] Failed to set', key, e.message);
  }
}

export async function cacheClear(key) {
  try { await AsyncStorage.removeItem(k(key)); } catch {}
}

export async function cacheClearAll() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter(x => x.startsWith(PREFIX));
    if (ours.length) await AsyncStorage.multiRemove(ours);
  } catch {}
}

// Stale-while-revalidate: returns cached data immediately (if any) via onCached,
// then attempts a fresh fetch when online and calls onFresh with the new data.
// Returns the freshest available value as a single promise resolution.
export async function swr(key, fetcher, { ttlMs = DEFAULT_TTL_MS, onCached, onFresh } = {}) {
  const cached = await cacheGet(key, ttlMs);
  if (cached && onCached) onCached(cached);

  const online = await checkNetwork();
  if (!online) {
    return cached ? cached.data : null;
  }

  try {
    const fresh = await fetcher();
    await cacheSet(key, fresh);
    if (onFresh) onFresh(fresh);
    return fresh;
  } catch (err) {
    if (cached) return cached.data;
    throw err;
  }
}
