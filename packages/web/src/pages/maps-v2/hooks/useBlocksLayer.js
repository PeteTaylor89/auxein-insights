// maps-v2/hooks/useBlocksLayer.js — Fetch + render vineyard blocks GeoJSON
import { useEffect, useState, useCallback, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { blocksService } from '@vineyard/shared';
import { removeLayers } from '../utils/geometry';
import {
  BLOCK_FILL_OWN, BLOCK_FILL_OTHER, BLOCK_OUTLINE,
  BLOCK_FILL_OPACITY, BLOCK_OUTLINE_WIDTH_OWN, BLOCK_OUTLINE_WIDTH_OTHER,
} from '../utils/layerColors';

const SOURCE_ID = 'v2-vineyard-blocks';
const LAYER_IDS = ['v2-blocks-fill', 'v2-blocks-outline', 'v2-blocks-labels'];

// --- Label expressions -----------------------------------------------------
// The block label carries a second, smaller line of detail ("2.40 ha · Pinot
// Noir") so the map answers the common questions without a click.
//
// `area` and `variety` are both nullable on the feature, so everything is
// coerced defensively: to-number with a 0 fallback treats null/absent/garbage
// alike, and to-string renders null as an empty string. That keeps a block with
// no variety from rendering a stray separator.
const AREA_HA = ['to-number', ['get', 'area'], 0];

const AREA_LABEL = [
  'case',
  ['>', AREA_HA, 0],
  ['concat', ['number-format', AREA_HA, { 'min-fraction-digits': 2, 'max-fraction-digits': 2 }], ' ha'],
  '',
];

const VARIETY_LABEL = ['to-string', ['get', 'variety']];

// Only insert the separator when there's something on both sides of it.
const DETAIL_LINE = [
  'concat',
  AREA_LABEL,
  ['case', ['all', ['!=', AREA_LABEL, ''], ['!=', VARIETY_LABEL, '']], ' · ', ''],
  VARIETY_LABEL,
];

const BLOCK_LABEL = [
  'format',
  ['to-string', ['get', 'block_name']], {},
  ['case', ['!=', DETAIL_LINE, ''], ['concat', '\n', DETAIL_LINE], ''], { 'font-scale': 0.8 },
];

/**
 * Hook that manages the blocks layer on the map.
 *
 * @param {mapboxgl.Map|null} map — the map instance
 * @param {boolean} mapReady — true when map style is loaded
 * @param {number|null} companyId — current user's company ID
 * @param {boolean} isAdmin — whether user is global admin
 * @returns {{ blocksData, blockCount, loading, error, refresh, flyToBlock }}
 */
export default function useBlocksLayer(map, mapReady, companyId, isAdmin) {
  const [blocksData, setBlocksData] = useState(null);
  const [blockCount, setBlockCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const addedRef = useRef(false);
  // Track whether we've already fit bounds once for this map instance.
  // Style swaps re-run this effect (mapReady toggles false→true), but we
  // don't want to reset the camera every time — only on the genuine first load.
  const hasFitOnceRef = useRef(false);

  // --- Fetch ---
  const fetchBlocks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const geojson = await blocksService.getBlocksGeoJSON();
      setBlocksData(geojson);
      setBlockCount(geojson?.features?.length || 0);
    } catch (err) {
      console.error('Failed to fetch blocks:', err);
      setError(err.message || 'Failed to load blocks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBlocks();
  }, [fetchBlocks]);

  // --- Render layers ---
  useEffect(() => {
    if (!map || !mapReady || !blocksData) return;

    const addLayers = () => {
      // Clean up any previous
      removeLayers(map, LAYER_IDS, SOURCE_ID);
      addedRef.current = false;

      try {
        map.addSource(SOURCE_ID, {
          type: 'geojson',
          data: blocksData,
        });

        map.addLayer({
          id: 'v2-blocks-fill',
          type: 'fill',
          source: SOURCE_ID,
          paint: {
            'fill-color': [
              'case',
              ['==', ['get', 'company_id'], companyId || 0],
              BLOCK_FILL_OWN,
              BLOCK_FILL_OTHER,
            ],
            'fill-opacity': BLOCK_FILL_OPACITY,
          },
        });

        map.addLayer({
          id: 'v2-blocks-outline',
          type: 'line',
          source: SOURCE_ID,
          paint: {
            'line-color': BLOCK_OUTLINE,
            'line-width': [
              'case',
              ['==', ['get', 'company_id'], companyId || 0],
              BLOCK_OUTLINE_WIDTH_OWN,
              BLOCK_OUTLINE_WIDTH_OTHER,
            ],
            'line-opacity': 1,
          },
        });

        map.addLayer({
          id: 'v2-blocks-labels',
          type: 'symbol',
          source: SOURCE_ID,
          minzoom: 12,
          filter: isAdmin
            ? ['has', 'block_name']
            : ['==', ['get', 'company_id'], companyId || 0],
          layout: {
            'text-field': BLOCK_LABEL,
            'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
            'text-size': 12,
            'text-offset': [0, 0],
            'text-anchor': 'center',
            'text-line-height': 1.15,
          },
          paint: {
            'text-color': '#1f2937',
            'text-halo-color': '#ffffff',
            'text-halo-width': 2,
          },
        });

        addedRef.current = true;

        // Fit bounds to own company blocks on first load only.
        // Subsequent runs (style swaps, block refresh) preserve the user's camera.
        if (!hasFitOnceRef.current) {
          const ownFeatures = blocksData.features?.filter(
            (f) => f.properties?.company_id === companyId,
          );
          if (ownFeatures?.length > 0) {
            const bounds = new mapboxgl.LngLatBounds();
            ownFeatures.forEach((f) => {
              if (f.geometry?.coordinates) {
                const coords = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates.flat();
                coords.forEach((c) => {
                  if (Array.isArray(c) && c.length >= 2) bounds.extend(c);
                });
              }
            });
            if (!bounds.isEmpty()) {
              map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 1000 });
              hasFitOnceRef.current = true;
            }
          }
        }
      } catch (err) {
        console.error('Error adding blocks layer:', err);
      }
    };

    addLayers();

    return () => {
      if (addedRef.current && map) {
        removeLayers(map, LAYER_IDS, SOURCE_ID);
        addedRef.current = false;
      }
    };
  }, [map, mapReady, blocksData, companyId, isAdmin]);

  // --- Actions ---
  const flyToBlock = useCallback(
    (block) => {
      if (!map || !block) return;
      const lng = block.properties?.centroid_longitude || block.centroid_longitude;
      const lat = block.properties?.centroid_latitude || block.centroid_latitude;
      if (lng && lat) {
        map.flyTo({ center: [lng, lat], zoom: 17, duration: 1000 });
      }
    },
    [map],
  );

  return { blocksData, blockCount, loading, error, refresh: fetchBlocks, flyToBlock };
}
