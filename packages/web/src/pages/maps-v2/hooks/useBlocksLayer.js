// maps-v2/hooks/useBlocksLayer.js — Fetch + render vineyard blocks GeoJSON
import { useEffect, useState, useCallback, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { blocksService } from '@vineyard/shared';
import { removeLayers } from '../utils/geometry';
import { BLOCK_FILL_OWN, BLOCK_FILL_OTHER, BLOCK_OUTLINE } from '../utils/layerColors';

const SOURCE_ID = 'v2-vineyard-blocks';
const LAYER_IDS = ['v2-blocks-fill', 'v2-blocks-outline', 'v2-blocks-labels'];

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
            'fill-opacity': 0.12,
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
              2.5,
              1.5,
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
            'text-field': ['get', 'block_name'],
            'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
            'text-size': 12,
            'text-offset': [0, 0],
            'text-anchor': 'center',
          },
          paint: {
            'text-color': '#1f2937',
            'text-halo-color': '#ffffff',
            'text-halo-width': 2,
          },
        });

        addedRef.current = true;

        // Fit bounds to own company blocks on first load
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
