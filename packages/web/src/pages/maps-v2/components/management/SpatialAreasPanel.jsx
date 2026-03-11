// maps-v2/components/management/SpatialAreasPanel.jsx — Spatial areas toggle + list
import { Loader2, Eye, EyeOff, Layers } from 'lucide-react';

export default function SpatialAreasPanel({ areaCount, loading, error, visible, onToggle }) {
  return (
    <div className="v2-panel">
      <div className="v2-panel-header">
        <h3 className="v2-panel-title">
          <Layers size={16} />
          Spatial Areas
          <span className="v2-panel-count">{areaCount}</span>
          <button
            className="v2-layer-toggle-btn"
            onClick={onToggle}
            title={visible ? 'Hide areas' : 'Show areas'}
          >
            {visible ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
        </h3>
      </div>

      {loading && (
        <div className="v2-panel-loading">
          <Loader2 size={16} className="v2-spin" />
          Loading spatial areas...
        </div>
      )}

      {error && <div className="v2-panel-error">{error}</div>}
    </div>
  );
}
