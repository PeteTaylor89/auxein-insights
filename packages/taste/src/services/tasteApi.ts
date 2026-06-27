// Thin fetch client for the isolated Taste API (backend_taste, prefix /taste).
// In dev, Vite proxies /taste → http://localhost:8001 (see vite.config.ts). In
// prod, VITE_TASTE_API_URL points at taste-api.auxein.co.nz. The public JWT is
// attached as a bearer token; a 401 clears it so the UI drops to signed-out.
import { clearToken, getToken } from '@/auth/publicAuth';

const TASTE_BASE = (import.meta.env.VITE_TASTE_API_URL as string | undefined) ?? '';

// One mutation pushed from the client outbox (matches backend SyncIn.Mutation).
export interface PushMutation {
  entity: string;
  op: 'upsert' | 'delete';
  id: string;
  payload: unknown;
  updated_at: string;
  version: number;
}

export interface SyncRequest {
  outbox: PushMutation[];
  last_pulled_at: string | null;
}

export interface SyncResponse {
  applied: string[];
  pull: Record<string, Array<Record<string, unknown>>>;
  server_time: string;
}

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
  if (!res.ok) {
    throw new Error(`Taste API error (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const tasteHealth = () => call<{ status?: string }>('/health', { method: 'GET' });
export const tasteBootstrap = () => call<{ entities: Record<string, unknown[]>; server_time: string }>('/bootstrap', { method: 'GET' });
export const tasteSync = (body: SyncRequest) => call<SyncResponse>('/sync', { method: 'POST', body: JSON.stringify(body) });

// --- Photos (P9): presign → client PUTs the blob to S3 → confirm. ----------
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
