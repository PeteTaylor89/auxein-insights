// maps-v2/hooks/useMapFeaturesLayer.js — Fetch + render map features (POIs)
//
// One GeoJSON source carrying all three geometry types. Mapbox filters by
// ['geometry-type'], so points get symbol markers while lines and polygons get
// their own layers off the same data — which is why the backend stores them in
// one generic GEOMETRY column rather than three tables.
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { mapFeaturesService } from '@vineyard/shared';
import { removeLayers } from '../utils/geometry';
import { registerPoiTypeMarkers } from '../utils/mapIcons';
import {
  decorateFeatures,
  MARKER_ID_PROP,
  MARKER_COLOUR_PROP,
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
 * @param {Object} vocabulary  useMapFeatureTypes(...) — {types, version}
 * @returns {{ mapFeaturesData, featureCount, loading, error, refresh }}
 */
export default function useMapFeaturesLayer(map, mapReady, visible, vocabulary) {
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

  // Resolve every feature to a concrete marker id + colour, and collect the
  // distinct (icon, colour) pairs that need registering.
  //
  // Keyed on `vocabulary.version`, not on the types array: the hook hands back
  // a fresh array on every load, so depending on the array itself would
  // re-decorate — and therefore re-add the layers — on each poll. The version
  // only moves when the vocabulary actually changed.
  const decorated = useMemo(
    () => decorateFeatures(mapFeaturesData, vocabulary?.types || []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mapFeaturesData, vocabulary?.version],
  );

  useEffect(() => {
    if (!map || !mapReady || !mapFeaturesData) return;

    const addLayers = () => {
      removeLayers(map, MAP_FEATURE_LAYER_IDS, SOURCE_ID);
      addedRef.current = false;

      if (!visible) return;

      try {
        // Register BEFORE addLayer. A symbol layer whose icon-image names an
        // unregistered id renders nothing at all — silently, with only a
        // console warning — so a company type would simply be an invisible POI.
        registerPoiTypeMarkers(map, decorated.specs);

        map.addSource(SOURCE_ID, { type: 'geojson', data: decorated.data });

        // Polygons — translucent fill, drawn first so markers sit above it.
        map.addLayer({
          id: FILL_LAYER_ID,
          type: 'fill',
          source: SOURCE_ID,
          filter: ['==', ['geometry-type'], 'Polygon'],
          paint: {
            'fill-color': ['get', MARKER_COLOUR_PROP],
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
            'line-color': ['get', MARKER_COLOUR_PROP],
            'line-width': 2,
            'line-opacity': 0.95,
          },
        });

        // Points — the marker id is resolved per feature and read straight
        // off the data. It was a `match` on feature_type, which could not see a
        // type added after the layer was built and could not express a
        // per-feature override at all.
        //
        // Sizing and the zoom ramp match the other point layers rather than
        // being special. POIs used to render at 0.75 against 0.9 for
        // observations and risks, which read as a different class of thing, and
        // they had no fade at all — the original reasoning was that a POI is
        // what you zoom OUT to find. In practice that made a property with
        // twenty gates and troughs unreadable at low zoom, so they now behave
        // like every other marker: same size, same 12-to-14 fade as assets.
        map.addLayer({
          id: POINT_LAYER_ID,
          type: 'symbol',
          source: SOURCE_ID,
          filter: ['==', ['geometry-type'], 'Point'],
          layout: {
            'icon-image': ['get', MARKER_ID_PROP],
            'icon-size': 0.9,
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
            // Same curve as the assets layer: gone below z12, full by z14.
            'icon-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 14, 1],
            'text-color': '#2F2F2F',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.5,
            'text-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 14, 1],
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
    // `decorated` covers both the data and the vocabulary behind it, so adding
    // a type re-adds the layers with the new images already registered.
  }, [map, mapReady, mapFeaturesData, decorated, visible]);

  return { mapFeaturesData, featureCount, loading, error, refresh: fetchFeatures };
}
