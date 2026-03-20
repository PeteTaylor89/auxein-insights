// components/gps/TrackStats.jsx — distance, area, speed, duration stats
import { MapPin, Timer, Gauge, Maximize } from 'lucide-react';
import './TrackMap.css';

function formatDuration(seconds) {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDistance(meters) {
  if (!meters) return '—';
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
}

function formatSpeed(mps) {
  if (!mps) return '—';
  return `${(mps * 3.6).toFixed(1)} km/h`;
}

function formatArea(sqMeters) {
  if (!sqMeters) return '—';
  if (sqMeters >= 10000) return `${(sqMeters / 10000).toFixed(2)} ha`;
  return `${Math.round(sqMeters)} m²`;
}

function TrackStats({ stats }) {
  if (!stats) return null;

  return (
    <div className="track-stats-grid">
      <div className="track-stat-card">
        <MapPin size={18} />
        <div>
          <div className="track-stat-value">{formatDistance(stats.total_distance)}</div>
          <div className="track-stat-label">Distance</div>
        </div>
      </div>
      <div className="track-stat-card">
        <Maximize size={18} />
        <div>
          <div className="track-stat-value">{formatArea(stats.covered_area)}</div>
          <div className="track-stat-label">Area Covered</div>
        </div>
      </div>
      <div className="track-stat-card">
        <Gauge size={18} />
        <div>
          <div className="track-stat-value">{formatSpeed(stats.avg_speed)}</div>
          <div className="track-stat-label">Avg Speed</div>
        </div>
      </div>
      <div className="track-stat-card">
        <Timer size={18} />
        <div>
          <div className="track-stat-value">{formatDuration(stats.total_duration)}</div>
          <div className="track-stat-label">Duration</div>
        </div>
      </div>
    </div>
  );
}

export default TrackStats;
