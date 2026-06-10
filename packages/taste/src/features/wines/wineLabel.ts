import type { Wine } from '@/db';

// Human display name for a wine. "Producer Label 'Vintage", trimmed of blanks.
export function wineLabel(wine: Wine | undefined | null): string {
  if (!wine) return 'Unknown wine';
  const parts = [wine.producer, wine.label].filter(Boolean);
  const name = parts.join(' ') || 'Untitled wine';
  return wine.vintage ? `${name} ${wine.vintage}` : name;
}

// Origin one-liner: most-specific geo segment present, else region/country.
export function wineOrigin(wine: Wine): string {
  return (
    wine.geo_subregion_appellation ||
    wine.geo_region ||
    wine.geo_country ||
    ''
  );
}
