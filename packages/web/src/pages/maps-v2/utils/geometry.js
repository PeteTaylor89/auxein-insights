// maps-v2/utils/geometry.js — Shared geometry helpers

/**
 * Safely remove a layer and its source from the map.
 */
export function removeLayerAndSource(map, layerId, sourceId) {
  try {
    if (map.getLayer(layerId)) map.removeLayer(layerId);
  } catch (e) { /* noop */ }
  if (sourceId) {
    try {
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    } catch (e) { /* noop */ }
  }
}

/**
 * Remove multiple layers sharing one source.
 */
export function removeLayers(map, layerIds, sourceId) {
  layerIds.forEach((id) => {
    try {
      if (map.getLayer(id)) map.removeLayer(id);
    } catch (e) { /* noop */ }
  });
  if (sourceId) {
    try {
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    } catch (e) { /* noop */ }
  }
}

/**
 * Wrap an array of GeoJSON features into a FeatureCollection.
 */
export function toFeatureCollection(features = []) {
  return { type: 'FeatureCollection', features };
}
