// maps-v2/hooks/usePropertiesLayer.js — Render existing property boundaries
// as a subtle dashed-outline layer beneath the blocks layer.
//
// Properties are container geometries — admins need to see them when planning,
// but blocks remain the dominant visual element. Hence: thin dashed line,
// barely-there fill, labels only at high zoom.
import { useEffect, useState, useMemo, useRef } from 'react';
import { removeLayers } from '../utils/geometry';

const SOURCE_ID = 'v2-properties';
const LAYER_IDS = ['v2-properties-fill', 'v2-properties-outline', 'v2-properties-labels'];

/**
 * @param {mapboxgl.Map|null} map
 * @param {boolean} mapReady
 * @param {Array} properties - list from propertyService.listProperties(); each may have `geometry` (GeoJSON) or null
 * @param {boolean} visible - whether to render the layer
 */
export default function usePropertiesLayer(map, mapReady, properties, visible) {
  const addedRef = useRef(false);

  // Build a FeatureCollection from properties that actually have geometry.
  const geojson = useMemo(() => {
    const list = Array.isArray(properties) ? properties : [];
    return {
      type: 'FeatureCollection',
      features: list
        .filter((p) => p && p.geometry)
        .map((p) => ({
          type: 'Feature',
          id: p.id,
          geometry: p.geometry,
          properties: {
            id: p.id,
            name: p.name,
            region: p.region,
          },
        })),
    };
  }, [properties]);

  useEffect(() => {
    if (!map || !mapReady) return;

    const addLayers = () => {
      removeLayers(map, LAYER_IDS, SOURCE_ID);
      addedRef.current = false;

      if (!visible || !geojson.features.length) return;

      try {
        map.addSource(SOURCE_ID, { type: 'geojson', data: geojson });

        // Render BELOW blocks so block outlines remain the dominant boundary.
        const beforeLayer = map.getLayer('v2-blocks-fill') ? 'v2-blocks-fill' : undefined;

        map.addLayer({
          id: 'v2-properties-fill',
          type: 'fill',
          source: SOURCE_ID,
          paint: {
            'fill-color': '#ffffff',
            'fill-opacity': 0.05,
          },
        }, beforeLayer);

        map.addLayer({
          id: 'v2-properties-outline',
          type: 'line',
          source: SOURCE_ID,
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
          paint: {
            'line-color': '#ffffff',
            'line-width': 3,
            'line-dasharray': [3, 3],
            'line-opacity': 1,
          },
        }, beforeLayer);

        map.addLayer({
          id: 'v2-properties-labels',
          type: 'symbol',
          source: SOURCE_ID,
          minzoom: 11,
          layout: {
            'text-field': ['get', 'name'],
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
            'text-size': 13,
            'text-anchor': 'center',
            'text-allow-overlap': false,
          },
          paint: {
            'text-color': '#5B6830',
            'text-halo-color': '#ffffff',
            'text-halo-width': 2,
          },
        }, beforeLayer);

        addedRef.current = true;
      } catch (err) {
        console.error('Error adding properties layer:', err);
      }
    };

    addLayers();

    return () => {
      if (addedRef.current && map) {
        removeLayers(map, LAYER_IDS, SOURCE_ID);
        addedRef.current = false;
      }
    };
  }, [map, mapReady, geojson, visible]);

  // Keep source data fresh when properties change (e.g. after saving a new boundary)
  useEffect(() => {
    if (!map || !mapReady || !addedRef.current) return;
    const src = map.getSource(SOURCE_ID);
    if (src) src.setData(geojson);
  }, [map, mapReady, geojson]);

  return { propertyBoundariesCount: geojson.features.length };
}
