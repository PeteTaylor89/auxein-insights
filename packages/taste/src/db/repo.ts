import type { Table } from 'dexie';
import { db } from './schema';
import { nowIso } from './ids';
import type { BaseRow, GeoRegion, Meta, OutboxOp, SyncEntity } from './types';

// Enqueue a pending mutation. Runs inside the caller's rw transaction so the
// entity write and its outbox entry commit atomically.
async function enqueue(entity: SyncEntity, op: OutboxOp, row: BaseRow): Promise<void> {
  await db.outbox.add({
    entity,
    op,
    id: row.id,
    payload: op === 'delete' ? null : row,
    updated_at: row.updated_at,
    version: row.version,
  });
}

// Upsert: stamp updated_at, bump version, preserve created_at, then enqueue.
async function put<T extends BaseRow>(table: Table<T, string>, entity: SyncEntity, row: T): Promise<T> {
  return db.transaction('rw', table, db.outbox, async () => {
    const existing = await table.get(row.id);
    const stamped: T = {
      ...row,
      created_at: existing?.created_at ?? row.created_at ?? nowIso(),
      updated_at: nowIso(),
      version: (existing?.version ?? 0) + 1,
      deleted: row.deleted ?? false,
    };
    await table.put(stamped);
    await enqueue(entity, 'upsert', stamped);
    return stamped;
  });
}

// Soft delete: flip `deleted`, bump version, enqueue a delete mutation.
async function softDelete<T extends BaseRow>(table: Table<T, string>, entity: SyncEntity, id: string): Promise<void> {
  await db.transaction('rw', table, db.outbox, async () => {
    const existing = await table.get(id);
    if (!existing || existing.deleted) return;
    const stamped: T = { ...existing, deleted: true, updated_at: nowIso(), version: existing.version + 1 };
    await table.put(stamped);
    await enqueue(entity, 'delete', stamped);
  });
}

export interface Repo<T extends BaseRow> {
  get(id: string): Promise<T | undefined>;
  list(): Promise<T[]>; // non-deleted only
  save(row: T): Promise<T>;
  remove(id: string): Promise<void>;
}

function makeRepo<T extends BaseRow>(table: Table<T, string>, entity: SyncEntity): Repo<T> {
  return {
    get: (id) => table.get(id),
    list: () => table.filter((r) => !r.deleted).toArray(),
    save: (row) => put(table, entity, row),
    remove: (id) => softDelete(table, entity, id),
  };
}

// User-scoped, sync-tracked entities.
export const repo = {
  templates: makeRepo(db.templates, 'template'),
  events: makeRepo(db.events, 'event'),
  wines: makeRepo(db.wines, 'wine'),
  notes: makeRepo(db.notes, 'note'),
  flights: makeRepo(db.flights, 'flight'),
  photos: makeRepo(db.photos, 'photo'),
};

// Reference data — no soft-delete, no outbox (seed-shipped, not user mutations).
export const geo = {
  get: (id: string) => db.geoRegions.get(id),
  byCountry: (countryCode: string) => db.geoRegions.where('country_code').equals(countryCode).toArray(),
  children: (parentId: string) => db.geoRegions.where('parent_id').equals(parentId).toArray(),
  async search(query: string, limit = 20): Promise<GeoRegion[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const hits: GeoRegion[] = [];
    await db.geoRegions.each((r) => {
      if (hits.length >= limit) return;
      const inName = r.name.toLowerCase().includes(q) || r.path.toLowerCase().includes(q);
      const inAlias = r.aliases?.some((a) => a.toLowerCase().includes(q));
      if (inName || inAlias) hits.push(r);
    });
    return hits;
  },
  bulkSeed: (rows: GeoRegion[]) => db.geoRegions.bulkPut(rows),
  count: () => db.geoRegions.count(),
};

// Key/value app state.
export const meta = {
  async get<V = unknown>(key: string, fallback?: V): Promise<V | undefined> {
    const row = await db.meta.get(key);
    return (row?.value as V) ?? fallback;
  },
  set: (key: string, value: unknown) => db.meta.put({ key, value } satisfies Meta),
};
