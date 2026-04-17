import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fontSize, radius } from '../styles/theme';

export default function GpsSection({ latitude, longitude, accuracy, isLocked }) {
  const statusLabel = isLocked ? 'Locked' : accuracy ? `${Math.round(accuracy)}m` : 'Acquiring...';
  const statusColor = isLocked ? colors.gpsActive : accuracy && accuracy < 30 ? colors.gpsActive : colors.warning;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.labelRow}>
          <Feather name="crosshair" size={16} color={colors.gps} />
          <Text style={styles.label}>GPS Location</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: statusColor }]}>
          <View style={styles.dot} />
          <Text style={styles.badgeText}>{statusLabel}</Text>
        </View>
      </View>

      <View style={styles.coordsRow}>
        <View style={styles.coordBox}>
          <Text style={styles.coordLabel}>LATITUDE</Text>
          <Text style={styles.coordValue}>
            {latitude != null ? Number(latitude).toFixed(5) : '—'}
          </Text>
        </View>
        <View style={styles.coordBox}>
          <Text style={styles.coordLabel}>LONGITUDE</Text>
          <Text style={styles.coordValue}>
            {longitude != null ? Number(longitude).toFixed(5) : '—'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.gpsBg,
    borderWidth: 1,
    borderColor: colors.gpsBorder,
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.gps,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.white,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.white,
  },
  coordsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  coordBox: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radius.sm,
    padding: 10,
  },
  coordLabel: {
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  coordValue: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.text,
    fontFamily: 'monospace',
  },
});
