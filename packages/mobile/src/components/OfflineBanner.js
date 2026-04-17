import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, fontSize } from '../styles/theme';
import useNetworkStatus from '../hooks/useNetworkStatus';

export default function OfflineBanner() {
  const { isOnline } = useNetworkStatus();

  if (isOnline) return null;

  return (
    <View style={styles.banner}>
      <Feather name="wifi-off" size={14} color={colors.white} />
      <Text style={styles.text}>No connection — changes will sync when online</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.danger,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  text: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
});
