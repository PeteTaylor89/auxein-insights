// src/hooks/usePageTracking.js - Track SPA page navigation
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { queueEvent } from '../utils/eventTracker';

/**
 * Track page views on every route change.
 * Place once in App.jsx or a layout wrapper.
 */
export default function usePageTracking() {
  const location = useLocation();
  const prevPath = useRef(null);

  useEffect(() => {
    // Skip the initial mount if it's the same path (avoids double-fire)
    if (location.pathname === prevPath.current) return;

    queueEvent('page_view', {
      path: location.pathname,
      referrer: prevPath.current || document.referrer || '',
    });

    prevPath.current = location.pathname;
  }, [location.pathname]);
}
