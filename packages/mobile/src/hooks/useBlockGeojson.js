// hooks/useBlockGeojson.js — fetch /blocks/geojson on mount + expose
// { data, loading, error, refetch }. No caching layer yet — the response is
// small (~10–100KB for V1 customers) and re-fetched per Map mount. Cache
// can land alongside the OFF.3 sweep when needed.

import { useCallback, useEffect, useState } from 'react';
import { blocksService } from '../api/services';

export default function useBlockGeojson(propertyId = null, { enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!enabled) {
      setData({ type: 'FeatureCollection', features: [] });
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Service today ignores its arg — we pass propertyId here so the call site
      // is forward-compatible with MAP.3's property switcher. The backend
      // already supports the query param.
      const res = await blocksService.getBlocksGeoJson(propertyId);
      setData(res || { type: 'FeatureCollection', features: [] });
    } catch (err) {
      console.warn('[useBlockGeojson] fetch failed', err?.response?.status, err?.message);
      setError(err?.response?.data?.detail || err?.message || 'Failed to load blocks');
      setData({ type: 'FeatureCollection', features: [] });
    } finally {
      setLoading(false);
    }
  }, [propertyId, enabled]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, refetch: load };
}
