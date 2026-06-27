// A glass in the flight rack. Each glass holds its own in-progress editor state
// so you can jump between them freely (tap glass 4, then 6, then 1) without loss.
// A glass is persisted to Dexie as a Note (+ Wine) the moment it has content.
import { uuidv4 } from '@/db';
import type { GlassColor, Photo, Wine } from '@/db';
import { emptyWine } from '../wines/WineFields';

export interface Glass {
  id: string; // stable — becomes the Note id on persist
  glassColor: GlassColor | null;
  wine: Wine; // editor identity (saved as a Wine only once it has producer/label)
  values: Record<string, unknown>; // raw editor values (reconciled at flush)
  generalNotes: string;
  revealed: boolean; // blind gate, per glass
  blindConclusions: Record<string, unknown> | null; // frozen pre-reveal guesses
  photos: Photo[]; // already written to Dexie, keyed by this glass id
}

export function emptyGlass(): Glass {
  return {
    id: uuidv4(),
    glassColor: null,
    wine: emptyWine(),
    values: {},
    generalNotes: '',
    revealed: false,
    blindConclusions: null,
    photos: [],
  };
}

// A glass counts as "real" (worth persisting / surfacing) once any of these hold.
export function glassHasContent(g: Glass): boolean {
  if (g.wine.producer.trim() || g.wine.label.trim()) return true;
  if (g.photos.length > 0) return true;
  if (g.generalNotes.trim()) return true;
  return Object.values(g.values).some(
    (v) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0),
  );
}

// Visual fills for the rack glass icon + colour dot.
export const GLASS_COLOR_HEX: Record<GlassColor, string> = {
  red: '#8a2c3b',
  white: '#d9c46a',
  rose: '#e79aa3',
  sparkling: '#f0e3a0',
};

export const GLASS_COLOR_LABEL: Record<GlassColor, string> = {
  red: 'Red',
  white: 'White',
  rose: 'Rosé',
  sparkling: 'Sparkling',
};

// Tap-to-cycle order: none → red → white → rosé → sparkling → none.
const COLOR_CYCLE: (GlassColor | null)[] = [null, 'red', 'white', 'rose', 'sparkling'];

export function nextColor(c: GlassColor | null): GlassColor | null {
  const i = COLOR_CYCLE.indexOf(c);
  return COLOR_CYCLE[(i + 1) % COLOR_CYCLE.length];
}
