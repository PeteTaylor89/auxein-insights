// components/OnSitePanel.js — who is on the property right now.
//
// The evacuation headcount, on the phone of the person standing at the gate.
// It used to be manager-only, which put the list everywhere except where it is
// needed: a manager in town knows the number, the people who have to walk to
// the muster point do not.
//
// Design notes:
//   * NAMES, not a count. "6 people on site" is useless at a muster point; six
//     names you can call out is the entire point.
//   * The reader is marked "You", because a list you cannot find yourself in
//     reads as a list that has not registered you.
//   * It renders whatever it last had while refreshing, and a failure leaves
//     the previous list up rather than blanking it. A register that goes empty
//     under bad signal is worse than one that is a minute stale, because empty
//     is indistinguishable from "nobody is here".
import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { siteAttendanceService } from '../api/services';
import { useAuth } from '../contexts/AuthContext';
import { colors, spacing, fontSize, radius, shadows } from '../styles/theme';

const fmtTime = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
};

/** "3h 20m", or "18m" — how a shift is actually spoken. */
const fmtDuration = (minutes) => {
  if (minutes === null || minutes === undefined) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const INITIAL_VISIBLE = 6;

export default function OnSitePanel({ propertyId = null, style }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await siteAttendanceService.whoIsOnSite(propertyId));
    } catch (err) {
      // Keep whatever is on screen. A 403 means the permission was taken away
      // again, and an empty list would claim the property is deserted.
      console.log('[OnSite] failed:', err?.message);
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  // Refetch on focus: people arrive and leave while the app is backgrounded,
  // and a stale headcount is the one thing this must not be.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading && !data) {
    return (
      <View style={[styles.card, style]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!data) return null;

  const people = data.people || [];
  const shown = expanded ? people : people.slice(0, INITIAL_VISIBLE);
  const hidden = people.length - shown.length;

  return (
    <View style={[styles.card, style]}>
      <View style={styles.head}>
        <Feather name="users" size={16} color={colors.primary} />
        <Text style={styles.title}>On site now</Text>
        <View style={styles.countPill}>
          <Text style={styles.countText}>{data.total}</Text>
        </View>
      </View>

      {people.length === 0 ? (
        <Text style={styles.empty}>Nobody is signed on right now.</Text>
      ) : (
        <>
          {shown.map((p) => {
            const isMe = user?.id != null && p.user_id === user.id;
            return (
              <View key={p.id} style={styles.row}>
                <View style={[styles.dot, isMe && styles.dotMe]} />
                <Text style={[styles.name, isMe && styles.nameMe]} numberOfLines={1}>
                  {p.user_name || 'Unnamed'}{isMe ? ' (you)' : ''}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {p.property_name ? `${p.property_name} · ` : ''}
                  {fmtTime(p.signed_in_at)}
                  {p.minutes !== null && p.minutes !== undefined ? ` · ${fmtDuration(p.minutes)}` : ''}
                </Text>
              </View>
            );
          })}

          {hidden > 0 && (
            <TouchableOpacity onPress={() => setExpanded(true)} activeOpacity={0.7}>
              <Text style={styles.more}>Show {hidden} more</Text>
            </TouchableOpacity>
          )}
          {expanded && people.length > INITIAL_VISIBLE && (
            <TouchableOpacity onPress={() => setExpanded(false)} activeOpacity={0.7}>
              <Text style={styles.more}>Show fewer</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.base,
    ...shadows.card,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  title: { flex: 1, fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  countPill: {
    minWidth: 26, paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: radius.pill, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  countText: { color: colors.white, fontWeight: '700', fontSize: fontSize.sm },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 6,
    borderTopWidth: 1, borderTopColor: colors.borderLight,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  dotMe: { backgroundColor: colors.primary },
  name: { flex: 1, fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  nameMe: { color: colors.primary },
  meta: { fontSize: fontSize.xs, color: colors.textMuted, maxWidth: '55%', textAlign: 'right' },

  empty: { fontSize: fontSize.sm, color: colors.textMuted },
  more: {
    fontSize: fontSize.sm, fontWeight: '600', color: colors.primary,
    paddingTop: spacing.sm,
  },
});
