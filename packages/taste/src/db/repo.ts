// Data access. The server (taste-api) is the system of record; every call here is
// a REST request. Screens fetch on mount and re-fetch after a mutation, so there
// is no client store to drift — open the app on any device, sign in, and the same
// data loads. `repo`/`geo`/`meta` keep the signatures the screens already use, so
// this is a drop-in replacement for the old Dexie layer.
import { ApiError, api, qs } from './api';
import type { BaseRow, Flight, GeoRegion, Note, Photo, TasteEvent, Template, Wine } from './types';

type Params = Record<string, string | number | boolean | undefined | null>;

// Ids we've seen this session (from any get/list/save). save() uses this to pick
// POST (new) vs PATCH (existing) without a probe round-trip; a 409 falls back to
// PATCH, so it is correct even if the set is cold.
const known = new Set<string>();

export interface Repo<T extends BaseRow> {
  get(id: string): Promise<T | undefined>;
  list(): Promise<T[]>;
  listBy(params: Params): Promise<T[]>;
  save(row: T): Promise<T>; // upsert
  remove(id: string): Promise<void>; // soft delete
}

function makeRepo<T extends BaseRow>(path: string): Repo<T> {
  const base = `/${path}`;
  const remember = (rows: T[]): T[] => {
    rows.forEach((r) => known.add(r.id));
    return rows;
  };
  return {
    async get(id) {
      try {
        const r = await api.get<T>(`${base}/${id}`);
        known.add(r.id);
        return r;
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return undefined;
        throw e;
      }
    },
    async list() {
      return remember(await api.get<T[]>(base));
    },
    async listBy(params) {
      return remember(await api.get<T[]>(`${base}${qs(params)}`));
    },
    async save(row) {
      if (known.has(row.id)) {
        const r = await api.patch<T>(`${base}/${row.id}`, row);
        known.add(r.id);
        return r;
      }
      try {
        const r = await api.post<T>(base, row);
        known.add(r.id);
        return r;
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          const r = await api.patch<T>(`${base}/${row.id}`, row);
          known.add(r.id);
          return r;
        }
        throw e;
      }
    },
    async remove(id) {
      await api.del(`${base}/${id}`);
    },
  };
}

export const repo = {
  templates: makeRepo<Template>('templates'),
  events: makeRepo<TasteEvent>('events'),
  wines: makeRepo<Wine>('wines'),
  notes: makeRepo<Note>('notes'),
  flights: makeRepo<Flight>('flights'),
  photos: makeRepo<Photo>('photos'),
};

// ---- reference data: regions ------------------------------------------------
// Global, server-seeded. Fetched once and cached in memory; the typeahead filters
// the cache locally, so it stays instant after the first load.
let regionCache: GeoRegion[] | null = null;
let regionLoad: Promise<GeoRegion[]> | null = null;

async function allRegions(): Promise<GeoRegion[]> {
  if (regionCache) return regionCache;
  if (!regionLoad) {
    regionLoad = api
      .get<GeoRegion[]>('/regions')
      .then((rows) => {
        regionCache = rows;
        return rows;
      })
      .catch((e) => {
        regionLoad = null; // allow retry on next call
        throw e;
      });
  }
  return regionLoad;
}

export const geo = {
  async get(id: string): Promise<GeoRegion | undefined> {
    return (await allRegions()).find((r) => r.id === id);
  },
  async byCountry(countryCode: string): Promise<GeoRegion[]> {
    return (await allRegions()).filter((r) => r.country_code === countryCode);
  },
  async children(parentId: string): Promise<GeoRegion[]> {
    return (await allRegions()).filter((r) => r.parent_id === parentId);
  },
  async search(query: string, limit = 20): Promise<GeoRegion[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const all = await allRegions();
    const hits: GeoRegion[] = [];
    for (const r of all) {
      if (hits.length >= limit) break;
      const inName = r.name.toLowerCase().includes(q) || (r.path ?? '').toLowerCase().includes(q);
      const inAlias = r.aliases?.some((a) => a.toLowerCase().includes(q));
      if (inName || inAlias) hits.push(r);
    }
    return hits;
  },
};

// ---- device-local key/value (prefs: default template, UI state) -------------
// Not server data — just per-device preferences in localStorage.
const MK = (key: string) => `taste:meta:${key}`;

export const meta = {
  async get<V = unknown>(key: string, fallback?: V): Promise<V | undefined> {
    try {
      const raw = localStorage.getItem(MK(key));
      return raw == null ? fallback : (JSON.parse(raw) as V);
    } catch {
      return fallback;
    }
  },
  async set(key: string, value: unknown): Promise<void> {
    localStorage.setItem(MK(key), JSON.stringify(value));
  },
};
