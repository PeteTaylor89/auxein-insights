// services/photoStore.js — on-disk homes for the two kinds of photo.
//
//   pending/  (document dir)  photos captured but not yet uploaded. MUST survive
//                             app restarts and OS cache eviction — this is the
//                             only copy of the picture until the server has it.
//   remote/   (cache dir)     downloaded copies of photos the server already
//                             holds. Safe to evict; re-downloadable.
//
// The picker writes into the OS cache directory, which Android and iOS are both
// free to purge at any time. Uploading straight from that URI is why photos went
// missing: lose signal, background the app, and the source file could be gone
// before the retry ever ran. Everything is copied into the document directory at
// capture time now, and only deleted once the server has confirmed it.
//
// expo-file-system ships with expo@54 and is already linked into the current
// dev client, so this needs no native rebuild.
import { Directory, File, Paths } from 'expo-file-system';

const PENDING_DIR = 'pending-photos';
const REMOTE_DIR = 'remote-photos';

function ensureDir(parent, name) {
  const dir = new Directory(parent, name);
  try {
    if (!dir.exists) dir.create({ intermediates: true });
  } catch (e) {
    console.warn('[PhotoStore] Could not create', name, e?.message);
  }
  return dir;
}

function pendingDir() { return ensureDir(Paths.document, PENDING_DIR); }
function remoteDir() { return ensureDir(Paths.cache, REMOTE_DIR); }

function safeName(prefix, sourceUri) {
  const ext = (sourceUri.split('?')[0].split('.').pop() || 'jpg').slice(0, 5);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${rand}.${ext}`;
}

// ---- Pending (not yet uploaded) -------------------------------------------

// Copy a freshly-picked photo somewhere durable. Returns the new URI, or the
// original if the copy fails — a best-effort upload from the cache beats
// dropping the photo on the floor.
export function persistPendingPhoto(sourceUri) {
  if (!sourceUri) return null;
  try {
    const src = new File(sourceUri);
    if (!src.exists) return sourceUri;
    const dest = new File(pendingDir(), safeName('photo', sourceUri));
    src.copy(dest);
    return dest.uri;
  } catch (e) {
    console.warn('[PhotoStore] Persist failed, using source URI:', e?.message);
    return sourceUri;
  }
}

export function deletePendingPhoto(uri) {
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch (e) {
    console.warn('[PhotoStore] Delete failed:', e?.message);
  }
}

export function pendingPhotoExists(uri) {
  try { return !!uri && new File(uri).exists; } catch { return false; }
}

// NOTE: there is deliberately no sweep of the pending directory. "Delete
// anything the queue no longer references" would also delete photos that have
// been captured but not yet submitted — they live on disk before they are
// queued. Pending files are removed at exactly two points instead: when the
// upload succeeds, and when the user removes the photo from the picker. A few
// orphans after a crash cost some disk; a wrong sweep costs the photo.

// ---- Remote (already on the server) ---------------------------------------

function remoteFileFor(fileId) {
  return new File(remoteDir(), `file-${fileId}`);
}

export function cachedRemotePath(fileId) {
  try {
    const f = remoteFileFor(fileId);
    return f.exists ? f.uri : null;
  } catch { return null; }
}

// Fetch a server-held photo once and keep it. The download endpoint needs a
// bearer token, so this can't be handed straight to <Image> as a URL — the
// bytes are pulled with auth headers and the local URI is what gets rendered.
// That is also what makes previously-uploaded photos visible offline.
export async function cacheRemotePhoto(fileId, url, authHeader) {
  const existing = cachedRemotePath(fileId);
  if (existing) return existing;
  try {
    const dest = remoteFileFor(fileId);
    const headers = authHeader ? { Authorization: authHeader } : undefined;
    const out = await File.downloadFileAsync(url, dest, headers ? { headers } : undefined);
    return out?.uri || dest.uri;
  } catch (e) {
    console.warn('[PhotoStore] Remote fetch failed for', fileId, e?.message);
    return null;
  }
}

// Keep the on-disk copy of server photos under a soft ceiling, oldest first.
export function trimRemoteCache(maxBytes = 60 * 1024 * 1024) {
  try {
    const files = remoteDir().list().filter(e => e instanceof File);
    let total = 0;
    const sized = files.map(f => {
      const size = f.size || 0;
      total += size;
      return { f, size, mtime: f.modificationTime || 0 };
    });
    if (total <= maxBytes) return;
    sized.sort((a, b) => a.mtime - b.mtime);
    for (const item of sized) {
      if (total <= maxBytes) break;
      try { item.f.delete(); total -= item.size; } catch {}
    }
  } catch (e) {
    console.warn('[PhotoStore] Trim failed:', e?.message);
  }
}
