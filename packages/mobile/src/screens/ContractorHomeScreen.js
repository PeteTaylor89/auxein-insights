// screens/ContractorHomeScreen.js — Mobile home for contractor accounts.
// Structurally lighter than the company-user HomeScreen: no ConditionsHero, no
// stat tiles, no property switcher. The contractor's day pivots around the
// active check-in card and the FAB.
//
// FAB lock (decided 2026-05-18):
//   Task | Observation | Incident | Visit (=ContractorMovement check-in)
//   - No Risk (contractor cannot create risks)
//   - No Visitor (contractor cannot log other visitors)
//
// Live data + check-in screen land in later sprints:
//   - Today's tasks: Sprint 2.5 (needs /contractors/me/assignments)
//   - Active check-in card + Visit FAB target: Sprint 3.4 (CheckInScreen)
import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  TouchableOpacity, StatusBar, Image, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { colors, spacing, fontSize, radius, shadows } from '../styles/theme';
import { notificationService, contractorService } from '../api/services';
import { useToast } from '../components';

const LOGO_MARK = require('../../assets/brand/logo-mark.png');

export default function ContractorHomeScreen({ navigation }) {
  const { user } = useAuth();
  const toast = useToast();
  const displayName =
    user?.contact_person ||
    user?.business_name ||
    user?.email?.split('@')?.[0] ||
    'there';

  const [loading, setLoading] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeCheckIn, setActiveCheckIn] = useState(null);
  const [signingOut, setSigningOut] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [unread, movements] = await Promise.all([
        notificationService.getUnreadCount().catch(() => null),
        contractorService.listMyRecentCheckIns(5).catch(() => []),
      ]);
      setUnreadCount(unread?.count ?? 0);
      const active = (Array.isArray(movements) ? movements : [])
        .find(m => !m.departure_datetime);
      setActiveCheckIn(active || null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const confirmSignOut = () => {
    if (!activeCheckIn) return;
    Alert.alert(
      'Sign out?',
      `End your visit to ${activeCheckIn.company_name} now?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            setSigningOut(true);
            try {
              await contractorService.checkOut(activeCheckIn.id, {
                movement_id: activeCheckIn.id,
              });
              toast.show('Signed out', 'success');
              loadData();
            } catch (err) {
              const detail = err.response?.data?.detail;
              toast.show(typeof detail === 'string' ? detail : 'Could not sign out', 'error');
            } finally {
              setSigningOut(false);
            }
          },
        },
      ],
    );
  };


  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Brand header */}
      <SafeAreaView edges={['top']} style={styles.headerSafe}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <Image source={LOGO_MARK} style={styles.brandMark} resizeMode="contain" />
            <Text style={styles.brandWordmark}>Auxein Grow</Text>
          </View>
          <TouchableOpacity
            style={styles.bellBtn}
            onPress={() => navigation.navigate('Profile', { screen: 'Notifications' })}
            hitSlop={10}
          >
            <Feather name="bell" size={20} color={colors.white} />
            {unreadCount > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={loadData}
            tintColor={colors.primary}
            progressViewOffset={8}
          />
        }
      >
        {/* Check-in card — reflects active ContractorMovement state. */}
        {activeCheckIn ? (
          <View style={[styles.checkInCard, styles.checkInCardActive]}>
            <View style={[styles.checkInIconWrap, { backgroundColor: colors.success + '18' }]}>
              <Feather name="check-circle" size={22} color={colors.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.checkInTitle}>On site</Text>
              <Text style={styles.checkInBody} numberOfLines={1}>
                {activeCheckIn.company_name}
                {activeCheckIn.property_name ? ` · ${activeCheckIn.property_name}` : ''}
                {activeCheckIn.purpose ? ` · ${activeCheckIn.purpose}` : ''}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.checkInBtn, { backgroundColor: colors.accent }]}
              onPress={confirmSignOut}
              disabled={signingOut}
              activeOpacity={0.85}
            >
              <Text style={styles.checkInBtnText}>
                {signingOut ? '…' : 'Sign out'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.checkInCard}>
            <View style={styles.checkInIconWrap}>
              <Feather name="map-pin" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.checkInTitle}>Not checked in</Text>
              <Text style={styles.checkInBody}>
                Sign in to a property when you arrive on site.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.checkInBtn}
              onPress={() => navigation.navigate('CheckIn')}
              activeOpacity={0.85}
            >
              <Text style={styles.checkInBtnText}>Sign in</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Today's work — empty state until Sprint 2.5 wires the contractor
            assignments fetch. */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Today</Text>
          </View>
          <View style={styles.emptyCard}>
            <Feather name="check-circle" size={22} color={colors.success} />
            <Text style={styles.emptyText}>
              No assignments yet — your scheduled work will appear here.
            </Text>
          </View>
        </View>

        <View style={{ height: 96 }} />
      </ScrollView>

      {/* Log FAB */}
      {fabOpen && (
        <TouchableOpacity
          style={styles.fabBackdrop}
          activeOpacity={1}
          onPress={() => setFabOpen(false)}
        />
      )}
      <View style={[styles.fabStack, { bottom: spacing.lg + insets.bottom }]} pointerEvents="box-none">
        {fabOpen && (
          <>
            <FabOption
              icon="map-pin"
              label="Visit"
              color={colors.primary}
              onPress={() => { setFabOpen(false); navigation.navigate('CheckIn'); }}
            />
            <FabOption
              icon="alert-octagon"
              label="Incident"
              color={colors.danger}
              onPress={() => { setFabOpen(false); navigation.navigate('ContractorCreateIncident'); }}
            />
            <FabOption
              icon="search"
              label="Observation"
              color={colors.success}
              onPress={() => { setFabOpen(false); navigation.navigate('ContractorCreateObservation'); }}
            />
            <FabOption
              icon="clipboard"
              label="Task"
              color={colors.primary}
              onPress={() => { setFabOpen(false); navigation.navigate('CreateContractorAssignment'); }}
            />
          </>
        )}
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setFabOpen(!fabOpen)}
          activeOpacity={0.85}
        >
          <Feather name={fabOpen ? 'x' : 'plus'} size={24} color={colors.white} />
          {!fabOpen && <Text style={styles.fabText}>Log</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function FabOption({ icon, label, color, onPress }) {
  return (
    <TouchableOpacity style={styles.fabOption} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.fabOptionLabel}>
        <Text style={styles.fabOptionText}>{label}</Text>
      </View>
      <View style={[styles.fabOptionIcon, { backgroundColor: color }]}>
        <Feather name={icon} size={18} color={colors.white} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // Header (matches HomeScreen so the brand bar is consistent across roles)
  headerSafe: { backgroundColor: colors.primary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  brandMark: { width: 28, height: 28 },
  brandWordmark: {
    color: colors.white, fontSize: fontSize.lg, fontWeight: '700',
    letterSpacing: 0.3,
  },
  bellBtn: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  bellBadge: {
    position: 'absolute', top: -4, right: -4,
    backgroundColor: colors.danger, borderRadius: 10,
    paddingHorizontal: 5, paddingVertical: 1, minWidth: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.primary,
  },
  bellBadgeText: { color: colors.white, fontSize: 10, fontWeight: '700' },

  scroll: { flex: 1 },
  scrollContent: { paddingTop: spacing.base, paddingBottom: spacing.xl },

  // Check-in card
  checkInCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface,
    marginHorizontal: spacing.base,
    padding: spacing.base,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    borderLeftWidth: 3, borderLeftColor: colors.primary,
  },
  checkInCardActive: {
    borderLeftColor: colors.success,
    backgroundColor: colors.successBg,
    borderColor: colors.successBorder,
  },
  checkInIconWrap: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: colors.primary + '18',
    alignItems: 'center', justifyContent: 'center',
  },
  checkInTitle: { fontSize: fontSize.base, fontWeight: '600', color: colors.text },
  checkInBody: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  checkInBtn: {
    paddingHorizontal: spacing.md, paddingVertical: 10,
    backgroundColor: colors.primary, borderRadius: radius.pill,
  },
  checkInBtnText: { color: colors.white, fontWeight: '700', fontSize: fontSize.sm },

  // Sections
  section: { paddingHorizontal: spacing.base, marginTop: spacing.lg },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text },

  // Empty card (matches HomeScreen styling)
  emptyCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.successBg, borderRadius: radius.lg,
    padding: spacing.base, borderWidth: 1, borderColor: colors.successBorder,
  },
  emptyText: { fontSize: fontSize.sm, color: colors.text, fontWeight: '500', flex: 1 },

  // FAB (matches HomeScreen styling)
  fabBackdrop: {
    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  fabStack: {
    position: 'absolute', bottom: spacing.lg, right: spacing.lg,
    alignItems: 'flex-end', gap: spacing.sm,
  },
  fab: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    backgroundColor: colors.primary, borderRadius: radius.pill,
    ...shadows.elevated,
  },
  fabText: { color: colors.white, fontSize: fontSize.md, fontWeight: '700' },
  fabOption: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fabOptionLabel: {
    backgroundColor: colors.surface, paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: radius.md, ...shadows.card,
  },
  fabOptionText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  fabOptionIcon: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', ...shadows.card,
  },
});
