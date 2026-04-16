// maps-v2/hooks/useRisksLayer.js — Fetch + render risks as circle markers
import { useEffect, useState, useCallback, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { riskManagementService } from '@vineyard/shared';
import { removeLayers } from '../utils/geometry';
import { RISK_COLORS } from '../utils/layerColors';

const SOURCE_ID = 'v2-risks';
const LAYER_ID = 'v2-risks-circles'; // keep ID for click handler compat

/**
 * Hook that manages the risks layer on the map.
 *
 * @param {mapboxgl.Map|null} map
 * @param {boolean} mapReady
 * @param {boolean} visible — whether the layer is toggled on
 * @returns {{ risksData, riskCount, loading, error, refresh }}
 */
export default function useRisksLayer(map, mapReady, visible) {
  const [risksData, setRisksData] = useState(null);
  const [riskCount, setRiskCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const addedRef = useRef(false);

  // --- Fetch ---
  const fetchRisks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // 1) Get summary list (no geometry)
      const list = await riskManagementService.getRisksWithFilters({
        risk_type: '',
        risk_level: '',
        status: 'active',
      });

      if (!list || list.length === 0) {
        setRisksData({ type: 'FeatureCollection', features: [] });
        setRiskCount(0);
        return;
      }

      // Show count from list (summary has no geometry)
      setRiskCount(list.length);

      // Fetch each risk's detail to get location (Point GeoJSON)
      // NOTE: Backend currently returns 500 on individual risk detail endpoints.
      // Wrap in try so a broken detail API doesn't block the sidebar count.
      const features = [];
      try {
        const detailResults = await Promise.allSettled(
          list.map((r) => riskManagementService.getRiskById(r.id)),
        );

        detailResults.forEach((res, idx) => {
          if (res.status !== 'fulfilled') return;
          const risk = res.value;
          const loc = risk.location;
          if (!loc || loc.type !== 'Point') return;

          const summary = list[idx];
          features.push({
            type: 'Feature',
            geometry: loc,
            properties: {
              id: summary.id,
              title: summary.risk_title || risk.risk_title || 'Risk',
              risk_level: summary.inherent_risk_level || 'medium',
              risk_type: summary.risk_type || '',
              risk_score: summary.inherent_risk_score || 0,
              status: summary.status || 'active',
              location_description: risk.location_description || '',
            },
          });
        });
      } catch (detailErr) {
        console.warn('[RisksLayer] Detail fetches failed, showing count only:', detailErr);
      }

      const geojson = { type: 'FeatureCollection', features };
      setRisksData(geojson);
    } catch (err) {
      console.error('Failed to fetch risks:', err);
      setError(err.message || 'Failed to load risks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRisks();
  }, [fetchRisks]);

  // --- Render layer ---
  useEffect(() => {
    if (!map || !mapReady || !risksData) return;

    const addLayers = () => {
      removeLayers(map, [LAYER_ID], SOURCE_ID);
      addedRef.current = false;

      if (!visible) return;

      try {
        map.addSource(SOURCE_ID, {
          type: 'geojson',
          data: risksData,
        });

        map.addLayer({
          id: LAYER_ID,
          type: 'symbol',
          source: SOURCE_ID,
          layout: {
            'icon-image': [
              'match',
              ['get', 'risk_level'],
              'low', 'v2-risk-icon-low',
              'medium', 'v2-risk-icon-medium',
              'high', 'v2-risk-icon-high',
              'critical', 'v2-risk-icon-critical',
              'v2-risk-icon-medium',
            ],
            'icon-size': 0.9,
            'icon-allow-overlap': true,
            'text-field': ['get', 'title'],
            'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
            'text-size': 10,
            'text-offset': [0, 1.8],
            'text-anchor': 'top',
            'text-allow-overlap': false,
            'text-optional': true,
          },
          paint: {
            'text-color': '#2F2F2F',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.5,
          },
        });

        addedRef.current = true;
      } catch (err) {
        console.error('Error adding risks layer:', err);
      }
    };

    addLayers();

    return () => {
      if (addedRef.current && map) {
        removeLayers(map, [LAYER_ID], SOURCE_ID);
        addedRef.current = false;
      }
    };
  }, [map, mapReady, risksData, visible]);

  return { risksData, riskCount, loading, error, refresh: fetchRisks };
}
