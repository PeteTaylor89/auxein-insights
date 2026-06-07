import type { BaseRow } from './types';

// Client-generated UUIDv4 — records are valid offline before they ever reach a server.
// crypto.randomUUID is available in secure contexts (https + localhost).
export function uuidv4(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

// Fresh sync columns for a brand-new row. repo.save() re-stamps updated_at/version
// on write, so callers only need to supply the id + their domain fields.
export function newBase(): BaseRow {
  const ts = nowIso();
  return { id: uuidv4(), created_at: ts, updated_at: ts, version: 0, deleted: false };
}
