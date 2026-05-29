// hooks/useActiveCheckIn.js — Pulls the contractor's currently-active
// ContractorMovement (if any). Exposes the company/property the contractor is
// signed in to so create flows can pre-fill scope pickers and the map can
// scope its layers.
//
// Returns null when no active check-in exists OR when the caller isn't a
// contractor — callers should fall back to manual pickers in both cases.
//
// Refreshes on screen focus so sign-in/sign-out from another tab is reflected
// without the caller having to coordinate.

import { useState, useCallback, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { contractorService } from '../api/services';
import { useAuth } from '../contexts/AuthContext';

export default function useActiveCheckIn() {
  const { isContractor } = useAuth();
  const [activeCheckIn, setActiveCheckIn] = useState(null);
  // Start in loading=true so the first paint of any screen using this hook
  // can suppress empty-state UI until we actually know whether a check-in
  // exists. Without this, MapScreen + CheckInScreen briefly render the
  // "Sign in" CTA, the user taps it during the race, and we end up
  // double-checking-in.
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);

  const fetchActive = useCallback(async () => {
    if (!isContractor) {
      setActiveCheckIn(null);
      setLoading(false);
      setLoaded(true);
      return;
    }
    setLoading(true);
    try {
      // /me/movements is ordered by arrival_datetime desc — first row without
      // a departure is the active one.
      const movements = await contractorService.listMyRecentCheckIns(5);
      const list = Array.isArray(movements) ? movements : [];
      const active = list.find((m) => !m.departure_datetime) || null;
      setActiveCheckIn(active);
    } catch (err) {
      // Don't toast — every screen using this would compete on the message.
      // Caller can re-fetch on user gesture if state matters.
      console.warn('[useActiveCheckIn] fetch failed', err?.message);
      setActiveCheckIn(null);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [isContractor]);

  // Mount load + refresh on focus.
  useEffect(() => { fetchActive(); }, [fetchActive]);
  useFocusEffect(useCallback(() => { fetchActive(); }, [fetchActive]));

  return {
    activeCheckIn,
    companyId: activeCheckIn?.company_id ?? null,
    companyName: activeCheckIn?.company_name ?? null,
    propertyId: activeCheckIn?.property_id ?? null,
    propertyName: activeCheckIn?.property_name ?? null,
    loading,
    loaded,
    refresh: fetchActive,
  };
}
