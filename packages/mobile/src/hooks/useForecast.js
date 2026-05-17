// hooks/useForecast.js — Forecast for a property.
//
// Wraps forecastService.property() with loading/error state. Returns the
// flat backend shape directly:
//   { location: { lat, lon }, current: {...}, forecast: [...] }
//
// Refetches whenever propertyId changes. Returns null current/forecast while
// loading. 409 "no forecast point" surfaces as error: 'no_point' so the
// caller can render a sensible empty state (or pick a different property —
// see ConditionsHero for the auto-pick pattern).

import { useCallback, useEffect, useState } from 'react';
import { forecastService } from '../api/services';

export default function useForecast(propertyId, { hours = 24, intervalH = 3 } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!propertyId) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await forecastService.property(propertyId, { hours, intervalH });
      setData(res);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 409) {
        setError('no_point');
      } else if (status === 502) {
        setError('provider_unreachable');
      } else {
        setError(err?.response?.data?.detail || err?.message || 'Failed to load forecast');
      }
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [propertyId, hours, intervalH]);

  useEffect(() => { load(); }, [load]);

  return { data, current: data?.current ?? null, forecast: data?.forecast ?? [], loading, error, refetch: load };
}
