// maps-v2/components/drawing/DrawingToolbar.jsx — Draw/split/edit mode buttons
import { Pentagon, Scissors, Pencil, X, Save, MapPin, Printer } from 'lucide-react';

/**
 * Floating toolbar shown over the map area for drawing operations.
 *
 * @param {Object} props
 * @param {'idle'|'draw_polygon'|'draw_spatial'|'split'|'edit'|'draw_property'|'edit_property_geometry'} props.activeMode
 * @param {string|null} props.activePropertyName - shown in label when working on a property
 * @param {Function} props.onDrawBlock - start drawing a new block polygon
 * @param {Function} props.onDrawSpatial - start drawing a new spatial area
 * @param {Function} props.onDrawFeature - start placing a point of interest
 * @param {Function} props.onSplit - start split mode
 * @param {Function} props.onPrint - open the print/export dialog
 * @param {Function} props.onCancel - cancel current operation
 * @param {Function} [props.onSaveProperty] - save the property polygon (visible only during property modes)
 * @param {boolean} [props.canSaveProperty] - enable the Save button (i.e. polygon has been drawn)
 * @param {boolean} props.disabled
 */
export default function DrawingToolbar({
  activeMode = 'idle',
  activePropertyName = null,
  onDrawBlock,
  onDrawSpatial,
  onDrawFeature,
  onSplit,
  onPrint,
  onCancel,
  onSaveProperty,
  canSaveProperty = false,
  disabled = false,
}) {
  const isActive = activeMode !== 'idle';
  const isProperty = activeMode === 'draw_property' || activeMode === 'edit_property_geometry';

  const modeLabel = (() => {
    if (activeMode === 'draw_polygon') return 'Drawing Block...';
    if (activeMode === 'draw_spatial') return 'Drawing Area...';
    if (activeMode === 'draw_poi') return 'Placing point of interest...';
    if (activeMode === 'split') return 'Split Mode';
    if (activeMode === 'edit') return 'Editing...';
    if (activeMode === 'draw_property') {
      return activePropertyName ? `Drawing boundary — ${activePropertyName}` : 'Drawing property boundary...';
    }
    if (activeMode === 'edit_property_geometry') {
      return activePropertyName ? `Editing boundary — ${activePropertyName}` : 'Editing property boundary...';
    }
    return '';
  })();

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
            onClick={onDrawFeature}
            disabled={disabled}
            title="Add a point of interest — gate, pump, water, amenity or note"
          >
            <MapPin size={16} />
            <span>Add POI</span>
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
          {/* Print is not a drawing tool, but this is the only persistent
              toolbar over the map and it is where people look for it. */}
          <button
            className="v2-draw-btn"
            onClick={onPrint}
            title="Print or export this map"
          >
            <Printer size={16} />
            <span>Print</span>
          </button>
        </>
      ) : (
        <>
          <div className="v2-draw-mode-label">{modeLabel}</div>
          {isProperty && onSaveProperty && (
            <button
              className="v2-draw-btn"
              onClick={onSaveProperty}
              disabled={!canSaveProperty}
              title={canSaveProperty ? 'Save boundary' : 'Draw or edit a polygon first'}
            >
              <Save size={16} />
              <span>Save</span>
            </button>
          )}
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
