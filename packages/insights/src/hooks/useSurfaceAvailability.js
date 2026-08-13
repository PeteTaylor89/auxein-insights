// hooks/useSurfaceAvailability.js — what surfaces exist, and where the holes are.
//
// Contract §5.3. `gaps` is authoritative: consumers grey out missing dates
// rather than requesting them and rendering holes. Everything that needs a date
// — the scrubber, the mini map, any picker — starts here.
//
// Surfaces being switched off (503 from the stub) is a normal state, not an
// error. `unavailable` is separated from `error` so a panel can hide itself
// quietly in that case instead of showing an outage to a user.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getAvailable,
  isInGap,
  latestAvailableDate,
  isSurfacesUnavailable,
} from '../services/surfaceService';

export default function useSurfaceAvailability(variable = 'temp_mean', granularity = 'daily') {
  const [available, setAvailable] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setUnavailable(false);

    getAvailable({ variable, granularity })
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
  }, [variable, granularity]);

  const latest = useMemo(() => latestAvailableDate(available), [available]);

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
    dateIsAvailable,
    gaps: available?.gaps ?? [],
    // The stub says so about itself; the real pipeline will not. Anything that
    // must not ship demo numbers to a user checks this.
    isStub: Boolean(available?.meta?.stub),
  };
}
