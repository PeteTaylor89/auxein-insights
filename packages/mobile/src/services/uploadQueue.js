// services/uploadQueue.js — photo uploads as durable queue entries.
//
// Photos can't ride the generic `http` replay path: a FormData object with a
// file handle isn't JSON, so it can't be written to AsyncStorage and rebuilt.
// This registers a typed handler instead — the entry stores the local path and
// the FormData is reconstructed at flush time.
//
// The old behaviour was a best-effort loop in useImageCapture that swallowed
// every failure with a console.log, so a photo taken out of signal was gone and
// the user was told the job saved. Now the upload is queued the same way a
// write is: it survives a restart, retries on the coordinator's backoff, and
// the local file is only deleted once the server has the bytes.
import { registerHandler, enqueueWrite, refOrId } from './writeQueue';
import { deletePendingPhoto, pendingPhotoExists } from './photoStore';
import { fileService } from '../api/services';

export const PHOTO_UPLOAD = 'file.upload';

// Map unified feed source names to file API entity types.
const ENTITY_TYPE_MAP = {
  maintenance: 'asset_maintenance',
  calibration: 'asset_calibration',
  risk_action: 'risk_action',
  task: 'task',
};

export function mapEntityType(entityType) {
  return ENTITY_TYPE_MAP[entityType] || entityType;
}

// Accepts either a real id, or the 202 stub returned for a queued create — in
// which case the upload carries a reference and resolves once the parent syncs.
// Without this, a photo attached to something created offline would upload
// against `undefined`.
export const entityIdOrRef = refOrId;

// Register once at startup, before any flush can run.
export function initUploadQueue() {
  registerHandler(PHOTO_UPLOAD, async (payload) => {
    const { entityType, entityId, localUri, fileCategory } = payload;

    // The file is gone (user cleared storage, OS purged the doc dir). Nothing
    // to send and no way to recover it — return so the entry is consumed
    // rather than retried forever.
    if (!pendingPhotoExists(localUri)) {
      console.warn('[UploadQueue] Pending photo missing, dropping:', localUri);
      return null;
    }

    const result = await fileService.upload(entityType, entityId, localUri, fileCategory);
    // Only now is it safe to let go of the local copy.
    deletePendingPhoto(localUri);
    return result;
  });
}

// Queue a photo for upload. `idOrCreated` may be an id or a queued-create stub.
export async function queuePhotoUpload({ entityType, idOrCreated, localUri, fileCategory = 'photo' }) {
  const entityId = entityIdOrRef(idOrCreated);
  if (entityId == null || !localUri) return null;
  return enqueueWrite({
    type: PHOTO_UPLOAD,
    label: 'Upload photo',
    payload: {
      entityType: mapEntityType(entityType),
      entityId,
      localUri,
      fileCategory,
    },
  });
}
