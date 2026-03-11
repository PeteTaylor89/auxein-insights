// maps-v2/components/builder/LayerCard.jsx — Individual layer toggle + opacity + legend
import { Eye, EyeOff, ChevronUp, ChevronDown, Lock } from 'lucide-react';

/**
 * @param {Object} props
 * @param {Object} props.layer - layer definition from registry
 * @param {boolean} props.active - whether the layer is toggled on
 * @param {number} props.opacity - 0-1
 * @param {Function} props.onToggle
 * @param {Function} props.onOpacityChange
 * @param {Function} props.onMoveUp
 * @param {Function} props.onMoveDown
 * @param {boolean} props.canMoveUp
 * @param {boolean} props.canMoveDown
 * @param {boolean} props.loading
 * @param {string|null} props.error
 */
export default function LayerCard({
  layer,
  active,
  opacity,
  onToggle,
  onOpacityChange,
  onMoveUp,
  onMoveDown,
  canMoveUp = false,
  canMoveDown = false,
  loading = false,
  error = null,
}) {
  const Icon = layer.icon;
  const isPlaceholder = layer.status === 'placeholder';

  return (
    <div className={`v2-layer-card ${active ? 'v2-layer-card--active' : ''} ${isPlaceholder ? 'v2-layer-card--placeholder' : ''}`}>
      <div className="v2-layer-card-header">
        <div className="v2-layer-card-icon">
          <Icon size={16} />
        </div>
        <div className="v2-layer-card-info">
          <div className="v2-layer-card-name">{layer.name}</div>
          {isPlaceholder && (
            <span className="v2-layer-card-badge">
              <Lock size={10} />
              {layer.status === 'placeholder' ? 'Coming soon' : layer.status}
            </span>
          )}
        </div>
        {!isPlaceholder && (
          <button
            className="v2-layer-card-toggle"
            onClick={onToggle}
            title={active ? 'Hide layer' : 'Show layer'}
          >
            {active ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>
        )}
      </div>

      {active && !isPlaceholder && (
        <div className="v2-layer-card-controls">
          <div className="v2-layer-card-opacity">
            <label className="v2-layer-card-opacity-label">Opacity</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={opacity}
              onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
              className="v2-layer-card-slider"
            />
            <span className="v2-layer-card-opacity-value">{Math.round(opacity * 100)}%</span>
          </div>

          <div className="v2-layer-card-order">
            <button
              className="v2-layer-card-order-btn"
              onClick={onMoveUp}
              disabled={!canMoveUp}
              title="Move up (higher z-order)"
            >
              <ChevronUp size={14} />
            </button>
            <button
              className="v2-layer-card-order-btn"
              onClick={onMoveDown}
              disabled={!canMoveDown}
              title="Move down (lower z-order)"
            >
              <ChevronDown size={14} />
            </button>
          </div>

          {loading && (
            <div className="v2-layer-card-status">Loading...</div>
          )}
          {error && (
            <div className="v2-layer-card-error">{error}</div>
          )}
        </div>
      )}

      {!active && (
        <div className="v2-layer-card-desc">{layer.description}</div>
      )}
    </div>
  );
}
