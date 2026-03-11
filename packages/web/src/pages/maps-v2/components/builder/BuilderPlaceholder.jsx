// maps-v2/components/builder/BuilderPlaceholder.jsx — Coming soon state for Map Builder
import { Layers, Mountain, Map, Droplets, Trees, Leaf, Globe } from 'lucide-react';

const UPCOMING_LAYERS = [
  { name: 'Wine Regions', icon: Globe, status: 'Phase D' },
  { name: 'Geographical Indications', icon: Map, status: 'Phase D' },
  { name: 'Topography & Contours', icon: Mountain, status: 'Phase D' },
  { name: 'Land Parcels', icon: Layers, status: 'Phase D' },
  { name: 'Management Areas', icon: Leaf, status: 'Phase D' },
  { name: 'S-Map Soils', icon: Droplets, status: 'Pending license' },
  { name: 'Geology & Faults', icon: Mountain, status: 'Pending license' },
  { name: 'NDVI Imagery', icon: Layers, status: 'Coming soon' },
  { name: 'Flow Paths', icon: Droplets, status: 'Coming soon' },
  { name: 'Biodiversity Zones', icon: Trees, status: 'Coming soon' },
  { name: 'Soil Carbon (Downforce)', icon: Leaf, status: 'Coming soon' },
];

export default function BuilderPlaceholder() {
  return (
    <div className="v2-panel">
      <div className="v2-panel-header">
        <h3 className="v2-panel-title">
          <Layers size={16} />
          Map Builder
        </h3>
      </div>
      <p className="v2-builder-intro">
        Compose custom geospatial views by layering data on your vineyard map.
        Your layer configuration will be saved between sessions.
      </p>
      <ul className="v2-builder-layer-list">
        {UPCOMING_LAYERS.map((layer) => {
          const Icon = layer.icon;
          return (
            <li key={layer.name} className="v2-builder-layer-item">
              <Icon size={16} className="v2-builder-layer-icon" />
              <span className="v2-builder-layer-name">{layer.name}</span>
              <span className="v2-builder-layer-status">{layer.status}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
