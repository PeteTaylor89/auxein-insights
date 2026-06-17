import type { Note, Wine } from '@/db';

// Human display name for a wine. "Producer Label 'Vintage", trimmed of blanks.
export function wineLabel(wine: Wine | undefined | null): string {
  if (!wine) return 'Unknown wine';
  const parts = [wine.producer, wine.label].filter(Boolean);
  const name = parts.join(' ') || 'Untitled wine';
  return wine.vintage ? `${name} ${wine.vintage}` : name;
}

// Blind-aware label for a note: hide the wine identity until revealed. `position`
// (0-based) gives an anonymous flight ordinal ("Wine 3") while still masked.
export function noteWineLabel(note: Note, wine: Wine | undefined | null, position?: number | null): string {
  if (note.blind && !note.revealed) {
    return position != null ? `Wine ${position + 1}` : 'Hidden wine';
  }
  return wineLabel(wine);
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
