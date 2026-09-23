// Photo endpoints on the Taste API (prefix /taste, separate from the v1 REST
// surface in db/api.ts). presign → client PUTs the blob to S3 → confirm; view
// returns a short-lived presigned GET.
//
// F1: through `authFetch`, so a photo upload that straddles a token expiry
// renews and retries instead of failing mid-tasting.
import { authFetch } from '@/auth/tasteAuth';

const TASTE_BASE = (import.meta.env.VITE_TASTE_API_URL as string | undefined) ?? '';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authFetch(`${TASTE_BASE}/taste${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401) {
    throw new Error('Session expired — sign in again.');
  }
  if (!res.ok) throw new Error(`Taste API error (${res.status})`);
  return res.json() as Promise<T>;
}

export const tasteHealth = () => call<{ status?: string }>('/health', { method: 'GET' });

// --- Photos: presign → client PUTs the blob to S3 → confirm. -----------------
export interface PresignReq {
  note_id: string;
  photo_id?: string;
  content_type: string;
}
export interface PresignRes {
  s3_key: string;
  upload_url: string;
}

export const tastePresign = (body: PresignReq) =>
  call<PresignRes>('/photos/presign', { method: 'POST', body: JSON.stringify(body) });

export const tasteConfirm = (s3_key: string) =>
  call<{ view_url: string | null }>('/photos/confirm', { method: 'POST', body: JSON.stringify({ s3_key }) });

export const tastePhotoView = (key: string) =>
  call<{ view_url: string | null }>(`/photos/view?key=${encodeURIComponent(key)}`, { method: 'GET' });
