// components/gps/TrackMap.jsx — Mapbox polyline with speed gradient for GPS track
import { useEffect, useRef, useMemo } from 'react';
import './TrackMap.css';

// Speed-based colour: slow=green → fast=red
function speedColor(speed, maxSpeed) {
  if (!maxSpeed || maxSpeed === 0) return '#5B6830';
  const ratio = Math.min(speed / maxSpeed, 1);
  // Green (olive) → Yellow → Red (terracotta)
  if (ratio < 0.5) {
    const t = ratio * 2;
    const r = Math.round(91 + (245 - 91) * t);
    const g = Math.round(104 + (158 - 104) * t);
    const b = Math.round(48 + (11 - 48) * t);
    return `rgb(${r},${g},${b})`;
  }
  const t = (ratio - 0.5) * 2;
  const r = Math.round(245 + (209 - 245) * t);
  const g = Math.round(158 + (88 - 158) * t);
  const b = Math.round(11 + (59 - 11) * t);
  return `rgb(${r},${g},${b})`;
}

function TrackMap({ points = [], mapboxToken }) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);

  const maxSpeed = useMemo(() => {
    if (!points.length) return 0;
    return Math.max(...points.map((p) => p.speed || 0));
  }, [points]);

  useEffect(() => {
    if (!mapboxToken || !points.length || !window.mapboxgl) return;

    const mapboxgl = window.mapboxgl;
    mapboxgl.accessToken = mapboxToken;

    const bounds = new mapboxgl.LngLatBounds();
    points.forEach((p) => bounds.extend([p.longitude, p.latitude]));

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/outdoors-v12',
      bounds,
      fitBoundsOptions: { padding: 40 },
    });

    mapRef.current = map;

    map.on('load', () => {
      // Build segmented line features for speed gradient
      const features = [];
      for (let i = 0; i < points.length - 1; i++) {
        features.push({
          type: 'Feature',
          properties: {
            color: speedColor(points[i].speed || 0, maxSpeed),
          },
          geometry: {
            type: 'LineString',
            coordinates: [
              [points[i].longitude, points[i].latitude],
              [points[i + 1].longitude, points[i + 1].latitude],
            ],
          },
        });
      }

      map.addSource('track', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features },
      });

      map.addLayer({
        id: 'track-line',
        type: 'line',
        source: 'track',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 4,
          'line-opacity': 0.85,
        },
      });

      // Start marker
      if (points.length > 0) {
        new mapboxgl.Marker({ color: '#5B6830' })
          .setLngLat([points[0].longitude, points[0].latitude])
          .setPopup(new mapboxgl.Popup().setText('Start'))
          .addTo(map);
      }

      // End marker
      if (points.length > 1) {
        const last = points[points.length - 1];
        new mapboxgl.Marker({ color: '#D1583B' })
          .setLngLat([last.longitude, last.latitude])
          .setPopup(new mapboxgl.Popup().setText('End'))
          .addTo(map);
      }
    });

    return () => map.remove();
  }, [points, mapboxToken, maxSpeed]);

  if (!points.length) {
    return <div className="track-map-empty">No GPS data recorded for this task</div>;
  }

  if (!mapboxToken) {
    return <div className="track-map-empty">Mapbox token not configured</div>;
  }

  return (
    <div className="track-map-wrapper">
      <div ref={mapContainer} className="track-map-container" />
      <div className="track-map-legend">
        <span className="track-legend-label">Slow</span>
        <div className="track-legend-gradient" />
        <span className="track-legend-label">Fast</span>
      </div>
    </div>
  );
}

export default TrackMap;
