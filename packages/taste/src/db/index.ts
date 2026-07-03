// Data layer barrel. Import from '@/db' everywhere. Server-backed (taste-api v1);
// see repo.ts. No Dexie — the server is the system of record.
export { repo, geo, meta, vocab } from './repo';
export type { Repo, VocabTerm } from './repo';
export { api, ApiError, qs } from './api';
export { uuidv4, nowIso, newBase } from './ids';
export type * from './types';
