// REST client for the Taste API v1 (backend_taste, prefix /taste/v1). The server
// is the system of record; this is a thin fetch wrapper. In dev, Vite proxies
// /taste → http://localhost:8001 (vite.config.ts); in prod VITE_TASTE_API_URL
// points at taste-api.auxein.co.nz.
//
// F1: goes through `authFetch`, which attaches Taste's own bearer token and
// renews it when it is stale. A 401 that SURVIVES a refresh means the session is
// really over — authFetch has already cleared it by then, so the app drops to
// the sign-in gate on the next render.
import { authFetch } from '@/auth/tasteAuth';

const TASTE_BASE = (import.meta.env.VITE_TASTE_API_URL as string | undefined) ?? '';
const V1 = `${TASTE_BASE}/taste/v1`;

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await authFetch(`${V1}${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    throw new ApiError(401, 'Session expired — sign in again.');
  }
  if (!res.ok) {
    let detail = `Taste API error (${res.status})`;
    try {
      const j = await res.json();
      if (j?.detail) detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail);
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: (path: string) => request<void>('DELETE', path),
};

// Build a query string from a param map, skipping empty values.
export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}
