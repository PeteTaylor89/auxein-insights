// EPIC 9 / Story 9.1 — versioned local export. Dumps the Dexie system-of-record as
// a self-describing envelope. Note values carry BOTH raw and canonical already
// (R3), so a verbatim dump proves D1/D5 (no raw loss). Photos export as S3 keys +
// metadata; optionally with base64 blob data for a fully-local archive.
import { repo } from '@/db';
import type { Flight, Note, Photo, TasteEvent, Template, Wine } from '@/db';

export const TASTE_EXPORT_SCHEMA = 'auxein.taste.v1' as const;

// Photo minus the IndexedDB Blob; optional base64 for a fully-local archive.
export type ExportPhoto = Omit<Photo, 'blob'> & { data_base64?: string };

export interface TasteExport {
  schema: typeof TASTE_EXPORT_SCHEMA;
  exported_at: string; // ISO
  entities: {
    templates: Template[];
    events: TasteEvent[];
    wines: Wine[];
    notes: Note[]; // values are { raw, raw_scale?, canonical? } per field
    flights: Flight[];
    photos: ExportPhoto[];
  };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// Build the export envelope from live (non-deleted) Dexie data. Reference data
// (geoRegions) is seed-shipped on both ends, so it is intentionally excluded.
export async function buildExport(opts: { includePhotoData?: boolean } = {}): Promise<TasteExport> {
  const [templates, events, wines, notes, flights, photoRows] = await Promise.all([
    repo.templates.list(),
    repo.events.list(),
    repo.wines.list(),
    repo.notes.list(),
    repo.flights.list(),
    repo.photos.list(),
  ]);

  const photos: ExportPhoto[] = [];
  for (const p of photoRows) {
    const { blob, ...rest } = p;
    const ep: ExportPhoto = { ...rest };
    if (opts.includePhotoData && blob) ep.data_base64 = await blobToBase64(blob);
    photos.push(ep);
  }

  return {
    schema: TASTE_EXPORT_SCHEMA,
    exported_at: new Date().toISOString(),
    entities: { templates, events, wines, notes, flights, photos },
  };
}

// Trigger a client-side download of any JSON-serialisable value.
export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Convenience: build + download with a dated filename.
export async function exportToFile(opts: { includePhotoData?: boolean } = {}): Promise<{ notes: number; photos: number }> {
  const data = await buildExport(opts);
  const date = data.exported_at.slice(0, 10);
  downloadJson(`auxein-taste-export-${date}.json`, data);
  return { notes: data.entities.notes.length, photos: data.entities.photos.length };
}
