// Data access. The server (taste-api) is the system of record; every call here is
// a REST request. Screens fetch on mount and re-fetch after a mutation, so there
// is no client store to drift — open the app on any device, sign in, and the same
// data loads. `repo`/`geo`/`meta` keep the signatures the screens already use, so
// this is a drop-in replacement for the old Dexie layer.
import { ApiError, api, qs } from './api';
import { uuidv4 } from './ids';
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

// ---- user tasting vocabulary ------------------------------------------------
// Terms the user has added while tasting (varieties, regions, aroma/taste
// descriptors) so their pickers grow with use and sync across devices. Cached per
// dimension; resilient — a not-yet-deployed endpoint degrades to builtin options
// only (never blanks a picker).
export interface VocabTerm {
  id: string;
  dimension: string;
  group_label: string | null;
  term: string;
}

const vocabCache = new Map<string, VocabTerm[]>();
let vocabLoadedAll = false;

export const vocab = {
  // Prime the cache with every dimension in one request (used at capture load so
  // the template merge can read synchronously).
  async loadAll(): Promise<void> {
    try {
      const rows = await api.get<VocabTerm[]>('/vocab');
      vocabCache.clear();
      for (const r of rows) {
        const list = vocabCache.get(r.dimension) ?? [];
        list.push(r);
        vocabCache.set(r.dimension, list);
      }
      vocabLoadedAll = true;
    } catch {
      /* endpoint not up / offline — leave cache as-is, pickers show builtins */
    }
  },
  // Fetch one dimension (cache hit after loadAll, or a not-yet-loaded dimension).
  async list(dimension: string): Promise<VocabTerm[]> {
    if (vocabLoadedAll || vocabCache.has(dimension)) return vocabCache.get(dimension) ?? [];
    try {
      const rows = await api.get<VocabTerm[]>(`/vocab${qs({ dimension })}`);
      vocabCache.set(dimension, rows);
      return rows;
    } catch {
      return [];
    }
  },
  // Synchronous cache read of every term for a dimension (call after loadAll/list).
  rows(dimension: string): VocabTerm[] {
    return vocabCache.get(dimension) ?? [];
  },
  // Persist a term. Best-effort: the caller has already applied it locally, so a
  // failure (endpoint down) is non-fatal — we still cache it for this session.
  async add(dimension: string, term: string, groupLabel: string | null = null): Promise<void> {
    const clean = term.trim();
    if (!clean) return;
    const cached = vocabCache.get(dimension) ?? [];
    const dup = cached.some((v) => v.group_label === groupLabel && v.term.toLowerCase() === clean.toLowerCase());
    const local: VocabTerm = { id: uuidv4(), dimension, group_label: groupLabel, term: clean };
    if (!dup) {
      cached.push(local);
      vocabCache.set(dimension, cached);
    }
    try {
      await api.post<VocabTerm>('/vocab', { id: local.id, dimension, group_label: groupLabel, term: clean });
    } catch {
      /* kept locally for this session; retried next add */
    }
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
