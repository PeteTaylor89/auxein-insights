// hooks/useRiskGeojson.js — Build a GeoJSON FeatureCollection of active risks
// for the Map by composing two existing endpoints (no new backend route).
//
// Mirrors the web's `useRisksLayer` pattern:
//   1. GET /risk-management/risks/ (paginated summaries, no geometry)
//   2. GET /risk-management/risks/{id} for each (returns `location` Point GeoJSON)
//
// Per-detail failures are tolerated via Promise.allSettled — a single broken
// risk doesn't kill the layer. N+1 is fine for V1 customer sizes (<20 risks);
// once that bites a larger customer, this hook can switch to a server-side
// /risks/geojson aggregator endpoint without touching the screen.

import { useCallback, useEffect, useState } from 'react';
import { riskService } from '../api/services';

export default function useRiskGeojson({ status = 'active', propertyId = null, enabled = true } = {}) {
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
      const params = {};
      if (status) params.status = status;
      // Backend list endpoint accepts property_id — pushing the filter down
      // gives contractors a smaller, scoped payload and works for them too
      // (the endpoint was contractor-aware as of phase 4).
      if (propertyId) params.property_id = propertyId;
      const list = await riskService.getRisks(params);
      if (!Array.isArray(list) || list.length === 0) {
        setData({ type: 'FeatureCollection', features: [] });
        return;
      }

      // Fetch each risk's detail in parallel for the geometry. The summary
      // endpoint deliberately omits geometry to keep payloads small.
      const settled = await Promise.allSettled(list.map(r => riskService.getRisk(r.id)));

      const features = [];
      settled.forEach((res, idx) => {
        if (res.status !== 'fulfilled') return;
        const detail = res.value || {};
        const summary = list[idx] || {};

        // Backend returns `location` as a Point GeoJSON (or null). `area` is
        // similarly serialized for polygon-shaped risks — both render in the
        // map layer via geometry-type filters.
        const geom = detail.area || detail.location;
        if (!geom || !geom.type) return;

        features.push({
          type: 'Feature',
          geometry: geom,
          properties: {
            id: summary.id,
            risk_title: summary.risk_title || detail.risk_title || 'Risk',
            risk_category: summary.risk_category || detail.risk_category || '',
            risk_type: summary.risk_type || detail.risk_type || '',
            inherent_risk_level: summary.inherent_risk_level || detail.inherent_risk_level || 'medium',
            residual_risk_level: summary.residual_risk_level || detail.residual_risk_level || null,
            status: summary.status || detail.status || 'active',
            owner_id: summary.owner_id || detail.owner_id || null,
            location_description: detail.location_description || '',
            property_id: summary.property_id ?? detail.property_id ?? null,
          },
        });
      });

      // Property scoping (client-side). Includes company-wide risks (null
      // property_id) so they show regardless of the active property filter —
      // matches the backend asset-scoping rule for consistency.
      const filtered = propertyId
        ? features.filter((f) => {
            const pid = f.properties?.property_id;
            return pid === null || pid === undefined || pid === propertyId;
          })
        : features;

      setData({ type: 'FeatureCollection', features: filtered });
    } catch (err) {
      console.warn('[useRiskGeojson] fetch failed', err?.response?.status, err?.message);
      setError(err?.response?.data?.detail || err?.message || 'Failed to load risks');
      setData({ type: 'FeatureCollection', features: [] });
    } finally {
      setLoading(false);
    }
  }, [status, propertyId, enabled]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, refetch: load };
}
