// maps-v2/components/flyover/FlyoverPanel.jsx — Admin-only keyframe-based 3D flyover
import { useState, useMemo, useCallback } from 'react';
import {
  Video,
  Play,
  Pause,
  Square,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Mountain,
  Orbit,
  Camera,
  Gauge,
  RotateCw,
  Sliders,
  Trash2,
  Check,
  ArrowLeft,
  X,
  Eye,
  RefreshCw,
  Timer,
  Loader,
} from 'lucide-react';

export default function FlyoverPanel({ flyover, blocksData, properties = [] }) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState('keyframes'); // keyframes | orbit | settings

  const {
    state = 'idle',
    isEditing = false,
    isPreviewing = false,
    isBuffering = false,
    isPlaying = false,
    isPaused = false,
    isActive = false,
    progress = 0,
    bufferProgress = 0,
    keyframes = [],
    speed = 1, setSpeed,
    exaggeration = 1, setExaggeration,
    duration = 20, setDuration,
    startEditing, startOrbit,
    addKeyframe, goToKeyframe,
    finishEditing, backToEditing,
    play, pause, stop, scrubTo,
    removeKeyframe, moveKeyframe, updateKeyframe, clearKeyframes,
  } = flyover || {};

  // Property options with computed centers
  const propertyOptions = useMemo(() => {
    if (!properties?.length || !blocksData?.features) return [];
    return properties.map((prop) => {
      const blocks = blocksData.features.filter(
        (f) => f.properties?.property_id === prop.id,
      );
      if (!blocks.length) return null;
      let totalLng = 0, totalLat = 0, count = 0;
      for (const f of blocks) {
        const lng = f.properties?.centroid_longitude;
        const lat = f.properties?.centroid_latitude;
        if (lng && lat) { totalLng += lng; totalLat += lat; count++; }
      }
      if (!count) return null;
      return {
        id: prop.id, name: prop.name,
        center: [totalLng / count, totalLat / count],
        blockCount: blocks.length,
      };
    }).filter(Boolean);
  }, [properties, blocksData]);

  const canFinish = (keyframes || []).length >= 2;

  const handlePlayPause = useCallback(() => {
    if (isPlaying) pause?.();
    else play?.();
  }, [isPlaying, play, pause]);

  return (
    <div className="v2-panel">
      <div
        className="v2-panel-header"
        onClick={() => setExpanded(!expanded)}
        style={{ cursor: 'pointer' }}
      >
        <h3 className="v2-panel-title">
          <Video size={14} style={{ marginRight: 4 }} />
          3D Flyover
          {isActive && (
            <span className="v2-panel-count" style={{
              background: isPlaying ? 'var(--color-accent)'
                : isBuffering ? '#f59e0b'
                : isEditing ? '#3b82f6'
                : 'var(--color-olive-light)',
              color: (isPlaying || isBuffering || isEditing) ? '#fff' : 'var(--color-primary)',
            }}>
              {isPlaying ? 'Playing'
                : isBuffering ? 'Loading...'
                : isEditing ? 'Editing'
                : isPreviewing ? 'Ready'
                : 'Paused'}
            </span>
          )}
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </h3>
      </div>

      {expanded && (
        <div className="v2-flyover-content">

          {/* ============ IDLE ============ */}
          {state === 'idle' && (
            <>
              <div className="v2-flyover-tabs">
                <button
                  className={`v2-flyover-tab ${activeTab === 'keyframes' ? 'active' : ''}`}
                  onClick={() => setActiveTab('keyframes')}
                >
                  <Camera size={12} /> Keyframes
                </button>
                <button
                  className={`v2-flyover-tab ${activeTab === 'orbit' ? 'active' : ''}`}
                  onClick={() => setActiveTab('orbit')}
                >
                  <Orbit size={12} /> Orbit
                </button>
                <button
                  className={`v2-flyover-tab ${activeTab === 'settings' ? 'active' : ''}`}
                  onClick={() => setActiveTab('settings')}
                >
                  <Sliders size={12} /> Settings
                </button>
              </div>

              {activeTab === 'keyframes' && (
                <div className="v2-flyover-start-section">
                  <p className="v2-flyover-hint">
                    Navigate the map to the exact view you want, then freeze it as
                    a keyframe. Add multiple keyframes and the camera will smoothly
                    interpolate between them — position, angle, zoom, and rotation.
                  </p>
                  <button
                    className="v2-flyover-action-btn v2-flyover-action-btn--primary"
                    onClick={startEditing}
                  >
                    <Camera size={14} /> Start Creating Keyframes
                  </button>
                </div>
              )}

              {activeTab === 'orbit' && (
                <div className="v2-flyover-list">
                  {propertyOptions.length === 0 ? (
                    <div className="v2-flyover-empty">No properties with blocks found</div>
                  ) : (
                    propertyOptions.map((prop) => (
                      <button
                        key={prop.id}
                        className="v2-flyover-item"
                        onClick={() => startOrbit?.(prop.center, 0.5)}
                      >
                        <div className="v2-flyover-item-info">
                          <span className="v2-flyover-item-name">{prop.name}</span>
                          <span className="v2-flyover-item-desc">
                            {prop.blockCount} block{prop.blockCount !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <Orbit size={14} className="v2-flyover-item-play" />
                      </button>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'settings' && <SettingsPane flyover={flyover} />}
            </>
          )}

          {/* ============ EDITING ============ */}
          {isEditing && (
            <>
              <div className="v2-flyover-edit-header">
                <span className="v2-flyover-edit-hint">
                  Navigate the map, then freeze frame
                </span>
                <button
                  className="v2-flyover-action-btn v2-flyover-action-btn--ghost"
                  onClick={clearKeyframes}
                  disabled={!(keyframes || []).length}
                  title="Clear all keyframes"
                >
                  <Trash2 size={12} /> Clear
                </button>
              </div>

              <button
                className="v2-flyover-action-btn v2-flyover-action-btn--accent"
                onClick={addKeyframe}
                style={{ width: '100%', marginBottom: 'var(--space-sm)' }}
              >
                <Camera size={14} /> Freeze Frame ({(keyframes || []).length} captured)
              </button>

              <KeyframeList
                keyframes={keyframes || []}
                onGoTo={goToKeyframe}
                onRemove={removeKeyframe}
                onMove={moveKeyframe}
                onUpdate={updateKeyframe}
              />

              <div className="v2-flyover-edit-actions">
                <button
                  className="v2-flyover-action-btn v2-flyover-action-btn--primary"
                  onClick={finishEditing}
                  disabled={!canFinish}
                >
                  <Check size={14} /> Preview Path
                </button>
                <button
                  className="v2-flyover-action-btn v2-flyover-action-btn--ghost"
                  onClick={stop}
                >
                  <X size={14} /> Cancel
                </button>
              </div>
            </>
          )}

          {/* ============ PREVIEWING ============ */}
          {isPreviewing && (
            <>
              <div className="v2-flyover-preview-info">
                {(keyframes || []).length} keyframes ready. Camera path shown on
                map. Tiles will be pre-loaded before playback.
              </div>

              <KeyframeList
                keyframes={keyframes || []}
                onGoTo={goToKeyframe}
                onRemove={removeKeyframe}
                onMove={moveKeyframe}
                onUpdate={updateKeyframe}
              />

              <SettingsPane flyover={flyover} compact />

              <div className="v2-flyover-edit-actions">
                <button
                  className="v2-flyover-action-btn v2-flyover-action-btn--primary"
                  onClick={play}
                >
                  <Play size={14} /> Buffer & Play
                </button>
                <button
                  className="v2-flyover-action-btn v2-flyover-action-btn--ghost"
                  onClick={backToEditing}
                >
                  <ArrowLeft size={14} /> Edit
                </button>
                <button
                  className="v2-flyover-action-btn v2-flyover-action-btn--ghost"
                  onClick={stop}
                >
                  <X size={14} /> Cancel
                </button>
              </div>
            </>
          )}

          {/* ============ BUFFERING ============ */}
          {isBuffering && (
            <div className="v2-flyover-buffer">
              <div className="v2-flyover-buffer-header">
                <Loader size={14} className="v2-spin" />
                <span>Pre-loading tiles...</span>
                <span className="v2-flyover-buffer-pct">
                  {Math.round((bufferProgress || 0) * 100)}%
                </span>
              </div>
              <div className="v2-flyover-buffer-bar-bg">
                <div
                  className="v2-flyover-buffer-bar-fill"
                  style={{ width: `${(bufferProgress || 0) * 100}%` }}
                />
              </div>
              <button
                className="v2-flyover-action-btn v2-flyover-action-btn--ghost"
                onClick={stop}
                style={{ marginTop: 'var(--space-sm)' }}
              >
                <X size={12} /> Cancel
              </button>
            </div>
          )}

          {/* ============ PLAYING / PAUSED ============ */}
          {(isPlaying || isPaused) && (
            <>
              <div className="v2-flyover-transport">
                <button
                  className="v2-flyover-transport-btn"
                  onClick={handlePlayPause}
                  title={isPlaying ? 'Pause (Space)' : 'Resume (Space)'}
                >
                  {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <button
                  className="v2-flyover-transport-btn v2-flyover-transport-btn--stop"
                  onClick={stop}
                  title="Stop (Esc)"
                >
                  <Square size={14} />
                </button>
                <div className="v2-flyover-progress-wrap">
                  <input
                    type="range" min="0" max="1" step="0.001"
                    value={progress || 0}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (isPlaying) pause?.();
                      scrubTo?.(val);
                    }}
                    className="v2-flyover-progress"
                  />
                </div>
                <span className="v2-flyover-progress-label">
                  {Math.round((progress || 0) * 100)}%
                </span>
              </div>

              <SettingsPane flyover={flyover} compact />

              <div className="v2-flyover-edit-actions">
                <button
                  className="v2-flyover-action-btn v2-flyover-action-btn--ghost"
                  onClick={stop}
                >
                  <Square size={12} /> Stop & Exit
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Keyframe list with navigate/reorder/update/delete */
function KeyframeList({ keyframes, onGoTo, onRemove, onMove, onUpdate }) {
  if (!keyframes.length) {
    return (
      <div className="v2-flyover-empty">
        No keyframes yet — navigate the map and click Freeze Frame
      </div>
    );
  }

  return (
    <div className="v2-flyover-wp-list">
      {keyframes.map((kf, i) => (
        <div key={i} className="v2-flyover-wp-item">
          <span className="v2-flyover-wp-num">{i + 1}</span>
          <div className="v2-flyover-kf-info">
            <span className="v2-flyover-kf-detail">
              z{kf.zoom?.toFixed(1)} · {Math.round(kf.pitch)}° · {Math.round(kf.bearing)}°
            </span>
          </div>
          <div className="v2-flyover-wp-actions">
            <button onClick={() => onGoTo?.(i)} title="Go to this view">
              <Eye size={12} />
            </button>
            <button onClick={() => onUpdate?.(i)} title="Update with current view">
              <RefreshCw size={12} />
            </button>
            <button onClick={() => onMove?.(i, Math.max(0, i - 1))} disabled={i === 0} title="Move up">
              <ChevronUp size={12} />
            </button>
            <button
              onClick={() => onMove?.(i, Math.min(keyframes.length - 1, i + 1))}
              disabled={i === keyframes.length - 1}
              title="Move down"
            >
              <ChevronDown size={12} />
            </button>
            <button onClick={() => onRemove?.(i)} title="Remove">
              <X size={12} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Settings sliders */
function SettingsPane({ flyover, compact = false }) {
  const {
    speed = 1, setSpeed,
    exaggeration = 1, setExaggeration,
    duration = 20, setDuration,
  } = flyover || {};

  return (
    <div className={`v2-flyover-settings ${compact ? 'v2-flyover-settings--compact' : ''}`}>
      <div className="v2-flyover-setting">
        <label className="v2-flyover-setting-label">
          <Timer size={12} /> Duration
          <span className="v2-flyover-setting-value">{duration}s</span>
        </label>
        <input type="range" min="5" max="120" step="5" value={duration}
          onChange={(e) => setDuration?.(parseInt(e.target.value))} className="v2-flyover-slider" />
      </div>
      <div className="v2-flyover-setting">
        <label className="v2-flyover-setting-label">
          <Gauge size={12} /> Speed
          <span className="v2-flyover-setting-value">{speed?.toFixed(1)}x</span>
        </label>
        <input type="range" min="0.25" max="3" step="0.25" value={speed}
          onChange={(e) => setSpeed?.(parseFloat(e.target.value))} className="v2-flyover-slider" />
      </div>
      <div className="v2-flyover-setting">
        <label className="v2-flyover-setting-label">
          <Mountain size={12} /> Terrain Scale
          <span className="v2-flyover-setting-value">{exaggeration?.toFixed(1)}x</span>
        </label>
        <input type="range" min="0.5" max="3" step="0.25" value={exaggeration}
          onChange={(e) => setExaggeration?.(parseFloat(e.target.value))} className="v2-flyover-slider" />
      </div>
      {!compact && (
        <div className="v2-flyover-shortcuts">
          <span>Space — play/pause</span>
          <span>Esc — stop</span>
        </div>
      )}
    </div>
  );
}
