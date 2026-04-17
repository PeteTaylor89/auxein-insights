// hooks/useNetworkStatus.js — Network connectivity detection
import { useState, useEffect, useCallback } from 'react';
import NetInfo from '@react-native-community/netinfo';

let _listeners = [];
let _currentState = { isOnline: true, type: 'unknown' };

function notify() {
  _listeners.forEach(fn => fn({ ..._currentState }));
}

// Single global subscription (shared across all hook instances)
let _unsubscribe = null;
function ensureSubscription() {
  if (_unsubscribe) return;
  _unsubscribe = NetInfo.addEventListener(state => {
    _currentState = {
      isOnline: state.isConnected && state.isInternetReachable !== false,
      type: state.type,
    };
    notify();
  });
}

export default function useNetworkStatus() {
  const [status, setStatus] = useState(_currentState);

  useEffect(() => {
    ensureSubscription();
    _listeners.push(setStatus);

    // Fetch current state immediately
    NetInfo.fetch().then(state => {
      _currentState = {
        isOnline: state.isConnected && state.isInternetReachable !== false,
        type: state.type,
      };
      setStatus({ ..._currentState });
    });

    return () => {
      _listeners = _listeners.filter(fn => fn !== setStatus);
    };
  }, []);

  return status;
}

// Imperative check (for use outside React components)
export async function checkNetwork() {
  const state = await NetInfo.fetch();
  return state.isConnected && state.isInternetReachable !== false;
}
