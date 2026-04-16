// maps-v2/hooks/useAvailableCompanies.js — Load list of companies for admin dropdowns
import { useCallback, useEffect, useState } from 'react';
import { companiesService } from '@vineyard/shared';

/**
 * Load all companies for admin assignment dropdowns.
 * Handles various response shapes from the API.
 *
 * @param {boolean} isAuxeinAdmin — only loads if true
 * @returns {{ companies, loading, error, refresh }}
 */
export default function useAvailableCompanies(isAuxeinAdmin) {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!isAuxeinAdmin) return;
    try {
      setLoading(true);
      setError(null);
      const response = await companiesService.getAllCompanies();

      // Flexible response parsing — handles multiple API shapes
      let list = [];
      if (Array.isArray(response)) list = response;
      else if (response && Array.isArray(response.companies)) list = response.companies;
      else if (response && Array.isArray(response.data)) list = response.data;
      else if (response && Array.isArray(response.results)) list = response.results;
      else if (response && typeof response === 'object') {
        const arrays = Object.values(response).filter(Array.isArray);
        if (arrays.length > 0) list = arrays[0];
      }

      setCompanies(list);
    } catch (err) {
      console.error('Failed to load companies:', err);
      setError(err.message || 'Failed to load companies');
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  }, [isAuxeinAdmin]);

  useEffect(() => { refresh(); }, [refresh]);

  return { companies, loading, error, refresh };
}
