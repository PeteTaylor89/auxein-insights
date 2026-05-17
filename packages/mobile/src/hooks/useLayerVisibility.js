// hooks/useLayerVisibility.js — persistent visibility flags for Map layers.
// Backed by AsyncStorage so toggles survive app restart. Loads asynchronously
// on mount; until loaded, all layers default to ON (matches the no-storage
// experience). Writes are debounced to one AsyncStorage call per toggle.
//
// Returns:
//   visible — { [key]: boolean } (current state, all-true until storage loads)
//   toggle(key) — flip one
//   setVisibility(key, value) — set one explicitly
//   loaded — true once storage has been read

import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'map.layerVisibility:v1';

const DEFAULTS = Object.freeze({
  blocks: true,
  tasks: true,
  assets: true,
  risks: true,
  // Track layer reserved for MAP.8 — gated on an active GPS task.
});

export default function useLayerVisibility() {
  const [visible, setVisible] = useState(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  // Hydrate from AsyncStorage on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (cancelled) return;
        if (raw) {
          const parsed = JSON.parse(raw);
          // Merge with defaults so newly-added keys land enabled instead of undefined.
          setVisible({ ...DEFAULTS, ...parsed });
        }
      } catch (err) {
        console.warn('[useLayerVisibility] hydrate failed', err?.message);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const persist = useCallback(async (next) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (err) {
      console.warn('[useLayerVisibility] persist failed', err?.message);
    }
  }, []);

  const setVisibility = useCallback((key, value) => {
    setVisible(prev => {
      const next = { ...prev, [key]: !!value };
      persist(next);
      return next;
    });
  }, [persist]);

  const toggle = useCallback((key) => {
    setVisible(prev => {
      const next = { ...prev, [key]: !prev[key] };
      persist(next);
      return next;
    });
  }, [persist]);

  return { visible, toggle, setVisibility, loaded };
}
