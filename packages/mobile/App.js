// App.js — Auxein Grow mobile entry point
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { initMobileApi } from './src/api/setup';
import AppNavigator from './src/navigation/AppNavigator';
import AuthNavigator from './src/navigation/AuthNavigator';
import OfflineBanner from './src/components/OfflineBanner';
import { ToastProvider } from './src/components/Toast';
import { initQueue, flushQueue } from './src/services/gpsQueue';

// Swap the shared api instance to use SecureStore auth
initMobileApi();

function RootNavigator() {
  const { isAuthenticated, initialLoading } = useAuth();

  // Init offline queue and flush any pending GPS points on auth
  React.useEffect(() => {
    if (isAuthenticated) {
      initQueue().then(() => flushQueue()).catch(() => {});
    }
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
          <ToastProvider>
            <StatusBar style="auto" />
            <RootNavigator />
          </ToastProvider>
        </AuthProvider>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#5B6830' },
});
