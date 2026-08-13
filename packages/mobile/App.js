// App.js — Auxein Grow mobile entry point
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { PropertyProvider } from './src/contexts/PropertyContext';
import { initMobileApi } from './src/api/setup';
import AppNavigator from './src/navigation/AppNavigator';
import AuthNavigator from './src/navigation/AuthNavigator';
import OfflineBanner from './src/components/OfflineBanner';
import { ToastProvider } from './src/components/Toast';
import { initQueue } from './src/services/gpsQueue';
import { initWriteQueue } from './src/services/writeQueue';
import { initUploadQueue } from './src/services/uploadQueue';
import { initSyncCoordinator, triggerSync } from './src/services/syncCoordinator';

// Swap the shared api instance to use SecureStore auth
initMobileApi();

function RootNavigator() {
  const { isAuthenticated, initialLoading } = useAuth();

  // Init offline queues + sync coordinator on auth, then drain anything pending.
  // Coordinator listens for reconnect transitions and auto-flushes thereafter.
  React.useEffect(() => {
    if (!isAuthenticated) return;
    (async () => {
      try {
        // Handlers must be registered before anything can flush, or a queued
        // photo upload would be skipped as an unknown type.
        initUploadQueue();
        await Promise.all([initQueue(), initWriteQueue()]);
        await initSyncCoordinator();
        await triggerSync();
      } catch {}
    })();
  }, [isAuthenticated]);

  if (initialLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  if (!isAuthenticated) return <AuthNavigator />;

  return (
    <View style={{ flex: 1 }}>
      <OfflineBanner />
      <AppNavigator />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <AuthProvider>
          <PropertyProvider>
            <ToastProvider>
              <StatusBar style="auto" />
              <RootNavigator />
            </ToastProvider>
          </PropertyProvider>
        </AuthProvider>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#5B6830' },
});
