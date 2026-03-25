// App.js — Auxein Grow mobile entry point
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { initMobileApi } from './src/api/setup';
import AppNavigator from './src/navigation/AppNavigator';
import AuthNavigator from './src/navigation/AuthNavigator';

// Swap the shared api instance to use SecureStore auth
initMobileApi();

function RootNavigator() {
  const { isAuthenticated, initialLoading } = useAuth();

  if (initialLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#5B6830" />
      </View>
    );
  }

  return isAuthenticated ? <AppNavigator /> : <AuthNavigator />;
}

export default function App() {
  return (
    <NavigationContainer>
      <AuthProvider>
        <StatusBar style="auto" />
        <RootNavigator />
      </AuthProvider>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FDF6E3' },
});
