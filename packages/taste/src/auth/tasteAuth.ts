// Auth against Taste's OWN backend (F1, 2026-09-21).
//
// This replaces `publicAuth.ts`, which logged in against the MAIN API's
// public-auth endpoint and stored an Insights JWT that `taste-api` then
// validated with a shared secret. Taste now owns its identity outright: its own
// user table, its own signing key, its own token type. Nothing here talks to
// api.auxein.co.nz.
//
// Auth + data both go to taste-api:
//   dev:  '' + '/taste/v1/...'  → Vite proxies /taste to :8001
//   prod: VITE_TASTE_API_URL    → taste-api.auxein.co.nz
//
// THE SHAPE THAT MATTERS: the access token is short-lived (60 min) and paired
// with a long-lived refresh token, where the old 7-day Insights token was a
// single self-contained credential. So the client must refresh — and it must
// refresh EXACTLY ONCE AT A TIME. The server rotates refresh tokens and treats a
// second use of an already-rotated one as theft, revoking every session. Two
// concurrent refreshes would therefore log the user out. Hence the single-flight
// promise below; it is not an optimisation.

const BASE = (import.meta.env.VITE_TASTE_API_URL as string | undefined) ?? '';
const V1 = `${BASE}/taste/v1`;

const ACCESS_KEY = 'taste_access_token';
const REFRESH_KEY = 'taste_refresh_token';
const EXPIRY_KEY = 'taste_access_expires';
const USER_KEY = 'taste_user';

// The keys the Insights-backed version used. Cleared once on load: that token is
// no longer valid here, and leaving it behind means a returning user sits in a
// 401 loop instead of simply being asked to sign in.
const LEGACY_KEYS = ['public_access_token', 'public_user'];

// Refresh this many ms BEFORE the access token actually expires, so a request
// that takes a moment to reach the server does not arrive just after the line.
const REFRESH_SKEW_MS = 60_000;

export interface TasteUser {
  id: number;
  email: string;
  handle?: string | null;
  display_name?: string | null;
  bio?: string | null;
  avatar_s3_key?: string | null;
  role?: string;
  status?: string;
  is_verified?: boolean;
}

// Every storage access is wrapped: localStorage throws in a private window, with
// site data blocked, and inside some in-app browsers. Auth failing closed is
// correct; the app crashing on load is not.
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* session lives in memory for this tab only */
  }
}

function drop(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* nothing to do */
  }
}

export function purgeLegacyAuth(): void {
  LEGACY_KEYS.forEach(drop);
}

// ---------------------------------------------------------------- auth events
type AuthListener = () => void;
const listeners = new Set<AuthListener>();

function emitAuth(): void {
  listeners.forEach((l) => l());
}

export function subscribeAuth(cb: AuthListener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

// ---------------------------------------------------------------- token store
export function getAccessToken(): string | null {
  return read(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return read(REFRESH_KEY);
}

export function getUser(): TasteUser | null {
  try {
    return JSON.parse(read(USER_KEY) ?? 'null');
  } catch {
    return null;
  }
}

/** True if a session is worth trying. A stale ACCESS token is still "authed"
 *  while a refresh token exists — the first request will renew it. Returning
 *  false here would bounce a user to the sign-in screen every time they came
 *  back after an hour, which is the whole failure this pairing exists to avoid. */
export function isAuthed(): boolean {
  return !!(getRefreshToken() || getAccessToken());
}

interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

function storeTokens(pair: TokenPair): void {
  write(ACCESS_KEY, pair.access_token);
  write(REFRESH_KEY, pair.refresh_token);
  write(EXPIRY_KEY, String(Date.now() + pair.expires_in * 1000));
}

function clearSession(): void {
  [ACCESS_KEY, REFRESH_KEY, EXPIRY_KEY, USER_KEY].forEach(drop);
  emitAuth();
}

function accessTokenIsFresh(): boolean {
  const token = getAccessToken();
  if (!token) return false;
  const expiry = Number(read(EXPIRY_KEY) ?? 0);
  // No recorded expiry means a token from an older build; treat it as stale and
  // let the refresh path decide, rather than sending something that may 401.
  if (!expiry) return false;
  return Date.now() < expiry - REFRESH_SKEW_MS;
}

// ---------------------------------------------------------------- errors
async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    const detail = body?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
  } catch {
    /* non-JSON error body */
  }
  return fallback;
}

