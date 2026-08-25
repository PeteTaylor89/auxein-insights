// hooks/useProjectionCatalogue.js — which climate projections exist, for whom.
//
// The projection twin of `useSurfaceAvailability`, and it exists separately for
// the same reason the table and the service do: a projection is keyed by
// (scenario, period, season) and has no date, no gaps and no scrubber. Sharing
// a hook would mean one of them carrying fields that are always null.
//
// **The response depends on who is asking**, so identity is a dependency of the
// fetch. Without it, signing in leaves the projection controls locked until the
// page is reloaded, which reads as the sign-up not having worked — the same bug
// `useSurfaceAvailability` documents, and the same fix.
//
// THE MATRIX IS NOT FULL. 16 of the 18 (scenario, period) pairs are published,
// because only ssp370 reaches +3 C. `combinations` is exposed so the controls
// can disable a pair rather than offering a chip that 404s.
import { useEffect, useMemo, useState } from 'react';
import {
  getProjectionCatalogue,
  projectionCombinations,
  isSurfacesUnavailable,
} from '../services/surfaceService';
import { usePublicAuth } from '../contexts/PublicAuthContext';

export default function useProjectionCatalogue(variable, statistic, { enabled = true } = {}) {
  const [catalogue, setCatalogue] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [unavailable, setUnavailable] = useState(false);

  const { user, isAuthenticated } = usePublicAuth();
  // Identity as a scalar: the context hands back a new object every render, and
  // an object in the dependency array would re-fetch the catalogue every time.
  const authKey = user?.id ?? (isAuthenticated ? 'authed' : 'anon');

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setUnavailable(false);

    getProjectionCatalogue({ variable, statistic })
      .then((data) => { if (!cancelled) setCatalogue(data); })
      .catch((err) => {
        if (cancelled) return;
        if (isSurfacesUnavailable(err)) setUnavailable(true);
        else setError(err);
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [variable, statistic, authKey, enabled]);

  const steps = catalogue?.steps ?? [];

  return {
    catalogue,
    loading,
    error,
    unavailable,
    layers: catalogue?.layers ?? [],
    scenarios: catalogue?.scenarios ?? [],
    periods: catalogue?.periods ?? [],
    seasons: catalogue?.seasons ?? [],
    steps,
    // Per-SEASON, because rainfall and the day counts have a different scale
    // for a three-month window than for a twelve-month one.
    domains: catalogue?.meta?.domains ?? {},
    access: catalogue?.meta?.access ?? null,
    // The CC BY 4.0 attribution. The licence requires it to travel with the
    // work, so it is rendered from here rather than hardcoded anywhere.
    source: catalogue?.meta?.source ?? null,
    // The 1986-2005 normal, keyed by season. Present only for seasons that
    // actually have one, so the flip can be disabled rather than 404 on a
    // season the baseline does not cover.
    baselines: catalogue?.baselines ?? {},
    // OUR attribution, separate from MfE's. A baseline is a reduction of our
    // own archive; showing it under someone else's licence notice would credit
    // our work to them.
    baselineSource: catalogue?.meta?.baseline_source ?? null,
    baselineKey: catalogue?.meta?.baseline_key ?? null,
    baseline: catalogue?.meta?.baseline ?? null,
    modelVersion: catalogue?.meta?.model_version ?? null,
    combinations: useMemo(() => projectionCombinations(steps), [steps]),
  };
}
