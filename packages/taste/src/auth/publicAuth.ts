// Auth seam. Taste has NO user table of its own (dev-plan §1/§5.5): identity is the
// existing Insights public JWT. The SPA logs in against the MAIN API's public-auth
// endpoint and stores the token in localStorage under the same key Insights uses;
// the taste-api then validates that token with the shared SECRET_KEY.
//
// Auth (login) → main API:  {VITE_API_URL || '/api/v1'}/public/auth/login
//   prod: VITE_API_URL = https://api.auxein.co.nz/api/v1
//   dev:  default '/api/v1', served by the Vite '/api' → :8000 proxy
// Data (sync)  → taste-api:  see services/tasteApi.ts

const AUTH_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api/v1';
const TOKEN_KEY = 'public_access_token';
const USER_KEY = 'public_user';

export interface PublicUser {
  id: number;
  email?: string;
  first_name?: string;
  last_name?: string;
  [k: string]: unknown;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): PublicUser | null {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) ?? 'null');
  } catch {
    return null;
  }
}

export function isAuthed(): boolean {
  return !!getToken();
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function login(email: string, password: string): Promise<PublicUser | null> {
  const res = await fetch(`${AUTH_BASE}/public/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail?.detail || detail?.message || `Sign-in failed (${res.status})`);
  }
  const data = await res.json();
  if (data?.access_token) {
    localStorage.setItem(TOKEN_KEY, data.access_token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user ?? null));
  }
  return data?.user ?? null;
}

export function logout(): void {
  clearToken();
}
