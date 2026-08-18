// hooks/useProSites.js — the subscriber's sites, and the populating wait.
//
// Placement is asynchronous, so this hook's real job is the WAIT. A site is
// created with `status: 'populating'`, a cron extracts ~7,700 cells from the
// archive, and the page has to show something honest for the several minutes
// that takes.
//
// Polling rules, all of them about not lying to someone who is paying:
//
//  * **Poll only while something is actually populating.** A ready site is
//    static — the archive does not change under it — so continuing to poll
//    would be pure noise against the API.
//  * **Back off.** Extraction takes minutes, not seconds. Starting at 4s and
//    easing to 20s keeps the first moments responsive without hammering.
//  * **Give up loudly.** After the ceiling the hook stops and says the wait is
//    longer than expected, rather than spinning forever on a page that looks
//    like it is still working. A cron that died must not read as "nearly done".
import { useCallback, useEffect, useRef, useState } from 'react';
import { listSites } from '../services/proSiteService';

const POLL_START_MS = 4000;
const POLL_MAX_MS = 20000;
const POLL_BACKOFF = 1.4;
// ~10 minutes of polling. Extraction is minutes; beyond this something is wrong
// and saying so beats an indefinite spinner.
const GIVE_UP_MS = 10 * 60 * 1000;

export default function useProSites({ enabled = true } = {}) {
  const [sites, setSites] = useState([]);
  const [quota, setQuota] = useState(null);
  const [moves, setMoves] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);
  const [stalled, setStalled] = useState(false);

  const timerRef = useRef(null);
  const delayRef = useRef(POLL_START_MS);
  const waitingSinceRef = useRef(null);
  const liveRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!enabled) return null;
    try {
      const data = await listSites();
      if (!liveRef.current) return null;
      setSites(data.sites || []);
      setQuota(data.quota || null);
      setMoves(data.moves || null);
      setError(null);
      return data.sites || [];
    } catch (err) {
      if (!liveRef.current) return null;
      // A 402/401 here is not an error to display — it means this account is
      // not entitled, which the page handles by showing the offer instead.
      if (err?.response?.status === 402 || err?.response?.status === 401) {
        setSites([]);
        setQuota(null);
      } else {
        setError(err);
      }
      return null;
    } finally {
      if (liveRef.current) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    liveRef.current = true;
    if (enabled) refresh();
    return () => {
      liveRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, refresh]);

  // The poll loop. Keyed on whether anything is populating rather than on a
  // timer, so it starts and stops with the actual condition.
  const populating = sites.some((s) => s.status === 'populating');

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!enabled || !populating) {
      delayRef.current = POLL_START_MS;
      waitingSinceRef.current = null;
      setStalled(false);
      return undefined;
    }

    if (waitingSinceRef.current == null) waitingSinceRef.current = Date.now();
    if (Date.now() - waitingSinceRef.current > GIVE_UP_MS) {
      setStalled(true);
      return undefined;
    }

    timerRef.current = setTimeout(() => {
      delayRef.current = Math.min(POLL_MAX_MS, delayRef.current * POLL_BACKOFF);
      refresh();
    }, delayRef.current);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [enabled, populating, sites, refresh]);

  return {
    sites,
    quota,
    moves,
    loading,
    error,
    populating,
    // True once the wait has run past the point where it is plausibly still
    // working. The page says so rather than spinning.
    stalled,
    canPlace: Boolean(quota && quota.remaining > 0),
    refresh,
  };
}
