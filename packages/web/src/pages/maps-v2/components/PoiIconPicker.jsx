// maps-v2/components/PoiIconPicker.jsx — choose a glyph and a colour for a POI type.
//
// The previews are rendered from ICON_DEFS, the same instruction set the canvas
// marker is drawn from, mapped onto SVG elements instead of canvas calls. That
// matters: a picker with its own hand-drawn preview icons is a picker that
// eventually shows something the map does not draw, and nobody finds out until
// a marker looks wrong on a printed sheet.
//
// Colour is a bounded palette, not an input — see POI_COLOURS for why.
import { ICON_DEFS, POI_ICON_LIBRARY, POI_COLOURS } from '../utils/mapIcons';
import './PoiIconPicker.css';

/**
 * One glyph, drawn from its ICON_DEFS entry.
 *
 * Stroked only, with no fill, because that is the contract the canvas
 * drawElement honours — a shape here that relied on a fill would render solid
 * in the picker and hollow on the map.
 */
export function PoiGlyph({ icon, colour = '#2F2F2F', size = 22, strokeWidth = 2 }) {
  const def = ICON_DEFS[icon];
  if (!def) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={colour}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {def.map((el, i) => {
        if (el.type === 'path') return <path key={i} d={el.attrs.d} />;
        if (el.type === 'circle') {
          return <circle key={i} cx={el.attrs.cx} cy={el.attrs.cy} r={el.attrs.r} />;
        }
        if (el.type === 'rect') {
          return (
            <rect
              key={i}
              x={el.attrs.x}
              y={el.attrs.y}
              width={el.attrs.width}
              height={el.attrs.height}
              rx={el.attrs.rx || 0}
            />
          );
        }
        return null;
      })}
    </svg>
  );
}

/**
 * The marker as it will actually appear: coloured badge, white ring, white
 * glyph. Same proportions as createMarkerImage — glyph at 55% of the badge.
 */
export function PoiMarkerPreview({ icon, colour, size = 34 }) {
  return (
    <span
      className="poi-marker-preview"
      style={{ width: size, height: size, background: colour }}
    >
      <PoiGlyph icon={icon} colour="#ffffff" size={size * 0.55} strokeWidth={2.4} />
    </span>
  );
}

/**
 * @param {string} props.icon      currently selected ICON_DEFS key
 * @param {string} props.colour    currently selected hex, from POI_COLOURS
 * @param {Function} props.onChange ({icon, colour}) => void
 * @param {boolean} props.disabled
 */
export default function PoiIconPicker({ icon, colour, onChange, disabled = false }) {
  const set = (patch) => !disabled && onChange({ icon, colour, ...patch });

  return (
    <div className="poi-icon-picker">
      <div className="poi-icon-picker__head">
        <PoiMarkerPreview icon={icon} colour={colour} />
        <p className="poi-icon-picker__hint">
          How this type will appear on the map and in the printed key.
        </p>
      </div>

      <div className="poi-icon-picker__swatches" role="radiogroup" aria-label="Marker colour">
        {POI_COLOURS.map((c) => (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={colour === c.value}
            aria-label={c.label}
            title={c.label}
            disabled={disabled}
            className={`poi-swatch${colour === c.value ? ' is-selected' : ''}`}
            style={{ background: c.value }}
            onClick={() => set({ colour: c.value })}
          />
        ))}
      </div>

      <div className="poi-icon-picker__groups">
        {POI_ICON_LIBRARY.map((group) => (
          <div key={group.group} className="poi-icon-group">
            <span className="poi-icon-group__label">{group.group}</span>
            <div className="poi-icon-group__grid" role="radiogroup" aria-label={group.group}>
              {group.icons.map((i) => (
                <button
                  key={i.key}
                  type="button"
                  role="radio"
                  aria-checked={icon === i.key}
                  aria-label={i.label}
                  title={i.label}
                  disabled={disabled}
                  className={`poi-icon-btn${icon === i.key ? ' is-selected' : ''}`}
                  onClick={() => set({ icon: i.key })}
                >
                  <PoiGlyph icon={i.key} colour={icon === i.key ? colour : '#4b5563'} />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
