// screens/GpsTrackingScreen.js — Full-screen GPS tracking overlay (rendered as Modal)
import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Alert } from 'react-native';
import { colors, spacing, fontSize, radius } from '../styles/theme';

export default function GpsTrackingScreen({ gps, taskTitle, taskNumber, onClose }) {
  // Flashing dot animation
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (gps && !gps.isPaused && gps.isTracking) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.2, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [gps?.isPaused, gps?.isTracking, pulseAnim]);

  const { stats, isPaused, isTracking } = gps || {};

  const formatDuration = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const formatDistance = (meters) => {
    if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
    return `${Math.round(meters)} m`;
  };

  const handleStop = () => {
    Alert.alert(
      'Stop and lock GPS?',
      'GPS recording will be saved permanently. You won\'t be able to add more tracking to this task afterwards.\n\nThe task itself can still be completed (hours, notes, etc.) — this only locks the GPS track.\n\nIf you just want a break, use Pause instead.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop and lock',
          style: 'destructive',
          onPress: async () => {
            await gps.stopTracking();
            onClose();
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <Text style={styles.backText}>← Back to Task</Text>
        </TouchableOpacity>
        {taskNumber && <Text style={styles.taskNumber}>{taskNumber}</Text>}
      </View>

      {/* Status indicator */}
      <View style={styles.statusSection}>
        <Animated.View
          style={[
            styles.statusDot,
            isPaused ? styles.statusDotPaused : styles.statusDotActive,
            { opacity: isPaused ? 1 : pulseAnim },
          ]}
        />
        <Text style={[styles.statusLabel, isPaused && styles.statusLabelPaused]}>
          {isPaused ? 'PAUSED' : 'TRACKING'}
        </Text>
      </View>

      {taskTitle && <Text style={styles.taskTitle} numberOfLines={2}>{taskTitle}</Text>}

      {/* Main stats grid */}
      <View style={styles.statsGrid}>
        <View style={styles.statCardLarge}>
          <Text style={styles.statValueLarge}>{formatDistance(stats?.distance || 0)}</Text>
          <Text style={styles.statLabelLarge}>Distance</Text>
        </View>

        <View style={styles.statCardLarge}>
          <Text style={styles.statValueLarge}>{formatDuration(stats?.duration || 0)}</Text>
          <Text style={styles.statLabelLarge}>Duration</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {stats?.avgSpeed > 0 ? `${stats.avgSpeed.toFixed(1)}` : '—'}
          </Text>
          <Text style={styles.statLabel}>km/h avg</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats?.pointCount || 0}</Text>
          <Text style={styles.statLabel}>GPS Points</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {stats?.duration > 0 && stats?.distance > 0
              ? `${((stats.distance / 1000) / (stats.duration / 3600)).toFixed(1)}`
              : '—'}
          </Text>
          <Text style={styles.statLabel}>km/h now</Text>
        </View>
      </View>

      {/* Accuracy indicator */}
      <View style={styles.accuracyBar}>
        <View style={[styles.accuracyDot, { backgroundColor: colors.success }]} />
        <Text style={styles.accuracyText}>GPS Signal: High Accuracy</Text>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        {isPaused ? (
          <TouchableOpacity
            style={[styles.controlBtn, styles.controlBtnResume]}
            onPress={() => gps.resumeTracking()}
          >
            <Text style={styles.controlBtnResumeText}>Resume Tracking</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.controlBtn, styles.controlBtnPause]}
            onPress={() => gps.pauseTracking()}
          >
            <Text style={styles.controlBtnPauseText}>Pause Tracking</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={[styles.controlBtn, styles.controlBtnStop]} onPress={handleStop}>
          <Text style={styles.controlBtnStopText}>Stop Tracking</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    paddingTop: 60,
    paddingHorizontal: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  backBtn: { paddingVertical: spacing.xs },
  backText: { color: '#8892b0', fontSize: fontSize.sm, fontWeight: '500' },
  taskNumber: { color: '#8892b0', fontSize: fontSize.xs, fontWeight: '500' },
  statusSection: { alignItems: 'center', marginBottom: spacing.md },
  statusDot: { width: 24, height: 24, borderRadius: 12, marginBottom: spacing.sm },
  statusDotActive: {
    backgroundColor: '#00ff88',
    shadowColor: '#00ff88',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 8,
  },
  statusDotPaused: {
    backgroundColor: colors.warning,
    shadowColor: colors.warning,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 4,
  },
  statusLabel: { color: '#00ff88', fontSize: fontSize.sm, fontWeight: '700', letterSpacing: 3 },
  statusLabelPaused: { color: colors.warning },
  taskTitle: {
    color: colors.white, fontSize: fontSize.md, fontWeight: '600',
    textAlign: 'center', marginBottom: spacing.xl,
  },
  statsGrid: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  statCardLarge: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: radius.lg,
    padding: spacing.lg, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  statValueLarge: { color: colors.white, fontSize: 28, fontWeight: '700', fontVariant: ['tabular-nums'] },
  statLabelLarge: {
    color: '#8892b0', fontSize: fontSize.xs, fontWeight: '500',
    marginTop: spacing.xs, textTransform: 'uppercase', letterSpacing: 1,
  },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  statCard: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: radius.md,
    padding: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  statValue: { color: colors.white, fontSize: fontSize.lg, fontWeight: '700', fontVariant: ['tabular-nums'] },
  statLabel: { color: '#8892b0', fontSize: 10, fontWeight: '500', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  accuracyBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, marginBottom: spacing.xl, paddingVertical: spacing.sm,
  },
  accuracyDot: { width: 8, height: 8, borderRadius: 4 },
  accuracyText: { color: '#8892b0', fontSize: fontSize.xs },
  controls: { gap: spacing.md, marginTop: 'auto', paddingBottom: spacing.xl },
  controlBtn: { paddingVertical: spacing.base, borderRadius: radius.md, alignItems: 'center' },
  controlBtnPause: { backgroundColor: 'rgba(245, 158, 11, 0.15)', borderWidth: 1.5, borderColor: colors.warning },
  controlBtnPauseText: { color: colors.warning, fontSize: fontSize.base, fontWeight: '600' },
  controlBtnResume: { backgroundColor: 'rgba(0, 255, 136, 0.15)', borderWidth: 1.5, borderColor: '#00ff88' },
  controlBtnResumeText: { color: '#00ff88', fontSize: fontSize.base, fontWeight: '600' },
  controlBtnStop: { backgroundColor: 'rgba(220, 38, 38, 0.12)', borderWidth: 1.5, borderColor: colors.danger },
  controlBtnStopText: { color: colors.danger, fontSize: fontSize.base, fontWeight: '600' },
});
