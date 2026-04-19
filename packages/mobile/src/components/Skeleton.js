// components/Skeleton.js — Animated shimmer placeholder for loading states
import { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { colors, radius, spacing } from '../styles/theme';

export default function Skeleton({ width = '100%', height = 14, style, radius: r = radius.sm }) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: r, backgroundColor: colors.borderLight, opacity },
        style,
      ]}
    />
  );
}

export function SkeletonCard() {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Skeleton width={36} height={36} r={radius.md} />
        <View style={{ flex: 1, gap: 6 }}>
          <Skeleton width="70%" height={14} />
          <Skeleton width="40%" height={11} />
        </View>
      </View>
      <View style={{ marginTop: spacing.sm, gap: 6 }}>
        <Skeleton width="90%" height={11} />
        <Skeleton width="60%" height={11} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
