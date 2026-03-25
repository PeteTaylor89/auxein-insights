// components/ForecastPointPicker.jsx — Small map modal to pick a forecast lat/lng point
import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { X, MapPin } from 'lucide-react';

mapboxgl.accessToken = 'pk.eyJ1IjoicGV0ZXRheWxvciIsImEiOiJjbTRtaHNxcHAwZDZ4MmxwbjZkeXNneTZnIn0.RJ9B3Q3-t_-gFrEkgshH9Q';

function ForecastPointPicker({ isOpen, onClose, onLocationSet, initialLat, initialLng, propertyName }) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);
  const [lat, setLat] = useState(initialLat || -41.29);
  const [lng, setLng] = useState(initialLng || 174.78);

  useEffect(() => {
    if (!isOpen || map.current) return;

    const center = (initialLat && initialLng)
      ? [parseFloat(initialLng), parseFloat(initialLat)]
      : [172.6, -43.5]; // default NZ

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center,
      zoom: initialLat ? 12 : 5,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    // Place initial marker if lat/lng provided
    if (initialLat && initialLng) {
      marker.current = new mapboxgl.Marker({ color: '#D1583B' })
        .setLngLat([parseFloat(initialLng), parseFloat(initialLat)])
        .addTo(map.current);
    }

    // Click to set point
    map.current.on('click', (e) => {
      const newLat = parseFloat(e.lngLat.lat.toFixed(7));
      const newLng = parseFloat(e.lngLat.lng.toFixed(7));
      setLat(newLat);
      setLng(newLng);

      if (marker.current) {
        marker.current.setLngLat([newLng, newLat]);
      } else {
        marker.current = new mapboxgl.Marker({ color: '#D1583B' })
          .setLngLat([newLng, newLat])
          .addTo(map.current);
      }
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
        marker.current = null;
      }
    };
  }, [isOpen]);

  const handleConfirm = () => {
    onLocationSet(lat, lng);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fpp-overlay" onClick={onClose} />
      <div className="fpp-modal">
        <div className="fpp-header">
          <h3><MapPin size={16} /> Set Forecast Point{propertyName ? ` — ${propertyName}` : ''}</h3>
          <button className="fpp-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="fpp-map" ref={mapContainer} />
        <div className="fpp-footer">
          <div className="fpp-coords">
            <span>Lat: <strong>{lat}</strong></span>
            <span>Lng: <strong>{lng}</strong></span>
          </div>
          <div className="fpp-actions">
            <button className="fpp-btn fpp-btn--ghost" onClick={onClose}>Cancel</button>
            <button className="fpp-btn fpp-btn--primary" onClick={handleConfirm}>Set Location</button>
          </div>
        </div>
      </div>

      <style>{`
        .fpp-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 999;
        }
        .fpp-modal {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: var(--color-surface);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-lg);
          width: 90%;
          max-width: 600px;
          z-index: 1000;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .fpp-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-sm) var(--space-md);
          border-bottom: 1px solid var(--color-border);
        }
        .fpp-header h3 {
          margin: 0;
          font-size: var(--font-size-base);
          font-weight: 600;
          color: var(--color-primary);
          display: flex;
          align-items: center;
          gap: var(--space-xs);
        }
        .fpp-close {
          background: none;
          border: none;
          cursor: pointer;
          color: var(--color-text-muted);
        }
        .fpp-close:hover { color: var(--color-text); }
        .fpp-map {
          width: 100%;
          height: 350px;
        }
        .fpp-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-sm) var(--space-md);
          border-top: 1px solid var(--color-border);
          flex-wrap: wrap;
          gap: var(--space-sm);
        }
        .fpp-coords {
          display: flex;
          gap: var(--space-md);
          font-size: var(--font-size-sm);
          color: var(--color-text-muted);
        }
        .fpp-coords strong {
          color: var(--color-text);
          font-family: monospace;
        }
        .fpp-actions {
          display: flex;
          gap: var(--space-sm);
        }
        .fpp-btn {
          padding: var(--space-xs) var(--space-md);
          border-radius: var(--radius-sm);
          font-family: var(--font-family);
          font-size: var(--font-size-sm);
          font-weight: 500;
          cursor: pointer;
          border: none;
        }
        .fpp-btn--primary {
          background: var(--color-primary);
          color: white;
        }
        .fpp-btn--primary:hover { background: var(--color-primary-hover); }
        .fpp-btn--ghost {
          background: var(--color-surface-warm);
          color: var(--color-text);
          border: 1px solid var(--color-border);
        }
      `}</style>
    </>
  );
}

export default ForecastPointPicker;
