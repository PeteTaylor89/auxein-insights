/**
 * Grow pricing, by region.
 *
 * The headline figure is deliberately identical in both currencies, so the
 * country swap (which only happens after hydration - see useRegion) never
 * changes the large number on screen. Only the currency line moves.
 *
 * NZ price confirmed 2026-09-15. AU price confirmed 2026-09-16.
 */
export type Region = 'NZ' | 'AU';

export const DEFAULT_REGION: Region = 'NZ';

export interface GrowPrice {
  amount: string;
  unit: string;
  note: string;
  /** ISO 4217, for structured data */
  currency: string;
}

export const GROW_PRICE: Record<Region, GrowPrice> = {
  NZ: {
    amount: '$85',
    unit: ' / ha / year',
    note: 'NZD, excluding GST. Minimums and multi-site rates on request.',
    currency: 'NZD',
  },
  AU: {
    amount: '$85',
    unit: ' / ha / year',
    note: 'AUD, excluding GST. Minimums and multi-site rates on request.',
    currency: 'AUD',
  },
};
