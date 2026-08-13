// components/surfaces/SurfaceValue.jsx — render one value from a surface.
//
// The whole reason this is a component rather than `{point.value}` inline:
//
//   A null value is a GAP. It is never zero.
//
// That is not a style preference. B4.1 on this platform wrote null rainfall as
// 0 and it read as "no rain fell" instead of "we don't know" — a difference
// that matters most in exactly the conditions people check the site for. Every
// surface value goes through here so the null case cannot be forgotten at the
// call site.
import ConfidenceBadge from './ConfidenceBadge';
import './SurfaceValue.css';

const UNIT_SUFFIX = { C: '°C', mm: ' mm', '%': '%' };

/**
 * @param {object}  point       a §5.1 series point: {value, sd, confidence, synthetic, reason}
 * @param {string}  unit        'C' | 'mm' | '%'
 * @param {number}  digits
 * @param {boolean} showConfidence
 * @param {string}  size        'sm' | 'md' | 'lg' | 'hero'
 */
function SurfaceValue({ point, unit = 'C', digits = 1, showConfidence = true, size = 'md' }) {
  const suffix = UNIT_SUFFIX[unit] ?? ` ${unit}`;
  const value = point?.value;
  const missing = value == null || !Number.isFinite(value);

  if (missing) {
    return (
      <span className={`surface-value surface-value--${size} surface-value--missing`}>
        <span className="surface-value__dash" aria-hidden="true">—</span>
        <span className="sr-only">No data</span>
        <span className="surface-value__reason">
          {point?.reason || 'No surface for this date'}
        </span>
      </span>
    );
  }

  return (
    <span className={`surface-value surface-value--${size}`}>
      <span className="surface-value__number">
        {value.toFixed(digits)}
        <span className="surface-value__unit">{suffix}</span>
      </span>
      {showConfidence && (
        <ConfidenceBadge
          confidence={point.confidence}
          unit={unit}
          synthetic={point.synthetic}
        />
      )}
    </span>
  );
}

export default SurfaceValue;
