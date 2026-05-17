// utils/naturalSort.js — Natural-order comparators for human-readable strings.
//
// Default string sort treats "Row 10" < "Row 2" because '1' < '2' lexicographically.
// Natural sort splits each string into numeric / non-numeric chunks and compares
// numerically where possible, so "Row 2" < "Row 10" and "A1" < "A2" < "A10".
//
// Use cases:
//   • Vineyard row labels: "1", "2", "10", "A1", "A2", "B-3"
//   • Block names: "Block 1", "Block 10"
//   • Anything where the user expects numeric ordering inside text
//
// Locale: en-NZ so accent + casing rules behave consistently.

const COLLATOR = new Intl.Collator('en-NZ', { numeric: true, sensitivity: 'base' });

/**
 * Compare two strings using natural (locale-aware, numeric-aware) ordering.
 * Null / undefined / non-string values are coerced to '' so they sort first.
 *
 * @param {string} a
 * @param {string} b
 * @returns {-1 | 0 | 1}
 */
export function compareNatural(a, b) {
  const sa = a == null ? '' : String(a);
  const sb = b == null ? '' : String(b);
  return COLLATOR.compare(sa, sb);
}

/**
 * Build a comparator that natural-sorts on a single field (or a key fn).
 * Handy with Array.prototype.sort.
 *
 *   rows.sort(byNatural('row_number'))
 *   tasks.sort(byNatural(t => t.block?.block_name))
 */
export function byNatural(fieldOrFn) {
  const get = typeof fieldOrFn === 'function'
    ? fieldOrFn
    : (item) => item?.[fieldOrFn];
  return (a, b) => compareNatural(get(a), get(b));
}
