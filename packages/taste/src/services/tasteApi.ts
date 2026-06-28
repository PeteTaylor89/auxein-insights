// Photo endpoints on the Taste API (prefix /taste, separate from the v1 REST
// surface in db/api.ts). presign → client PUTs the blob to S3 → confirm; view
// returns a short-lived presigned GET. The public JWT is attached as a bearer
// token; a 401 clears it.
import { clearToken, getToken } from '@/auth/publicAuth';

const TASTE_BASE = (import.meta.env.VITE_TASTE_API_URL as string | undefined) ?? '';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${TASTE_BASE}/taste${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401) {
    clearToken();
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
