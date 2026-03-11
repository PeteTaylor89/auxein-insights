// maps-v2/components/builder/layers/index.js — Resolve layer ID to module
import * as RegionsLayer from './RegionsLayer';
import * as GIsLayer from './GIsLayer';
import * as TopographyLayer from './TopographyLayer';
import * as ManagementAreasLayer from './ManagementAreasLayer';
import * as ParcelsLayer from './ParcelsLayer';

const layerModules = {
  regions: RegionsLayer,
  gis: GIsLayer,
  topography: TopographyLayer,
  'management-areas': ManagementAreasLayer,
  parcels: ParcelsLayer,
};

/**
 * Get the layer module for a given layer ID.
 * Returns { addToMap, removeFromMap, setOpacity } or null for placeholders.
 */
export function getLayerModule(layerId) {
  return layerModules[layerId] || null;
}
