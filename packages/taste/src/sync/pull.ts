// Apply server pull deltas into Dexie. Writes go DIRECT to the table (never via
// repo) so server-originated rows are NOT re-enqueued into the outbox — that would
// create a sync loop. Conflict policy v1: last-write-wins by updated_at.
import type { Table } from 'dexie';
import { db } from '@/db';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tableFor(entity: string): Table<any, string> | null {
  switch (entity) {
    case 'template': return db.templates;
    case 'event': return db.events;
    case 'wine': return db.wines;
    case 'note': return db.notes;
    case 'flight': return db.flights;
    case 'photo': return db.photos;
    default: return null;
  }
}

const ms = (iso: unknown): number => {
  const t = new Date(String(iso ?? '')).getTime();
  return Number.isNaN(t) ? 0 : t;
};

// Each pulled row is the full client payload overlaid by the server with the
// authoritative id / updated_at / version / deleted. Returns how many were applied.
export async function applyPull(pull: Record<string, Array<Record<string, unknown>>>): Promise<number> {
  let applied = 0;
  for (const [entity, rows] of Object.entries(pull)) {
    const table = tableFor(entity);
    if (!table || !Array.isArray(rows)) continue;
    for (const row of rows) {
      const id = row.id as string | undefined;
      if (!id) continue;
      const existing = await table.get(id);
      // Skip if our copy is the same age or newer (LWW); otherwise overwrite.
      if (existing && existing.updated_at && ms(existing.updated_at) >= ms(row.updated_at)) continue;
      await table.put(row);
      applied++;
    }
  }
  return applied;
}
