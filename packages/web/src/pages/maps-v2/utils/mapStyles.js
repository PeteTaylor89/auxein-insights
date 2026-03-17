// maps-v2/utils/mapStyles.js — Style URL constants and 3D config

export const MAP_STYLES = [
  { id: 'streets', url: 'mapbox://styles/mapbox/streets-v12', name: 'Streets' },
  { id: 'satellite', url: 'mapbox://styles/mapbox/satellite-streets-v12', name: 'Satellite' },
  { id: 'outdoors', url: 'mapbox://styles/mapbox/outdoors-v12', name: 'Outdoors' },
  { id: '3d-satellite', url: 'mapbox://styles/mapbox/satellite-v9', name: '3D Satellite', is3D: true },
];

export const DEFAULT_STYLE = MAP_STYLES[1]; // Satellite

export const DEFAULT_CENTER = [172.6148, -43.5272]; // Marlborough, NZ
export const DEFAULT_ZOOM = 8;

export const TERRAIN_SOURCE = {
  id: 'mapbox-dem',
  type: 'raster-dem',
  url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
  tileSize: 512,
  maxzoom: 14,
};

export const SKY_LAYER = {
  id: 'sky',
  type: 'sky',
  paint: {
    'sky-type': 'atmosphere',
    'sky-atmosphere-sun': [0.0, 0.0],
    'sky-atmosphere-sun-intensity': 15,
  },
};

export const DEFAULT_TERRAIN_EXAGGERATION = 1.0;
