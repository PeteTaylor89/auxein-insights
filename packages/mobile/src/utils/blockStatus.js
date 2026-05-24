// utils/blockStatus.js — Canonical vineyard_blocks.status display map for mobile.
//
// Mirrors packages/shared/src/utils/blockStatus.js — mobile doesn't depend on
// @vineyard/shared (metro.config.js blocks it). Keep the two in sync if you
// tweak one. See packages/mobile/src/utils/naturalSort.js for the same
// pattern.

export const BLOCK_STATUS_META = {
  developing:     { label: 'Developing',     tone: 'info',    order: 1 },
  pre_production: { label: 'Pre-production', tone: 'info',    order: 2 },
  producing:      { label: 'Producing',      tone: 'success', order: 3 },
  redeveloping:   { label: 'Re-developing',  tone: 'warning', order: 4 },
  replanting:     { label: 'Replanting',     tone: 'warning', order: 5 },
  mothballed:     { label: 'Mothballed',     tone: 'muted',   order: 6 },
  retired:        { label: 'Retired',        tone: 'danger',  order: 7 },
};

export const BLOCK_STATUS_VALUES = Object.keys(BLOCK_STATUS_META);

export const BLOCK_STATUS_OPTIONS = BLOCK_STATUS_VALUES
  .map(value => ({ value, ...BLOCK_STATUS_META[value] }))
  .sort((a, b) => a.order - b.order);

export function getBlockStatusMeta(status) {
  const k = String(status || '').toLowerCase().replace(/\s+/g, '_');
  return BLOCK_STATUS_META[k] || { label: 'Unknown', tone: 'muted', order: 99 };
}

export const BLOCK_STATUS_DEFAULT = 'producing';

export const BLOCK_STATUS_ACTIVE = ['developing', 'pre_production', 'producing', 'redeveloping', 'replanting'];
export const BLOCK_STATUS_PRODUCTIVE = ['producing'];