// ---------------------------------------------------------------- refresh
// SINGLE-FLIGHT. See the header comment: concurrent refreshes look like token
// theft to the server and end every session.
let refreshInFlight: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  const refresh = getRefreshToken();
  if (!refresh) return null;
  try {
    const res = await fetch(`${V1}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) {
      // Expired, revoked, or replayed. All three mean the same thing here:
      // this session is over.
      clearSession();
      return null;
    }
    const pair = (await res.json()) as TokenPair;
    storeTokens(pair);
    return pair.access_token;
  } catch {
    // Network failure is NOT an expired session. Leave the stored tokens alone
    // so the app recovers when the connection does — signing someone out
    // because a cellar has no reception is the wrong answer.
    return null;
  }
}

export function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/** The token to send, refreshing first if it is expired or about to be. */
async function currentAccessToken(): Promise<string | null> {
  if (accessTokenIsFresh()) return getAccessToken();
  if (getRefreshToken()) return refreshAccessToken();
  return getAccessToken();
}

// ---------------------------------------------------------------- authed fetch
/**
 * fetch() with the bearer token attached, refreshing once on a 401.
 *
 * The retry exists for the race the proactive refresh cannot cover: a token that
 * was fine when the request left and was revoked (password change, sign-out
 * everywhere, suspension) before it arrived.
 */
export async function authFetch(url: string, init: RequestInit = {}, allowRetry = true): Promise<Response> {
  const token = await currentAccessToken();
  const headers = new Headers(init.headers ?? {});
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(url, { ...init, headers });

  if (res.status === 401 && allowRetry && getRefreshToken()) {
    const fresh = await refreshAccessToken();
    if (fresh) return authFetch(url, init, false);
  }
  if (res.status === 401) {
    // Out of options. Drop to the sign-in gate.
    clearSession();
  }
  return res;
}

// ---------------------------------------------------------------- session ops
async function completeSignIn(res: Response, failureText: string): Promise<TasteUser | null> {
  if (!res.ok) throw new Error(await errorMessage(res, failureText));
  const pair = (await res.json()) as TokenPair;
  storeTokens(pair);
  purgeLegacyAuth();

  // Fetch the profile with the token just stored. A failure here is not a failed
  // sign-in — the session is valid — so the user is stored as null and the app
  // fills it in later rather than refusing entry.
  let user: TasteUser | null = null;
  try {
    const meRes = await authFetch(`${V1}/auth/me`);
    if (meRes.ok) {
      user = (await meRes.json()) as TasteUser;
      write(USER_KEY, JSON.stringify(user));
    }
  } catch {
    /* profile is best-effort */
  }
  emitAuth();
  return user;
}

export async function login(email: string, password: string): Promise<TasteUser | null> {
  const res = await fetch(`${V1}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return completeSignIn(res, 'Sign-in failed');
}

export async function register(
  email: string,
  password: string,
  displayName?: string,
  handle?: string,
): Promise<TasteUser | null> {
  const res = await fetch(`${V1}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      display_name: displayName || null,
      handle: handle || null,
    }),
  });
  return completeSignIn(res, 'Could not create the account');
}

/** Sign out of this device. Revokes the refresh token server-side so it cannot
 *  be replayed, then clears locally WHETHER OR NOT the call succeeded — a user
 *  who taps sign out must end up signed out even with no connection. */
export async function logout(): Promise<void> {
  const refresh = getRefreshToken();
  if (refresh) {
    try {
      await fetch(`${V1}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh }),
      });
    } catch {
      /* clearing locally is the part that must not fail */
    }
  }
  clearSession();
}

/** Sign out everywhere. Bumps the server's token_version, so live access tokens
 *  on other devices die too rather than lasting out their hour. */
export async function logoutAll(): Promise<void> {
  try {
    await authFetch(`${V1}/auth/logout-all`, { method: 'POST' });
  } catch {
    /* fall through to the local clear */
  }
  clearSession();
}

export async function refreshProfile(): Promise<TasteUser | null> {
  const res = await authFetch(`${V1}/auth/me`);
  if (!res.ok) return null;
  const user = (await res.json()) as TasteUser;
  write(USER_KEY, JSON.stringify(user));
  emitAuth();
  return user;
}

export async function updateProfile(patch: Partial<Pick<TasteUser, 'handle' | 'display_name' | 'bio'>>): Promise<TasteUser> {
  const res = await authFetch(`${V1}/auth/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not save your profile'));
  const user = (await res.json()) as TasteUser;
  write(USER_KEY, JSON.stringify(user));
  emitAuth();
  return user;
}

export async function changePassword(currentPassword: string | null, newPassword: string): Promise<void> {
  const res = await authFetch(`${V1}/auth/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not change your password'));
  // The server ends every session on a password change, including this one.
  clearSession();
}

// ---------------------------------------------------------------- email flows
/**
 * Ask for a password-reset email.
 *
 * Always resolves, never rejects on a "no such account" — the server answers
 * identically whether or not the address is registered, and surfacing a
 * difference here would rebuild the membership oracle the server avoids.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  try {
    await fetch(`${V1}/auth/password/reset-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
  } catch {
    /* a network failure is not information about the address either */
  }
}

/** Complete a reset with the token from the emailed link. */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const res = await fetch(`${V1}/auth/password/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, new_password: newPassword }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, 'That reset link is no longer valid'));
  // The server ends every session on a reset. Clear locally so a stale token on
  // this device cannot outlive the password it belonged to.
  clearSession();
}

/** Confirm an email address with the token from the emailed link. Anonymous:
 *  the link is followed in whatever browser opened the mail, which may not be
 *  the one holding the session. */
export async function verifyEmail(token: string): Promise<void> {
  const res = await fetch(`${V1}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, 'That confirmation link is no longer valid'));
}

/** Send the confirmation email again. Authed — the address comes from the session. */
export async function resendVerification(): Promise<void> {
  const res = await authFetch(`${V1}/auth/verify/resend`, { method: 'POST' });
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not send the email'));
}

/** Clear the local session without calling the server. Used by the API clients
 *  when a 401 survives a refresh. */
export function clearToken(): void {
  clearSession();
}
