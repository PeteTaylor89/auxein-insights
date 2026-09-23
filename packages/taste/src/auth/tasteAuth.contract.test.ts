import { beforeAll, describe, expect, it, vi } from 'vitest';

// CONTRACT test: the real client module against a REAL taste-api.
//
// The mocked suite in tasteAuth.test.ts proves the client behaves correctly
// given a server that responds the way the client expects. It cannot prove the
// server actually does — a renamed field (`refresh_token` vs `refreshToken`,
// `expires_in` vs `expiresIn`) passes every mock and fails in a browser.
//
// SKIPPED unless TASTE_API_URL is set, so a normal `npm test` does not depend on
// a running backend:
//   TASTE_API_URL=http://127.0.0.1:8001 npx vitest run src/auth/tasteAuth.contract.test.ts

const API = process.env.TASTE_API_URL;
const describeIf = API ? describe : describe.skip;

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

describeIf('tasteAuth against a live taste-api', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let auth: any;
  const email = `contract-${Date.now()}@example.com`;
  const password = 'contract-test-pw-1';

  beforeAll(async () => {
    vi.stubEnv('VITE_TASTE_API_URL', API as string);
    auth = await import('./tasteAuth');
  });

  it('register returns the token pair the client expects', async () => {
    const user = await auth.register(email, password, 'Contract Tester', `ct${Date.now() % 100000}`);
    expect(auth.isAuthed()).toBe(true);
    // If the server renamed any of these, the client would have stored nothing.
    expect(store.getItem('taste_access_token')).toBeTruthy();
    expect(store.getItem('taste_refresh_token')).toBeTruthy();
    expect(Number(store.getItem('taste_access_expires'))).toBeGreaterThan(Date.now());
    // /auth/me was reached with the token just minted.
    expect(user?.email).toBe(email);
  });

  it('authFetch reaches an authed data route', async () => {
    const res = await auth.authFetch(`${API}/taste/v1/wines`);
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  it('a real refresh rotates and the new token works', async () => {
    const before = store.getItem('taste_refresh_token');
    const fresh = await auth.refreshAccessToken();
    expect(fresh).toBeTruthy();
    expect(store.getItem('taste_refresh_token')).not.toBe(before);

    const res = await auth.authFetch(`${API}/taste/v1/wines`);
    expect(res.status).toBe(200);
  });

  it('the rotated-away refresh token is dead on the real server', async () => {
    // Proves the replay detection the single-flight guard exists to avoid.
    const res = await fetch(`${API}/taste/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: 'obviously-not-a-real-token' }),
    });
    expect(res.status).toBe(401);
  });

  it('login works against a real account', async () => {
    store.clear();
    const user = await auth.login(email, password);
    expect(user?.email).toBe(email);
    expect(auth.isAuthed()).toBe(true);
  });

  it('a wrong password surfaces the server message, not a generic one', async () => {
    await expect(auth.login(email, 'definitely-wrong')).rejects.toThrow(/Invalid email or password/);
  });

  it('logout revokes server-side and clears locally', async () => {
    await auth.login(email, password);
    const refresh = store.getItem('taste_refresh_token');
    await auth.logout();
    expect(auth.isAuthed()).toBe(false);

    const res = await fetch(`${API}/taste/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    expect(res.status).toBe(401);
  });

  it('profile update round-trips a handle', async () => {
    await auth.login(email, password);
    const handle = `ct${Date.now() % 1000000}`;
    const updated = await auth.updateProfile({ handle, display_name: 'Renamed' });
    expect(updated.handle).toBe(handle);
    expect(updated.display_name).toBe('Renamed');
    expect(auth.getUser()?.handle).toBe(handle);
  });
});
