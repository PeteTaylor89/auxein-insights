// hooks/useAssetGeojson.js — fetch /assets/geojson on mount.
// Mirrors useBlockGeojson — same loading/error/refetch contract.
// Backend already property-scoped via build_asset_scope_filter.

import { useCallback, useEffect, useState } from 'react';
import { assetService } from '../api/services';

export default function useAssetGeojson({ category = null, propertyId = null, enabled = true } = {}) {
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
      const res = await assetService.getAssetsGeoJson(category, propertyId);
      setData(res || { type: 'FeatureCollection', features: [] });
    } catch (err) {
      console.warn('[useAssetGeojson] fetch failed', err?.response?.status, err?.message);
      setError(err?.response?.data?.detail || err?.message || 'Failed to load assets');
      setData({ type: 'FeatureCollection', features: [] });
    } finally {
      setLoading(false);
    }
  }, [category, propertyId, enabled]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, refetch: load };
}
