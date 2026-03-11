// maps-v2/components/drawing/DrawingToolbar.jsx — Draw/split/edit mode buttons
import { Pentagon, Scissors, Pencil, X } from 'lucide-react';

/**
 * Floating toolbar shown over the map area for drawing operations.
 *
 * @param {Object} props
 * @param {'idle'|'draw_polygon'|'draw_spatial'|'split'|'edit'} props.activeMode
 * @param {Function} props.onDrawBlock - start drawing a new block polygon
 * @param {Function} props.onDrawSpatial - start drawing a new spatial area
 * @param {Function} props.onSplit - start split mode
 * @param {Function} props.onCancel - cancel current operation
 * @param {boolean} props.disabled
 */
export default function DrawingToolbar({
  activeMode = 'idle',
  onDrawBlock,
  onDrawSpatial,
  onSplit,
  onCancel,
  disabled = false,
}) {
  const isActive = activeMode !== 'idle';

  return (
    <div className="v2-drawing-toolbar">
      {!isActive ? (
        <>
          <button
            className="v2-draw-btn"
            onClick={onDrawBlock}
            disabled={disabled}
            title="Draw new block"
          >
            <Pentagon size={16} />
            <span>New Block</span>
          </button>
          <button
            className="v2-draw-btn"
            onClick={onDrawSpatial}
            disabled={disabled}
            title="Draw new spatial area"
          >
            <Pentagon size={16} />
            <span>New Area</span>
          </button>
          <button
            className="v2-draw-btn"
            onClick={onSplit}
            disabled={disabled}
            title="Split a block"
          >
            <Scissors size={16} />
            <span>Split</span>
          </button>
        </>
      ) : (
        <>
          <div className="v2-draw-mode-label">
            {activeMode === 'draw_polygon' && 'Drawing Block...'}
            {activeMode === 'draw_spatial' && 'Drawing Area...'}
            {activeMode === 'split' && 'Split Mode'}
            {activeMode === 'edit' && 'Editing...'}
          </div>
          <button
            className="v2-draw-btn v2-draw-btn--cancel"
            onClick={onCancel}
            title="Cancel"
          >
            <X size={16} />
            <span>Cancel</span>
          </button>
        </>
      )}
    </div>
  );
}
