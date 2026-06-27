// Sync triggers: an initial pass on boot, whenever the device comes back online,
// and a slow heartbeat. All are no-ops when signed out or offline (engine guards).
import { isAuthed } from '@/auth/publicAuth';
import { syncNow } from './engine';

const HEARTBEAT_MS = 60_000;
let started = false;

export function startAutoSync(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  void syncNow();
  window.addEventListener('online', () => void syncNow());
  window.setInterval(() => {
    if (navigator.onLine && isAuthed()) void syncNow();
  }, HEARTBEAT_MS);
}
