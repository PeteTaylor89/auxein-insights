// maps-v2/hooks/useBuilderState.js — Persist/restore builder layer config (localStorage)
import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY_PREFIX = 'v2-builder-state';

function getStorageKey(companyId) {
  return `${STORAGE_KEY_PREFIX}-${companyId || 'default'}`;
}

const defaultState = {
  activeLayers: [],   // array of layer IDs in z-order (bottom to top)
  opacity: {},        // { [layerId]: number 0-1 }
};

/**
 * Hook that persists builder layer configuration to localStorage.
 * Keyed by company_id so each tenant has its own config.
 *
 * @param {string|null} companyId
 * @returns builder state API
 */
export default function useBuilderState(companyId) {
  const [state, setState] = useState(() => {
    try {
      const stored = localStorage.getItem(getStorageKey(companyId));
      return stored ? { ...defaultState, ...JSON.parse(stored) } : defaultState;
    } catch {
      return defaultState;
    }
  });

  // Persist on change
  useEffect(() => {
    try {
      localStorage.setItem(getStorageKey(companyId), JSON.stringify(state));
    } catch {
      // localStorage may be full
    }
  }, [state, companyId]);

  // Reload when company changes
  useEffect(() => {
    try {
      const stored = localStorage.getItem(getStorageKey(companyId));
      if (stored) {
        setState({ ...defaultState, ...JSON.parse(stored) });
      } else {
        setState(defaultState);
      }
    } catch {
      setState(defaultState);
    }
  }, [companyId]);

  const isLayerActive = useCallback((layerId) => {
    return state.activeLayers.includes(layerId);
  }, [state.activeLayers]);

  const toggleLayer = useCallback((layerId) => {
    setState((prev) => {
      const active = prev.activeLayers.includes(layerId);
      return {
        ...prev,
        activeLayers: active
          ? prev.activeLayers.filter((id) => id !== layerId)
          : [...prev.activeLayers, layerId],
      };
    });
  }, []);

  const setLayerOpacity = useCallback((layerId, opacity) => {
    setState((prev) => ({
      ...prev,
      opacity: { ...prev.opacity, [layerId]: opacity },
    }));
  }, []);

  const getLayerOpacity = useCallback((layerId) => {
    return state.opacity[layerId] ?? 0.5;
  }, [state.opacity]);

  const reorderLayers = useCallback((newOrder) => {
    setState((prev) => ({
      ...prev,
      activeLayers: newOrder,
    }));
  }, []);

  const moveLayer = useCallback((layerId, direction) => {
    setState((prev) => {
      const idx = prev.activeLayers.indexOf(layerId);
      if (idx === -1) return prev;

      const newOrder = [...prev.activeLayers];
      const targetIdx = direction === 'up' ? idx + 1 : idx - 1;
      if (targetIdx < 0 || targetIdx >= newOrder.length) return prev;

      [newOrder[idx], newOrder[targetIdx]] = [newOrder[targetIdx], newOrder[idx]];
      return { ...prev, activeLayers: newOrder };
    });
  }, []);

  return {
    activeLayers: state.activeLayers,
    isLayerActive,
    toggleLayer,
    getLayerOpacity,
    setLayerOpacity,
    reorderLayers,
    moveLayer,
  };
}
