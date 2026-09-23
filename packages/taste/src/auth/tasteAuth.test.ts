import { beforeEach, describe, expect, it, vi } from 'vitest';

// These tests exist for one reason: the server ROTATES refresh tokens and treats
// a second use of an already-rotated one as theft, revoking every session. So a
// client that fires two refreshes concurrently signs the user out. That is a
// bug you cannot see in a browser until it bites at a tasting, and it is exactly
// the shape of thing a unit test catches for free.

// ---- minimal localStorage, since this runs in node -------------------------
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string) {
    return this.map.has(k) ? (this.map.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
}

const store = new MemoryStorage();
vi.stubGlobal('localStorage', store);

// Imported after the stub: the module reads localStorage at call time, but
// keeping the order explicit stops a future refactor breaking this quietly.
const auth = await import('./tasteAuth');

const V1 = '/taste/v1';

function seedSession(expiresInMs: number) {
  store.clear();
  store.setItem('taste_access_token', 'access-old');
  store.setItem('taste_refresh_token', 'refresh-old');
  store.setItem('taste_access_expires', String(Date.now() + expiresInMs));
}

/** A fetch stub that resolves refreshes only when released, so several callers
 *  can be made to overlap deterministically. */
function deferredRefreshFetch() {
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  let refreshCalls = 0;
  const calls: string[] = [];

  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    calls.push(url);
    if (url.endsWith('/auth/refresh')) {
      refreshCalls += 1;
      await gate;
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'access-new', refresh_token: 'refresh-new', expires_in: 3600 }),
      } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
  });

  return { fetchMock, release: () => release(), refreshCalls: () => refreshCalls, calls };
}

describe('tasteAuth session handling', () => {
  beforeEach(() => {
    store.clear();
    vi.restoreAllMocks();
  });

  it('refreshes ONCE when several requests race an expired token', async () => {
    seedSession(-1000); // already expired
    const { fetchMock, release, refreshCalls } = deferredRefreshFetch();
    vi.stubGlobal('fetch', fetchMock);

    const inFlight = [
      auth.authFetch(`${V1}/wines`),
      auth.authFetch(`${V1}/notes`),
      auth.authFetch(`${V1}/flights`),
    ];
    release();
    await Promise.all(inFlight);

    // THE ASSERTION THIS FILE EXISTS FOR. Three concurrent calls, one refresh.
    expect(refreshCalls()).toBe(1);
    expect(store.getItem('taste_refresh_token')).toBe('refresh-new');
  });

  it('sends the renewed token on the requests that waited', async () => {
    seedSession(-1000);
    const { fetchMock, release } = deferredRefreshFetch();
    vi.stubGlobal('fetch', fetchMock);

    const p = auth.authFetch(`${V1}/wines`);
    release();
    await p;

    const dataCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/wines'));
    const headers = (dataCall?.[1] as RequestInit | undefined)?.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer access-new');
  });

  it('does NOT refresh when the token is still comfortably valid', async () => {
    seedSession(10 * 60 * 1000); // 10 minutes left, well past the 60s skew
    const { fetchMock, refreshCalls } = deferredRefreshFetch();
    vi.stubGlobal('fetch', fetchMock);

    await auth.authFetch(`${V1}/wines`);
    expect(refreshCalls()).toBe(0);
  });

  it('refreshes pre-emptively inside the expiry skew', async () => {
    seedSession(30 * 1000); // 30s left, inside the 60s skew
    const { fetchMock, release, refreshCalls } = deferredRefreshFetch();
    vi.stubGlobal('fetch', fetchMock);

    const p = auth.authFetch(`${V1}/wines`);
    release();
    await p;
    expect(refreshCalls()).toBe(1);
  });

  it('retries once on a 401 that beat the pre-emptive refresh', async () => {
    seedSession(10 * 60 * 1000); // looks fresh; the server disagrees
    let dataCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith('/auth/refresh')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ access_token: 'access-new', refresh_token: 'refresh-new', expires_in: 3600 }),
        } as unknown as Response;
      }
      dataCalls += 1;
      // Revoked mid-flight the first time, fine once renewed.
      return { ok: dataCalls > 1, status: dataCalls > 1 ? 200 : 401, json: async () => ({}) } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await auth.authFetch(`${V1}/wines`);
    expect(res.status).toBe(200);
    expect(dataCalls).toBe(2);
  });

  it('clears the session when the refresh itself is rejected', async () => {
    seedSession(-1000);
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith('/auth/refresh')) {
        return { ok: false, status: 401, json: async () => ({ detail: 'Invalid refresh token' }) } as unknown as Response;
      }
      return { ok: false, status: 401, json: async () => ({}) } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    await auth.authFetch(`${V1}/wines`);
    expect(auth.isAuthed()).toBe(false);
    expect(store.getItem('taste_refresh_token')).toBeNull();
  });

  it('KEEPS the session when the refresh fails on the network', async () => {
    // A cellar with no reception must not sign you out. This is the difference
    // between "the server said no" and "the request never arrived".
    seedSession(-1000);
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith('/auth/refresh')) throw new TypeError('Failed to fetch');
      return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    await auth.authFetch(`${V1}/wines`).catch(() => undefined);
    expect(auth.isAuthed()).toBe(true);
    expect(store.getItem('taste_refresh_token')).toBe('refresh-old');
  });

  it('treats a stale access token with a live refresh token as still signed in', async () => {
    seedSession(-1000);
    expect(auth.isAuthed()).toBe(true);
  });

  it('purges the Insights-era keys', () => {
    store.setItem('public_access_token', 'old-insights-jwt');
    store.setItem('public_user', '{"id":10}');
    auth.purgeLegacyAuth();
    expect(store.getItem('public_access_token')).toBeNull();
    expect(store.getItem('public_user')).toBeNull();
  });

  it('survives localStorage throwing (private window, blocked site data)', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
      removeItem() {
        throw new Error('blocked');
      },
    });
    expect(() => auth.isAuthed()).not.toThrow();
    expect(auth.isAuthed()).toBe(false);
    vi.stubGlobal('localStorage', store);
  });
});
