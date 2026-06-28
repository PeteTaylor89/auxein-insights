// Photo upload + display. Server-backed: a captured image is uploaded straight to
// S3 (presign → PUT → confirm) and its Photo row persisted via the REST API. The
// in-memory File is kept on the returned object for instant preview this session
// (it is never sent to the server as a blob). Display uses a presigned GET.
import { newBase, repo } from '@/db';
import type { Photo } from '@/db';
import { isAuthed } from '@/auth/publicAuth';
import { tasteConfirm, tastePhotoView, tastePresign } from './tasteApi';

export async function uploadPhoto(file: File, noteId: string): Promise<Photo> {
  let width: number | null = null;
  let height: number | null = null;
  try {
    const bmp = await createImageBitmap(file);
    width = bmp.width;
    height = bmp.height;
    bmp.close();
  } catch {
    /* dimensions are best-effort */
  }

  const base = newBase();
  const contentType = file.type || 'image/jpeg';
  const { s3_key, upload_url } = await tastePresign({ note_id: noteId, photo_id: base.id, content_type: contentType });
  const put = await fetch(upload_url, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file });
  if (!put.ok) throw new Error(`Upload failed (S3 ${put.status})`);
  await tasteConfirm(s3_key);

  const saved = await repo.photos.save({
    ...base,
    note_id: noteId,
    s3_key,
    status: 'synced',
    width,
    height,
    taken_at: base.created_at,
  });
  // Attach the File for instant in-session preview (not persisted server-side).
  return { ...saved, blob: file };
}

// Presigned-GET cache for cross-device display. Server TTL is ~15 min; cache for
// 10 to stay comfortably valid.
const viewCache = new Map<string, { url: string; exp: number }>();

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
