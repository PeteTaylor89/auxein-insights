// Photo upload on sync (dev-plan §6, P9). Photos are captured straight to Dexie as
// local blobs and never block a note save. Here, on sync, each local photo is
// presigned, PUT directly to S3, then confirmed — and finally stamped synced via
// repo (so its metadata, sans blob, reaches other devices through the outbox).
import { db, repo } from '@/db';
import type { Photo } from '@/db';
import { isAuthed } from '@/auth/publicAuth';
import { tasteConfirm, tastePhotoView, tastePresign } from './tasteApi';

// Best-effort: a per-photo failure leaves it 'local' to retry on the next sync.
export async function syncPhotos(): Promise<void> {
  if (!isAuthed()) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  const locals = await db.photos.filter((p) => p.status === 'local' && !!p.blob && !p.deleted).toArray();
  for (const p of locals) {
    try {
      const contentType = p.blob?.type || 'image/jpeg';
      const { s3_key, upload_url } = await tastePresign({ note_id: p.note_id, photo_id: p.id, content_type: contentType });
      const put = await fetch(upload_url, { method: 'PUT', headers: { 'Content-Type': contentType }, body: p.blob });
      if (!put.ok) throw new Error(`S3 PUT ${put.status}`);
      await tasteConfirm(s3_key);
      // Keep the blob (instant offline display); mark synced + enqueue the metadata.
      await repo.photos.save({ ...p, s3_key, status: 'synced' });
    } catch {
      /* leave 'local'; retried next sync */
    }
  }
}

// Presigned-GET cache for cross-device display (no local blob). Server TTL is
// ~15 min; cache for 10 to stay comfortably valid.
const viewCache = new Map<string, { url: string; exp: number }>();

// Remote display URL for a photo with no local blob. Returns null offline / when
// unconfigured. Blob-backed photos are handled by the caller (instant object URL).
export async function resolvePhotoUrl(photo: Photo): Promise<string | null> {
  if (!photo.s3_key || !isAuthed()) return null;
  const now = Date.now();
  const hit = viewCache.get(photo.s3_key);
  if (hit && hit.exp > now) return hit.url;
  try {
    const { view_url } = await tastePhotoView(photo.s3_key);
    if (view_url) {
      viewCache.set(photo.s3_key, { url: view_url, exp: now + 10 * 60 * 1000 });
      return view_url;
    }
  } catch {
    /* offline / unauthorised */
  }
  return null;
}
