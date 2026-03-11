// maps-v2/components/builder/layerRegistry.js — Central registry of all builder layers
import {
  Globe, Map as MapIcon, Mountain, Layers, Leaf, Droplets, Trees, Satellite, Waves, Atom,
} from 'lucide-react';

/**
 * Each layer definition:
 *   id        — unique key
 *   name      — display name
 *   icon      — lucide-react icon component
 *   category  — grouping for catalog
 *   status    — 'available' | 'placeholder' | 'admin'
 *   description — short explanation
 */
export const LAYER_REGISTRY = [
  {
    id: 'regions',
    name: 'Wine Regions',
    icon: Globe,
    category: 'Reference',
    status: 'available',
    description: 'New Zealand wine growing regions with boundaries and statistics.',
  },
  {
    id: 'gis',
    name: 'Geographical Indications',
    icon: MapIcon,
    category: 'Reference',
    status: 'available',
    description: 'Registered geographical indications (GIs) for wine appellation.',
  },
  {
    id: 'topography',
    name: 'Topography & Contours',
    icon: Mountain,
    category: 'Terrain',
    status: 'available',
    description: '3D terrain with elevation contour lines from Mapbox.',
  },
  {
    id: 'parcels',
    name: 'Land Parcels',
    icon: Layers,
    category: 'Property',
    status: 'admin',
    description: 'LINZ land parcel boundaries. Zoom to level 12+ to view.',
  },
  {
    id: 'management-areas',
    name: 'Management Areas',
    icon: Leaf,
    category: 'Property',
    status: 'available',
    description: 'Spatial areas: paddocks, orchards, wetlands, native bush, etc.',
  },
  {
    id: 'smap-soils',
    name: 'S-Map Soils',
    icon: Droplets,
    category: 'Data Layers',
    status: 'placeholder',
    description: 'Soil classification and properties from Manaaki Whenua S-Map. Pending data license.',
  },
  {
    id: 'geology',
    name: 'Geology & Faults',
    icon: Mountain,
    category: 'Data Layers',
    status: 'placeholder',
    description: 'Geological formations and fault lines from GNS Science / LINZ. Pending data license.',
  },
  {
    id: 'ndvi',
    name: 'NDVI Imagery',
    icon: Satellite,
    category: 'Data Layers',
    status: 'placeholder',
    description: 'Normalised vegetation index from satellite imagery. Coming soon.',
  },
  {
    id: 'flow-paths',
    name: 'Flow Paths',
    icon: Waves,
    category: 'Data Layers',
    status: 'placeholder',
    description: 'Hydrological flow paths derived from LiDAR DEM. Coming soon.',
  },
  {
    id: 'biodiversity',
    name: 'Biodiversity Zones',
    icon: Trees,
    category: 'Data Layers',
    status: 'placeholder',
    description: 'Biodiversity and conservation zones from DOC / LENZ. Coming soon.',
  },
  {
    id: 'soil-carbon',
    name: 'Soil Carbon (Downforce)',
    icon: Atom,
    category: 'Data Layers',
    status: 'placeholder',
    description: 'Per-block soil carbon estimates via Downforce integration. Coming soon.',
  },
];

export function getLayerDef(layerId) {
  return LAYER_REGISTRY.find((l) => l.id === layerId);
}

export function getAvailableLayers(isAdmin = false) {
  return LAYER_REGISTRY.filter((l) => {
    if (l.status === 'admin') return isAdmin;
    return true;
  });
}

export function getCategories() {
  const cats = new Map();
  LAYER_REGISTRY.forEach((l) => {
    if (!cats.has(l.category)) cats.set(l.category, []);
    cats.get(l.category).push(l);
  });
  return cats;
}
