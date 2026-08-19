// maps-v2/hooks/useMapFeatureTypes.js — load and mutate the POI vocabulary.
//
// Replaces reading the static MAP_FEATURE_TYPES array directly. The list is now
// per-company: the built-in five (company_id null) plus whatever this company
// has defined, so it has to come from the API.
//
// `version` increments on every change to the list. Phase 4's map layer needs
// that, not just the array: a Mapbox `match` expression is baked at
// setPaintProperty time and will not notice a new type on its own, so something
// has to tell it to rebuild. A version counter is a cheaper dependency than
// deep-comparing the array on every render.
import { useState, useCallback, useEffect, useMemo } from 'react';
import { mapFeatureTypesService } from '@vineyard/shared';

import {
  MAP_FEATURE_TYPES as FALLBACK_TYPES,
  DEFAULT_FEATURE_ICON,
  DEFAULT_FEATURE_COLOR,
} from '../components/mapFeatureTypes';

// The ICON_DEFS key behind DEFAULT_FEATURE_ICON ('v2-poi-note').
const DEFAULT_FEATURE_ICON_KEY = 'poiNote';

// mapFeatureTypes.js stores a Mapbox IMAGE id ('v2-poi-access'); the vocabulary
// stores an ICON_DEFS KEY ('poiAccess'). Spelled out rather than derived: the
// obvious transform ('v2-poi-' -> 'poi', then de-hyphenate) yields 'poiaccess',
// because there is no hyphen left to capitalise after. Five entries is cheaper
// than a regex that is wrong in a way nothing tests.
const ICON_KEY_BY_IMAGE_ID = {
  'v2-poi-access': 'poiAccess',
  'v2-poi-infrastructure': 'poiInfrastructure',
  'v2-poi-water': 'poiWater',
  'v2-poi-amenity': 'poiAmenity',
  'v2-poi-note': 'poiNote',
};

// The built-in five, shaped like API rows. Used only when the request fails —
// an empty picker with no explanation is worse than the familiar five, and the
// map still has to draw the features that already exist.
const FALLBACK_ROWS = FALLBACK_TYPES.map((t, i) => ({
  id: -(i + 1),
  company_id: null,
  slug: t.value,
  label: t.label,
  icon: ICON_KEY_BY_IMAGE_ID[t.iconId] || DEFAULT_FEATURE_ICON_KEY,
  colour: t.color,
  is_active: true,
  is_system: true,
}));

export default function useMapFeatureTypes({ includeInactive = false } = {}) {
  const [types, setTypes] = useState(FALLBACK_ROWS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);
  const [usedFallback, setUsedFallback] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await mapFeatureTypesService.listMapFeatureTypes(
        includeInactive ? { include_inactive: true } : {},
      );
      setTypes(Array.isArray(rows) ? rows : []);
      setUsedFallback(false);
      setError(null);
      setVersion((v) => v + 1);
    } catch (err) {
      console.error('Map feature types load failed:', err);
      // Keep drawing. A map whose POIs lose their icons because a list request
      // failed is a worse outcome than a slightly stale vocabulary.
      setTypes(FALLBACK_ROWS);
      setUsedFallback(true);
      setError(err?.response?.data?.detail || err.message || 'Could not load map types');
      setVersion((v) => v + 1);
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => { load(); }, [load]);

  /** Only the types that may be CHOSEN — retired ones still render, but are
      not offered. */
  const selectableTypes = useMemo(
    () => types.filter((t) => t.is_active !== false),
    [types],
  );

  /** slug -> row, for the layer, the legend and the form's hint line. */
  const typeBySlug = useMemo(
    () => Object.fromEntries(types.map((t) => [t.slug, t])),
    [types],
  );

  /**
   * Resolve a slug to its appearance, falling back rather than rendering
   * nothing. A feature can outlive its type — the type may be retired, or the
   * list request may have failed — and it still has to draw.
   */
  const appearanceFor = useCallback(
    (slug) => {
      const t = typeBySlug[slug];
      return {
        icon: t?.icon || DEFAULT_FEATURE_ICON_KEY,
        colour: t?.colour || DEFAULT_FEATURE_COLOR,
        label: t?.label || slug,
      };
    },
    [typeBySlug],
  );

  const createType = useCallback(async (payload) => {
    const row = await mapFeatureTypesService.createMapFeatureType(payload);
    setTypes((prev) => {
      // A re-activated type comes back with an id already in the list.
      const without = prev.filter((t) => t.id !== row.id);
      return [...without, row];
    });
    setVersion((v) => v + 1);
    return row;
  }, []);

  const updateType = useCallback(async (id, payload) => {
    const row = await mapFeatureTypesService.updateMapFeatureType(id, payload);
    setTypes((prev) => prev.map((t) => (t.id === row.id ? row : t)));
    setVersion((v) => v + 1);
    return row;
  }, []);

  const retireType = useCallback(async (id) => {
    const row = await mapFeatureTypesService.retireMapFeatureType(id);
    setTypes((prev) => prev.map((t) => (t.id === row.id ? row : t)));
    setVersion((v) => v + 1);
    return row;
  }, []);

  return {
    types,
    selectableTypes,
    typeBySlug,
    appearanceFor,
    loading,
    error,
    usedFallback,
    version,
    reload: load,
    createType,
    updateType,
    retireType,
  };
}

export { DEFAULT_FEATURE_ICON, DEFAULT_FEATURE_ICON_KEY, DEFAULT_FEATURE_COLOR };
