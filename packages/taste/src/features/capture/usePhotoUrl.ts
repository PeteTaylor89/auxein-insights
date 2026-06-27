import { useEffect, useState } from 'react';
import type { Photo } from '@/db';
import { resolvePhotoUrl } from '@/services/photoSync';

// A displayable URL for a photo: the local blob (instant, offline) when present,
// else a presigned remote URL (cross-device). Object URLs are revoked on cleanup.
export function usePhotoUrl(photo: Photo): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    if (photo.blob) {
      objectUrl = URL.createObjectURL(photo.blob);
      setUrl(objectUrl);
    } else {
      setUrl(null);
      void resolvePhotoUrl(photo).then((u) => {
        if (!cancelled) setUrl(u);
      });
    }

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photo.id, photo.blob, photo.s3_key]);

  return url;
}
