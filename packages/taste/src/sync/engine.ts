// Sync engine: drain the outbox to POST /taste/sync, then apply the pulled deltas.
// Single /sync round-trips both directions. A tiny pub/sub exposes live status to
// the Settings panel. The app stays fully usable offline — sync is opportunistic.
import { db, meta } from '@/db';
import { isAuthed } from '@/auth/publicAuth';
import { tasteSync } from '@/services/tasteApi';
import type { PushMutation } from '@/services/tasteApi';
import { syncPhotos } from '@/services/photoSync';
import { applyPull } from './pull';

export type SyncState = 'idle' | 'syncing' | 'offline' | 'unauthed' | 'error';

export interface SyncStatus {
  state: SyncState;
  lastSyncedAt: string | null;
  pending: number; // outbox depth
  error: string | null;
}

let status: SyncStatus = { state: 'idle', lastSyncedAt: null, pending: 0, error: null };
const listeners = new Set<(s: SyncStatus) => void>();

function emit(patch: Partial<SyncStatus>): void {
  status = { ...status, ...patch };
  for (const l of listeners) l(status);
}

export function getSyncStatus(): SyncStatus {
  return status;
}

export function subscribeSync(fn: (s: SyncStatus) => void): () => void {
  listeners.add(fn);
  fn(status);
  return () => {
    listeners.delete(fn);
  };
}

// Photo blobs never travel as JSON — their binary syncs via presign (P9). The note
// keeps the photo id refs, which DO sync.
function sanitize(entity: string, payload: unknown): unknown {
  if (entity === 'photo' && payload && typeof payload === 'object' && 'blob' in payload) {
    const { blob: _blob, ...rest } = payload as Record<string, unknown>;
    return rest;
  }
  return payload;
}

export async function syncNow(): Promise<void> {
  if (!isAuthed()) {
    emit({ state: 'unauthed' });
    return;
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    emit({ state: 'offline', pending: await db.outbox.count() });
    return;
  }
  if (status.state === 'syncing') return; // single-flight

  emit({ state: 'syncing', error: null });
  try {
    // Upload local photo blobs first so their (sans-blob) metadata rides this push.
    await syncPhotos();

    const items = await db.outbox.orderBy('seq').toArray();
    const seqs = items.map((i) => i.seq).filter((s): s is number => typeof s === 'number');
    const outbox: PushMutation[] = items.map((i) => ({
      entity: i.entity,
      op: i.op,
      id: i.id,
      payload: sanitize(i.entity, i.payload),
      updated_at: i.updated_at,
      version: i.version,
    }));

    const last = (await meta.get<string>('last_pulled_at')) ?? null;
    const res = await tasteSync({ outbox, last_pulled_at: last });

    // Drain exactly the seqs we sent (new mutations may have queued meanwhile).
    if (seqs.length) await db.outbox.bulkDelete(seqs);
    await applyPull(res.pull);
    await meta.set('last_pulled_at', res.server_time);

    emit({ state: 'idle', lastSyncedAt: res.server_time, pending: await db.outbox.count(), error: null });
  } catch (e) {
    emit({ state: 'error', error: e instanceof Error ? e.message : String(e), pending: await db.outbox.count() });
  }
}
