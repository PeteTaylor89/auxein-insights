// utils/naturalSort.js — Natural-order comparators for human-readable strings.
//
// Mirrors packages/shared/src/utils/naturalSort.js — mobile doesn't depend on
// @vineyard/shared so we keep a local copy. Keep the two in sync if you tweak
// one.
//
// Default string sort treats "Row 10" < "Row 2" because '1' < '2'. Natural
// sort splits each string into numeric / non-numeric chunks and compares
// numerically where possible, so "Row 2" < "Row 10" and "A1" < "A2" < "A10".

const COLLATOR = new Intl.Collator('en-NZ', { numeric: true, sensitivity: 'base' });

export function compareNatural(a, b) {
  const sa = a == null ? '' : String(a);
  const sb = b == null ? '' : String(b);
  return COLLATOR.compare(sa, sb);
}

export function byNatural(fieldOrFn) {
  const get = typeof fieldOrFn === 'function'
    ? fieldOrFn
    : (item) => item?.[fieldOrFn];
  return (a, b) => compareNatural(get(a), get(b));
}
