// utils/geoBounds.js — compute a [west, south, east, north] bbox of a GeoJSON
// FeatureCollection. Used by MapScreen to fit the camera to all visible blocks.
//
// Only walks Polygon / MultiPolygon / Point / LineString / MultiLineString —
// the geometry shapes we actually produce from the backend. Returns null when
// nothing renderable is found.

function walkCoords(coords, fn) {
  if (!Array.isArray(coords)) return;
  if (typeof coords[0] === 'number') {
    // single position [lon, lat]
    fn(coords[0], coords[1]);
    return;
  }
  for (const c of coords) walkCoords(c, fn);
}

export function geojsonBbox(geojson) {
  if (!geojson || !Array.isArray(geojson.features) || geojson.features.length === 0) {
    return null;
  }
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  let touched = false;

  for (const feat of geojson.features) {
    if (!feat?.geometry?.coordinates) continue;
    walkCoords(feat.geometry.coordinates, (lon, lat) => {
      if (typeof lon !== 'number' || typeof lat !== 'number') return;
      if (lon < west) west = lon;
      if (lon > east) east = lon;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
      touched = true;
    });
  }
  if (!touched) return null;
  return [west, south, east, north];
}

// Convert [w, s, e, n] to the corner pair Mapbox.Camera expects.
export function bboxToCameraBounds(bbox) {
  if (!bbox) return null;
  const [w, s, e, n] = bbox;
  return { ne: [e, n], sw: [w, s] };
}
