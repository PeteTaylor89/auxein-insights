// mobile/src/contexts/PropertyContext.js — Selected property, shared across
// Home, Map, and any future screen that needs to scope to one property at a time.
// Persists the choice to AsyncStorage so it survives app restarts and survives
// tab switches without each screen having to fetch + remember independently.
//
// Properties load lazily on first auth — guarded by useAuth().isAuthenticated.
// On logout, state clears (the AuthProvider's effect re-runs when its consumers
// see isAuthenticated flip, but we also expose a reset for explicit callers).

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { propertyService } from '../api/services';
import { useAuth } from './AuthContext';

const STORAGE_KEY = 'property.selectedId:v1';
// Sentinel stored in AsyncStorage when the user has explicitly chosen the
// "All properties" option. Distinct from "no saved choice" (key absent) so
// that loadProperties doesn't snap them back to the first property after a
// restart. Numeric strings are interpreted as a specific property id.
const ALL_SENTINEL = 'ALL';

const PropertyContext = createContext(null);

export const useProperty = () => {
  const ctx = useContext(PropertyContext);
  if (!ctx) throw new Error('useProperty must be used within a PropertyProvider');
  return ctx;
};

export const PropertyProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [properties, setProperties] = useState([]);
  const [selectedPropertyId, setSelectedPropertyIdState] = useState(null);
  // null + hasExplicitChoice=false means "haven't decided yet, default to first".
  // null + hasExplicitChoice=true  means "user picked All properties".
  const [hasExplicitChoice, setHasExplicitChoice] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Hydrate the persisted selection once at mount. Properties load separately
  // so a slow API doesn't block the saved-id read.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (cancelled || !raw) return;
        if (raw === ALL_SENTINEL) {
          setSelectedPropertyIdState(null);
          setHasExplicitChoice(true);
          return;
        }
        const parsed = parseInt(raw, 10);
        if (Number.isFinite(parsed)) {
          setSelectedPropertyIdState(parsed);
          setHasExplicitChoice(true);
        }
      } catch (err) {
        console.warn('[PropertyContext] hydrate failed', err?.message);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadProperties = useCallback(async () => {
    if (!isAuthenticated) {
      setProperties([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await propertyService.listProperties();
      const list = Array.isArray(res) ? res : [];
      setProperties(list);
      // Only auto-default to the first property when the user has never made
      // an explicit choice. Otherwise respect their saved decision — including
      // the "All properties" case (selectedPropertyId is null AND
      // hasExplicitChoice is true).
      setSelectedPropertyIdState((prev) => {
        if (hasExplicitChoice) {
          if (prev === null) return null; // user picked "All"
          if (prev && list.some((p) => p.id === prev)) return prev;
          // Saved id no longer in the list (lost scope) — fall back to first.
          return list[0]?.id ?? null;
        }
        return list[0]?.id ?? null;
      });
    } catch (err) {
      console.warn('[PropertyContext] load failed', err?.response?.status, err?.message);
      setError(err?.response?.data?.detail || err?.message || 'Failed to load properties');
      setProperties([]);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, hasExplicitChoice]);

  useEffect(() => { loadProperties(); }, [loadProperties]);

  // Pass null to mean "All properties". Both flavours persist so the choice
  // survives an app restart.
  const setSelectedPropertyId = useCallback((id) => {
    setSelectedPropertyIdState(id);
    setHasExplicitChoice(true);
    AsyncStorage.setItem(STORAGE_KEY, id === null ? ALL_SENTINEL : String(id)).catch((err) => {
      console.warn('[PropertyContext] persist failed', err?.message);
    });
  }, []);

  const selectedProperty = useMemo(
    () => properties.find((p) => p.id === selectedPropertyId) || null,
    [properties, selectedPropertyId],
  );

  const value = useMemo(() => ({
    properties,
    selectedPropertyId,
    selectedProperty,
    setSelectedPropertyId,
    loading,
    error,
    refetch: loadProperties,
  }), [properties, selectedPropertyId, selectedProperty, setSelectedPropertyId, loading, error, loadProperties]);

  return <PropertyContext.Provider value={value}>{children}</PropertyContext.Provider>;
};
