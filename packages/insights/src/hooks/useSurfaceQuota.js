// hooks/useSurfaceQuota.js — the anonymous surface demo allowance.
//
// An anonymous visitor gets ONE surface load on the Atlas, then a sign-in
// prompt. A "surface load" is one variable/date combination actually rendered —
// NOT a render. A map re-renders on every pan, zoom and resize, so counting
// renders would burn the allowance before the visitor had looked at anything.
//
// Two rules that matter more than the counting:
//
// 1. **Fail open.** If localStorage is unavailable — private browsing, storage
//    blocked, an embedded context with a partitioned store — the demo is
//    allowed. A visitor who cannot be counted must not be locked out of the
//    only free taste of the product. The cost of being wrong is a second free
//    surface; the cost of the opposite is losing the visitor.
//
// 2. **This is a nudge, not a paywall.** Anyone can clear storage. It exists to
//    prompt registration at a sensible moment. Anything genuinely paid is
//    enforced server-side (backend/core/entitlements.py).
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'insights_surface_demo';
const FREE_SURFACE_LOADS = 1;

function readStore() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { keys: [], available: true };
    const parsed = JSON.parse(raw);
    return { keys: Array.isArray(parsed?.keys) ? parsed.keys : [], available: true };
  } catch {
    // Unreadable or unavailable — treat as "no record" AND flag that we cannot
    // persist, so the caller knows the count is not trustworthy.
    return { keys: [], available: false };
  }
}

function writeStore(keys) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ keys }));
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {boolean} isRegistered  signed-in users have no quota at all
 */
export default function useSurfaceQuota(isRegistered) {
  const [used, setUsed] = useState([]);
  const [storageAvailable, setStorageAvailable] = useState(true);

  useEffect(() => {
    const { keys, available } = readStore();
    setUsed(keys);
    setStorageAvailable(available);
  }, []);

  /** A stable identity for one surface: the thing being spent, not the render. */
  const surfaceKey = useCallback(
    (variable, validAt) => `${variable}@${validAt}`,
    [],
  );

  /**
   * Can this surface be shown? Already-seen surfaces stay viewable — re-opening
   * the one you were allowed to see is not a second load, and locking someone
   * out of a surface still on their screen reads as a bug.
   */
  const canLoad = useCallback(
    (variable, validAt) => {
      if (isRegistered) return true;
      if (!storageAvailable) return true; // fail open
      const key = surfaceKey(variable, validAt);
      if (used.includes(key)) return true;
      return used.length < FREE_SURFACE_LOADS;
    },
    [isRegistered, storageAvailable, used, surfaceKey],
  );

  /** Spend the allowance. Idempotent per surface. Returns the new count. */
  const recordLoad = useCallback(
    (variable, validAt) => {
      if (isRegistered) return 0;
      const key = surfaceKey(variable, validAt);
      let next = used;
      setUsed((prev) => {
        if (prev.includes(key)) { next = prev; return prev; }
        next = [...prev, key];
        writeStore(next);
        return next;
      });
      return next.length;
    },
    [isRegistered, used, surfaceKey],
  );

  const reset = useCallback(() => {
    setUsed([]);
    writeStore([]);
  }, []);

  return {
    canLoad,
    recordLoad,
    reset,
    surfaceKey,
    used: used.length,
    limit: FREE_SURFACE_LOADS,
    // True once the allowance is spent and the next NEW surface needs sign-in.
    exhausted: !isRegistered && storageAvailable && used.length >= FREE_SURFACE_LOADS,
    storageAvailable,
  };
}
