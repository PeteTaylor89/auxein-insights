// hooks/usePersistentState.js — view preferences (filters, sort, grouping) that
// survive a reload.
//
// Scoped to the signed-in user AND their company, so two people sharing a
// browser — and one person switching companies — never inherit each other's
// filters. Storage failures are swallowed: a full, blocked or private-mode
// localStorage degrades to plain in-memory state rather than breaking the page.
import { useState, useEffect } from 'react';
import { authService } from '@vineyard/shared';

function scopedKey(key) {
  let meta = {};
  try {
    meta = authService.getAuthMetadata() || {};
  } catch {
    // Signed out or unparseable metadata — fall through to the anonymous key.
  }
  return `auxein:${key}:${meta.companyId ?? 'nc'}:${meta.userId ?? 'nu'}`;
}

function read(key) {
  try {
    const raw = localStorage.getItem(scopedKey(key));
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(scopedKey(key), JSON.stringify(value));
  } catch {
    // Quota exceeded or storage blocked.
  }
}

/**
 * A plain value (string, number, boolean) persisted under `key`.
 * `isValid` guards against a stored value left behind by an older build — an
 * unrecognised sort key would otherwise sort by nothing, silently.
 */
export function usePersistentState(key, initial, isValid) {
  const [value, setValue] = useState(() => {
    const stored = read(key);
    if (stored === undefined) return initial;
    return isValid && !isValid(stored) ? initial : stored;
  });

  useEffect(() => { write(key, value); }, [key, value]);

  return [value, setValue];
}

/**
 * A multi-select filter Set, persisted as an array — a Set isn't JSON
 * serialisable. The returned setter has the same signature as useState's, so
 * this is a drop-in for `useState(() => new Set())`.
 */
export function usePersistentSet(key) {
  const [value, setValue] = useState(() => {
    const stored = read(key);
    return new Set(Array.isArray(stored) ? stored : []);
  });

  useEffect(() => { write(key, [...value]); }, [key, value]);

  return [value, setValue];
}

/**
 * Drop restored selections whose option no longer exists — a user who left the
 * company, a block that was renamed. Without this a stale value filters the
 * table to nothing while no chip is on screen to unclick, and Clear is the only
 * way out.
 *
 * `ready` must stay false until the option list has actually loaded, otherwise
 * the first render (empty list) wipes the very selections we just restored.
 */
export function usePruneToOptions(setValue, validValues, ready) {
  const signature = validValues.join('\u0000');
  useEffect(() => {
    if (!ready) return;
    const allowed = new Set(validValues);
    setValue(prev => {
      const kept = [...prev].filter(v => allowed.has(v));
      return kept.length === prev.size ? prev : new Set(kept);
    });
  }, [ready, signature, setValue]);
}
