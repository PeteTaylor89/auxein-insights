// hooks/useSurfaceAvailability.js — what surfaces exist, and where the holes are.
//
// Contract §5.3. `gaps` is authoritative: consumers grey out missing dates
// rather than requesting them and rendering holes. Everything that needs a date
// — the scrubber, the mini map, any picker — starts here.
//
// Surfaces being switched off (503 from the stub) is a normal state, not an
// error. `unavailable` is separated from `error` so a panel can hide itself
// quietly in that case instead of showing an outage to a user.
//
// **The response depends on who is asking.** The free rule is a CADENCE
// (2026-08-25): the whole monthly archive is open to everyone, and the daily
// surface is Pro. That makes identity a dependency of this fetch — without it,
// upgrading leaves a daily layer locked until the page is reloaded, which reads
// as the purchase not having worked. Hence the auth context is consumed here
// rather than being pushed in by every caller.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getAvailable,
  isInGap,
  latestAvailableDate,
  monthsAvailable,
  isSurfacesUnavailable,
  stepsAvailable,
  DEFAULT_GRANULARITY,
} from '../services/surfaceService';
import { usePublicAuth } from '../contexts/PublicAuthContext';

export default function useSurfaceAvailability(
  variable = 'temp_mean',
  granularity = DEFAULT_GRANULARITY,
  statistic,
) {
  const [available, setAvailable] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [unavailable, setUnavailable] = useState(false);

  const { user, isAuthenticated } = usePublicAuth();
  // Identity as a scalar, so a new object identity from the context on every
  // render does not re-fetch the archive index on every render.
  const authKey = user?.id ?? (isAuthenticated ? 'authed' : 'anon');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setUnavailable(false);

    getAvailable({ variable, granularity, statistic })
      .then((data) => {
        if (cancelled) return;
        setAvailable(data);
      })
      .catch((err) => {
        if (cancelled) return;
        if (isSurfacesUnavailable(err)) setUnavailable(true);
        else setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [variable, granularity, statistic, authKey]);

  // Every step the archive actually holds, in order — what the scrubber steps
  // through. Monthly reconstructs from first/last minus gaps; SEASON must read
  // the step list verbatim, because a Sep-Apr series has no May-August and the
  // calendar walk would invent four steps per season. Empty for anything else.
  const months = useMemo(() => {
    if (granularity === 'monthly') return monthsAvailable(available);
    if (granularity === 'season') return stepsAvailable(available);
    return [];
  }, [available, granularity]);

  const latest = useMemo(() => {
    if (months.length) return months[months.length - 1];
    return latestAvailableDate(available);
  }, [available, months]);

  const dateIsAvailable = useCallback((date) => {
    if (!available) return false;
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return false;
    if (available.first && d < new Date(available.first)) return false;
    if (available.last && d > new Date(available.last)) return false;
    return !isInGap(d, available.gaps);
  }, [available]);

  return {
    available,
    loading,
    error,
    unavailable,
    latest,
    months,
    statistics: available?.meta?.statistics ?? [],
    unit: available?.meta?.unit ?? null,
    dateIsAvailable,
    gaps: available?.gaps ?? [],
    // The stub says so about itself; the real pipeline will not. Anything that
    // must not ship demo numbers to a user checks this.
    isStub: Boolean(available?.meta?.stub),
    // What this caller may see, straight from the server. `scope` is 'full' at
    // any FREE cadence — monthly, season, records — for everyone including
    // anonymous, and 'none' at the daily cadence for anyone who is not Pro;
    // that form also carries the daily span so the prompt can say what is
    // actually on offer. Never infer this from local auth state — the server is
    // the one that trimmed the list.
    access: available?.meta?.access ?? null,
  };
}
