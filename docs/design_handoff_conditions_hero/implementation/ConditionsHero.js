// mobile/src/components/ConditionsHero.js
// Hero card for the Home screen. Renders a seasonal photograph, a
// time-of-day CSS-equivalent overlay, a greeting, status badge, and a
// 4-up weather strip. Owns its own time-of-day re-evaluation.
//
// Usage:
//   <ConditionsHero
//     firstName={user?.first_name ?? 'there'}
//     weather={{ temp: 14, hi: 21, humidity: 72, windKmh: 8, gustKmh: 14, rainMmNextHour: 0 }}
//     hemisphere="south"   // optional, default 'south'
//   />

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ImageBackground } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, radius, fontSize, shadows } from '../styles/theme';
import { phaseOf, greetingOf, statusBadgeFor, TOD_OVERLAYS } from '../utils/tod';
import { seasonOf } from '../utils/seasons';

// ──────────────────────────────────────────────────────────────
// Seasonal photo map. Replace placeholders as new shots come in.
// Until then, every season points at winter.jpg.
// ──────────────────────────────────────────────────────────────
const PHOTOS = {
  winter: require('../../assets/hero/winter.jpg'),
  spring: require('../../assets/hero/winter.jpg'), // TODO: replace with spring.jpg
  summer: require('../../assets/hero/winter.jpg'), // TODO: replace with summer.jpg
  autumn: require('../../assets/hero/winter.jpg'), // TODO: replace with autumn.jpg
};

const DATE_FORMAT = { weekday: 'long', day: 'numeric', month: 'short' };

function formatTime(d) {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function formatDate(d) {
  return d.toLocaleDateString('en-NZ', DATE_FORMAT);
}

export default function ConditionsHero({
  firstName = 'there',
  weather = {},
  hemisphere = 'south',
}) {
  const [now, setNow] = useState(() => new Date());

  // re-evaluate the clock every 60s and on focus
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(id);
  }, []);
  useFocusEffect(useCallback(() => { setNow(new Date()); }, []));

  const phase = phaseOf(now);
  const overlay = TOD_OVERLAYS[phase];
  const season = seasonOf(now, hemisphere);
  const photo = PHOTOS[season] || PHOTOS.winter;
  const badge = statusBadgeFor(weather, phase);
  const greeting = greetingOf(phase, firstName);

  return (
    <View style={styles.card}>
      {/* Photo band with overlay stack */}
      <View style={styles.photoBand}>
        <ImageBackground source={photo} style={styles.photo} resizeMode="cover">
          {/* Layer 1 — linear gradient */}
          <LinearGradient
            colors={overlay.gradient.colors}
            locations={overlay.gradient.locations}
            style={StyleSheet.absoluteFill}
          />
          {/* Layer 2 — sun glow (faked radial via shadow on a circular View) */}
          <View
            style={[
              styles.sun,
              {
                width: overlay.sun.size,
                height: overlay.sun.size,
                borderRadius: overlay.sun.size / 2,
                backgroundColor: overlay.sun.color,
                opacity: overlay.sun.opacity,
                left: `${overlay.sun.x * 100}%`,
                top: `${overlay.sun.y * 100}%`,
                marginLeft: -overlay.sun.size / 2,
                marginTop: -overlay.sun.size / 2,
                shadowColor: overlay.sun.color,
                shadowRadius: overlay.sun.shadowRadius,
                shadowOpacity: 0.6,
                shadowOffset: { width: 0, height: 0 },
                // Android has no soft radial shadow; elevation gives a hint.
                elevation: 6,
              },
            ]}
          />
          {/* Time-of-day chip */}
          <View style={styles.timeChip}>
            <View style={[styles.timeChipDot, { backgroundColor: overlay.accent }]} />
            <Text style={styles.timeChipText}>
              {formatTime(now)} · {overlay.label}
            </Text>
          </View>
        </ImageBackground>
      </View>

      {/* Content band */}
      <View style={styles.content}>
        <View style={styles.contentRow}>
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.dateLine}>{formatDate(now)}</Text>
            <Text style={styles.greeting} numberOfLines={1}>{greeting}</Text>
          </View>

          <View style={[styles.badge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
            <View style={[styles.badgeDot, { backgroundColor: badge.dot }]} />
            <Text style={[styles.badgeText, { color: badge.text }]}>{badge.label}</Text>
          </View>
        </View>

        {/* Weather strip */}
        <View style={styles.weatherStrip}>
          <WeatherCell icon="thermometer"
            value={fmt(weather.temp, '°')}
            label="Temp" />
          <WeatherCell icon="droplet"
            value={fmt(weather.humidity, '%')}
            label="Humid" />
          <WeatherCell icon="wind"
            value={fmt(weather.windKmh)}
            label="km/h" />
          <WeatherCell icon="cloud-rain"
            value={fmt(weather.rainMmNextHour ?? 0, '', 1)}
            label="mm" />
        </View>
      </View>
    </View>
  );
}

function WeatherCell({ icon, value, label }) {
  return (
    <View style={styles.cell}>
      <Feather name={icon} size={18} color={colors.olive} />
      <Text style={styles.cellValue}>{value}</Text>
      <Text style={styles.cellLabel}>{label}</Text>
    </View>
  );
}

function fmt(n, suffix = '', decimals = 0) {
  if (n == null || Number.isNaN(n)) return '—';
  return Number(n).toFixed(decimals) + suffix;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginHorizontal: spacing.base,
    marginTop: spacing.base,
    ...shadows.card,
  },
  photoBand: {
    height: 120,
    backgroundColor: '#8a9874', // visible if the image fails to load
  },
  photo: { flex: 1, position: 'relative' },
  sun: { position: 'absolute' },
  timeChip: {
    position: 'absolute', top: 10, left: 12,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  timeChipDot: { width: 6, height: 6, borderRadius: 3 },
  timeChipText: {
    color: '#fff', fontSize: 11, fontWeight: '600',
    letterSpacing: 0.5,
    fontFamily: 'Menlo', // monospace; falls back to system mono
  },

  content: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14 },
  contentRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  dateLine: { fontSize: 13, color: colors.textMuted, fontWeight: '500' },
  greeting: {
    fontSize: 20, fontWeight: '700', color: colors.text,
    letterSpacing: -0.2, marginTop: 2,
  },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
    borderWidth: 1, flexShrink: 0,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },

  weatherStrip: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, gap: 4 },
  cell: { flex: 1, alignItems: 'center', gap: 2 },
  cellValue: {
    fontSize: 17, fontWeight: '700', color: colors.text,
    lineHeight: 17, marginTop: 4,
  },
  cellLabel: {
    fontSize: 10, fontWeight: '600', color: colors.textMuted,
    letterSpacing: 0.3, textTransform: 'uppercase',
  },
});
