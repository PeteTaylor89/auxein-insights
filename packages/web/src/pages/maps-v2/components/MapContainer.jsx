// maps-v2/components/MapContainer.jsx — Pure Mapbox GL container
import './MapContainer.css';

export default function MapContainer({ containerRef }) {
  return <div ref={containerRef} className="v2-map-container" />;
}
