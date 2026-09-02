// screens/SiteSignOnScreen.js — sign on and off a property.
//
// The home screen of the general_user account, and the reason the account
// exists: oversight of who is on site. That only works if people actually use
// it, so the entire screen is bent toward ONE TAP.
//
//   * The property list arrives with the status in a single request, ordered
//     most-recently-used first, so the top button is almost always the right
//     one.
//   * A GPS fix is attempted but never waited on. A sign-on that fails because
//     the phone was under canopy is a sign-on that did not happen.
//   * Sign-on and sign-off queue offline. The gateway with no signal is exactly
//     where this gets used.
//   * The screen renders from cache while it refreshes, so opening it never
//     shows a spinner where a button should be.
//
// It is also the H&S launchpad, because a general_user has nowhere else to go:
// report a hazard, sign a visitor in, look at the map.
import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  ActivityIndicator, StatusBar, Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import { siteAttendanceService } from '../api/services';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components';
import { colors, spacing, fontSize, radius, shadows } from '../styles/theme';

const fmtTime = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
};

/** "3h 20m", or "18m". Reads better than a decimal on a shift. */
const fmtDuration = (minutes) => {
  if (minutes === null || minutes === undefined) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export default function SiteSignOnScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user } = useAuth();

  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      setStatus(await siteAttendanceService.getStatus());
    } catch (err) {
      console.log('[SignOn] status failed:', err?.message);
      // Deliberately not fatal: an offline phone still has to be able to TRY to
      // sign on, and the write queue will carry it.
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load({ quiet: !!status }); }, [load]));
  useEffect(() => { load(); }, [load]);

  /**
   * A location fix, or null. Never blocks for long: two seconds is already
   * longer than anyone will stand still at a gate, and the sign-on matters far
   * more than the coordinates.
   */
  const quickFix = async () => {
    try {
      const { status: perm } = await Location.getForegroundPermissionsAsync();
      if (perm !== 'granted') return null;
      const loc = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise((resolve) => setTimeout(() => resolve(null), 2000)),
      ]);
      if (!loc) return null;
      return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
    } catch {
      return null;
    }
  };

  const doSignIn = async (property, { switchFrom = false } = {}) => {
    setBusy(true);
    try {
      const fix = await quickFix();
      await siteAttendanceService.signIn({
        propertyId: property.id,
        latitude: fix?.latitude,
        longitude: fix?.longitude,
        switchFrom,
      });
      toast.show(`Signed on at ${property.name}`, 'success');
      await load({ quiet: true });
    } catch (err) {
      // 409 means they are already on somewhere else. Offer the move rather
      // than making them find the sign-off button first.
      if (err?.response?.status === 409 && !switchFrom) {
        Alert.alert(
          'Already signed on',
          `${err.response.data?.detail || 'You are signed on somewhere else.'}`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: `Move to ${property.name}`,
              onPress: () => doSignIn(property, { switchFrom: true }),
            },
          ],
        );
      } else {
        const detail = err?.response?.data?.detail;
        toast.show(typeof detail === 'string' ? detail : 'Could not sign on', 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  const doSignOut = async () => {
    setBusy(true);
    try {
      const fix = await quickFix();
      await siteAttendanceService.signOut({
        latitude: fix?.latitude,
        longitude: fix?.longitude,
      });
      toast.show('Signed off', 'success');
      await load({ quiet: true });
    } catch (err) {
      const detail = err?.response?.data?.detail;
      toast.show(typeof detail === 'string' ? detail : 'Could not sign off', 'error');
    } finally {
      setBusy(false);
    }
  };

  const current = status?.current || null;
  const properties = status?.properties || [];
  const firstName = (user?.first_name || '').trim();

  if (loading && !status) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={colors.headerObs} />
      <ScrollView
        contentContainerStyle={{ padding: spacing.base, paddingBottom: insets.bottom + spacing.xl }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />
        }
      >
        <Text style={styles.greeting}>
          {firstName ? `Hi ${firstName}` : 'Site sign-on'}
        </Text>

        {current ? (
          <View style={styles.onSiteCard}>
            <View style={styles.onSiteHeader}>
              <View style={styles.onSiteDot} />
              <Text style={styles.onSiteLabel}>On site</Text>
            </View>
            <Text style={styles.onSiteProperty}>{current.property_name || 'This property'}</Text>
            <Text style={styles.onSiteMeta}>
              Since {fmtTime(current.signed_in_at)}
              {current.minutes !== null && current.minutes !== undefined
                ? ` · ${fmtDuration(current.minutes)}`
                : ''}
            </Text>

            <TouchableOpacity
              style={[styles.primaryBtn, styles.signOffBtn, busy && styles.btnDisabled]}
              onPress={doSignOut}
              disabled={busy}
              activeOpacity={0.85}
            >
              {busy
                ? <ActivityIndicator color={colors.white} />
                : (
                  <>
                    <Feather name="log-out" size={18} color={colors.white} />
                    <Text style={styles.primaryBtnText}>Sign off</Text>
                  </>
                )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.offSiteCard}>
            <Text style={styles.offSiteTitle}>Not signed on</Text>
            <Text style={styles.offSiteBody}>
              Sign on when you arrive so everyone knows who is on the property.
            </Text>
          </View>
        )}

        {/* The property buttons. Ordered by the server: the one you used last
            is first, so the common case is a single tap. */}
        {properties.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {current ? 'Move to another property' : 'Sign on at'}
            </Text>
            {properties
              .filter(p => !current || p.id !== current.property_id)
              .map(p => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.propertyBtn, busy && styles.btnDisabled]}
                  onPress={() => doSignIn(p, { switchFrom: !!current })}
                  disabled={busy}
                  activeOpacity={0.8}
                >
                  <Feather name="map-pin" size={18} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.propertyName}>{p.name}</Text>
                    {p.on_site_count > 0 && (
                      <Text style={styles.propertyMeta}>
                        {p.on_site_count} {p.on_site_count === 1 ? 'person' : 'people'} on site
                      </Text>
                    )}
                  </View>
                  {p.is_recent && <Text style={styles.recentTag}>Last used</Text>}
                  <Feather name="chevron-right" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
          </View>
        ) : (
          <View style={styles.section}>
            {/* An empty list means genuinely no properties in scope, not a
                loading state — say so rather than showing nothing. */}
            <Text style={styles.emptyText}>
              No properties are assigned to you yet. Ask your manager to add one.
            </Text>
          </View>
        )}

        {/* Health and safety. A general_user has nowhere else to go, so the
            actions live here rather than behind another tab. */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Health &amp; safety</Text>
          <View style={styles.actionGrid}>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => navigation.navigate('CreateIncident')}
              activeOpacity={0.8}
            >
              <Feather name="alert-triangle" size={20} color={colors.danger} />
              <Text style={styles.actionText}>Report an incident</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => navigation.navigate('CreateVisitor')}
              activeOpacity={0.8}
            >
              <Feather name="user-plus" size={20} color={colors.primary} />
              <Text style={styles.actionText}>Sign in a visitor</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => navigation.navigate('CreateRisk')}
              activeOpacity={0.8}
            >
              <Feather name="shield" size={20} color={colors.warning} />
              <Text style={styles.actionText}>Report a hazard</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  greeting: {
    fontSize: fontSize.xl, fontWeight: '700', color: colors.text,
    marginBottom: spacing.base,
  },

  onSiteCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.base,
    borderWidth: 1, borderColor: colors.success + '55', marginBottom: spacing.base,
    ...shadows.card,
  },
  onSiteHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  onSiteDot: {
    width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success,
  },
  onSiteLabel: {
    fontSize: fontSize.xs, fontWeight: '700', color: colors.success,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  onSiteProperty: {
    fontSize: fontSize.xl, fontWeight: '700', color: colors.text,
    marginTop: spacing.sm,
  },
  onSiteMeta: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },

  offSiteCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.base,
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.base,
  },
  offSiteTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  offSiteBody: {
    fontSize: fontSize.sm, color: colors.textMuted, marginTop: 4, lineHeight: 20,
  },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, borderRadius: radius.md, paddingVertical: spacing.md,
    marginTop: spacing.base,
  },
  signOffBtn: { backgroundColor: colors.danger },
  primaryBtnText: { color: colors.white, fontSize: fontSize.base, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },

  section: { marginBottom: spacing.lg },
  sectionTitle: {
    fontSize: fontSize.sm, fontWeight: '700', color: colors.text,
    marginBottom: spacing.sm,
  },

  propertyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  propertyName: { fontSize: fontSize.base, fontWeight: '600', color: colors.text },
  propertyMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  recentTag: {
    fontSize: fontSize.xs, color: colors.primary, fontWeight: '600',
  },

  emptyText: {
    fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 20,
  },

  actionGrid: { gap: spacing.sm },
  actionCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
  },
  actionText: { fontSize: fontSize.base, fontWeight: '600', color: colors.text },
});
