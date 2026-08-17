// maps-v2/hooks/useMapFeaturesLayer.js — Fetch + render map features (POIs)
//
// One GeoJSON source carrying all three geometry types. Mapbox filters by
// ['geometry-type'], so points get symbol markers while lines and polygons get
// their own layers off the same data — which is why the backend stores them in
// one generic GEOMETRY column rather than three tables.
import { useEffect, useState, useCallback, useRef } from 'react';
import { mapFeaturesService } from '@vineyard/shared';
import { removeLayers } from '../utils/geometry';
import {
  featureIconExpression,
  featureColorExpression,
} from '../components/mapFeatureTypes';

const SOURCE_ID = 'v2-map-features';
const POINT_LAYER_ID = 'v2-map-features-points';
const LINE_CASING_LAYER_ID = 'v2-map-features-lines-casing';
const LINE_LAYER_ID = 'v2-map-features-lines';
const FILL_LAYER_ID = 'v2-map-features-fill';

// Exported so MapsPage can add them to INTERACTIVE_LAYERS for the touch-click
// bridge without re-declaring the strings.
export const MAP_FEATURE_LAYER_IDS = [
  FILL_LAYER_ID, LINE_CASING_LAYER_ID, LINE_LAYER_ID, POINT_LAYER_ID,
];
export const MAP_FEATURE_CLICK_LAYERS = [POINT_LAYER_ID, LINE_LAYER_ID, FILL_LAYER_ID];

/**
 * @param {mapboxgl.Map|null} map
 * @param {boolean} mapReady
 * @param {boolean} visible
 * @returns {{ mapFeaturesData, featureCount, loading, error, refresh }}
 */
export default function useMapFeaturesLayer(map, mapReady, visible) {
  const [mapFeaturesData, setMapFeaturesData] = useState(null);
  const [featureCount, setFeatureCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const addedRef = useRef(false);

  const fetchFeatures = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const geojson = await mapFeaturesService.getMapFeaturesGeoJSON();
      setMapFeaturesData(geojson);
      setFeatureCount(geojson?.features?.length || 0);
    } catch (err) {
      console.error('Failed to fetch map features:', err);
      setError(err.message || 'Failed to load map features');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeatures();
  }, [fetchFeatures]);

  useEffect(() => {
    if (!map || !mapReady || !mapFeaturesData) return;

    const addLayers = () => {
      removeLayers(map, MAP_FEATURE_LAYER_IDS, SOURCE_ID);
      addedRef.current = false;

      if (!visible) return;

      try {
        map.addSource(SOURCE_ID, { type: 'geojson', data: mapFeaturesData });

        // Polygons — translucent fill, drawn first so markers sit above it.
        map.addLayer({
          id: FILL_LAYER_ID,
          type: 'fill',
          source: SOURCE_ID,
          filter: ['==', ['geometry-type'], 'Polygon'],
          paint: {
            'fill-color': featureColorExpression(),
            'fill-opacity': 0.18,
          },
        });

        // Lines — white casing under the colour line so it reads against
        // satellite imagery, same treatment as the assets layer.
        map.addLayer({
          id: LINE_CASING_LAYER_ID,
          type: 'line',
          source: SOURCE_ID,
          filter: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#ffffff', 'line-width': 4, 'line-opacity': 0.85 },
        });

        map.addLayer({
          id: LINE_LAYER_ID,
          type: 'line',
          source: SOURCE_ID,
          filter: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': featureColorExpression(),
            'line-width': 2,
            'line-opacity': 0.95,
          },
        });

        // Points — one marker image per feature_type.
        //
        // No zoom-based icon-opacity ramp here, unlike the assets layer: a POI
        // is often the thing you are zooming OUT to find (where is the gate?),
        // so fading it below z14 would hide it exactly when it is wanted. The
        // label is still zoom-gated to stop dense sites turning into soup.
        map.addLayer({
          id: POINT_LAYER_ID,
          type: 'symbol',
          source: SOURCE_ID,
          filter: ['==', ['geometry-type'], 'Point'],
          layout: {
            'icon-image': featureIconExpression(),
            'icon-size': 0.75,
            'icon-allow-overlap': true,
            'text-field': ['get', 'name'],
            'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
            'text-size': 10,
            'text-offset': [0, 1.5],
            'text-anchor': 'top',
            'text-allow-overlap': false,
            'text-optional': true,
          },
          paint: {
            'text-color': '#2F2F2F',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.5,
            'text-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14.5, 1],
          },
        });

        addedRef.current = true;
      } catch (err) {
        console.error('Error adding map features layer:', err);
      }
    };

    addLayers();

    return () => {
      if (addedRef.current && map) {
        removeLayers(map, MAP_FEATURE_LAYER_IDS, SOURCE_ID);
        addedRef.current = false;
      }
    };
  }, [map, mapReady, mapFeaturesData, visible]);

  return { mapFeaturesData, featureCount, loading, error, refresh: fetchFeatures };
}
