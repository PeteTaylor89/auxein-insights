// screens/VisitorsScreen.js — "Who's on site" unified register.
// Pulls from siteService.listActive (backend GET /site/active) which combines
// active visitor visits + active contractor movements into one list.
// Tap a row -> bottom-sheet with details + Sign-out CTA branching on row.type:
//   - visitor    -> visitorService.signOut(visit.id)
//   - contractor -> contractorService.checkOut(movement.id, { movement_id })
import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  TouchableOpacity, Modal, StatusBar, Alert, Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, fontSize, radius, shadows } from '../styles/theme';
import { siteService, visitorService, contractorService } from '../api/services';
import { SkeletonCard, useToast } from '../components';

const FILTERS = [
  { key: 'all',         label: 'All' },
  { key: 'visitor',     label: 'Visitors' },
  { key: 'contractor',  label: 'Contractors' },
];

const formatDuration = (mins) => {
  if (mins == null) return '';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
};

const formatTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' });
};

const initialsOf = (name) => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || '?';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
};

export default function VisitorsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [data, setData] = useState({ total: 0, visitors_count: 0, contractors_count: 0, items: [] });
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [signingOut, setSigningOut] = useState(false);

  const loadActive = useCallback(async () => {
    setLoading(true);
    try {
      const res = await siteService.listActive();
      setData({
        total: res?.total ?? 0,
        visitors_count: res?.visitors_count ?? 0,
        contractors_count: res?.contractors_count ?? 0,
        items: Array.isArray(res?.items) ? res.items : [],
      });
    } catch (err) {
      console.log('On-site load failed:', err.message);
      toast.show('Could not load on-site list', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useFocusEffect(useCallback(() => { loadActive(); }, [loadActive]));

  const filteredItems = filter === 'all'
    ? data.items
    : data.items.filter(i => i.type === filter);

  const overdueCount = data.items.filter(i => i.is_overdue).length;

  const confirmSignOut = (item) => {
    const verb = item.type === 'contractor' ? 'Check out' : 'Sign out';
    Alert.alert(
      `${verb} ${item.type}?`,
      `${verb} ${item.name || `this ${item.type}`} now?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: verb, style: 'destructive', onPress: () => doSignOut(item) },
      ],
    );
  };

  const doSignOut = async (item) => {
    setSigningOut(true);
    try {
      if (item.type === 'visitor') {
        await visitorService.signOut(item.id);
        toast.show('Visitor signed out', 'success');
      } else if (item.type === 'contractor') {
        // Body requires movement_id; other fields stay as-set during check-in.
        // Pass current values so we don't blank them.
        await contractorService.checkOut(item.id, {
          movement_id: item.id,
          equipment_cleaned: !!item.equipment_cleaned,
        });
        toast.show('Contractor checked out', 'success');
      }
      setSelected(null);
      await loadActive();
    } catch (err) {
      console.log('Sign-out failed:', err.message);
      toast.show(err.response?.data?.detail || 'Sign-out failed', 'error');
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <SafeAreaView edges={['top']} style={styles.headerSafe}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={10}
            style={styles.backBtn}
          >
            <Feather name="chevron-left" size={24} color={colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Who's on site</Text>
          <View style={styles.backBtn} />
        </View>
      </SafeAreaView>

      {/* Stat strip */}
      <View style={styles.statBar}>
        <View style={styles.statItem}>
          <Feather name="users" size={16} color={colors.primary} />
          <Text style={styles.statValue}>{data.total}</Text>
          <Text style={styles.statLabel}>total</Text>
        </View>
        <View style={styles.statItem}>
          <Feather name="user" size={16} color={colors.textMuted} />
          <Text style={styles.statValue}>{data.visitors_count}</Text>
          <Text style={styles.statLabel}>visitors</Text>
        </View>
        <View style={styles.statItem}>
          <Feather name="tool" size={16} color={colors.textMuted} />
          <Text style={styles.statValue}>{data.contractors_count}</Text>
          <Text style={styles.statLabel}>contractors</Text>
        </View>
        {overdueCount > 0 && (
          <View style={styles.statItem}>
            <Feather name="clock" size={16} color={colors.danger} />
            <Text style={[styles.statValue, { color: colors.danger }]}>{overdueCount}</Text>
            <Text style={styles.statLabel}>overdue</Text>
          </View>
        )}
      </View>

      {/* Filter pills */}
      <View style={styles.filterBar}>
        {FILTERS.map(f => {
          const active = filter === f.key;
          const count = f.key === 'all'
            ? data.total
            : f.key === 'visitor' ? data.visitors_count : data.contractors_count;
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.pill, active && styles.pillActive]}
              onPress={() => setFilter(f.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.pillText, active && styles.pillTextActive]}>
                {f.label} · {count}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={loadActive}
            tintColor={colors.primary}
            progressViewOffset={8}
          />
        }
      >
        {loading && data.items.length === 0 ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : filteredItems.length === 0 ? (
          <View style={styles.emptyCard}>
            <Feather name="user-x" size={28} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>
              {filter === 'all' ? 'Nobody on site' : `No ${filter}s on site`}
            </Text>
            <Text style={styles.emptyText}>
              {filter === 'contractor'
                ? 'Contractors appear here when they check in via the mobile app.'
                : 'Use Log → Visitor on Home to sign someone in.'}
            </Text>
          </View>
        ) : (
          filteredItems.map(item => (
            <OnSiteRow key={`${item.type}-${item.id}`} item={item} onPress={() => setSelected(item)} />
          ))
        )}

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Detail bottom sheet */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSelected(null)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.modalSheet, { paddingBottom: spacing.lg + insets.bottom }]}
          >
            <View style={styles.modalHandle} />
            {selected && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.modalTopRow}>
                  <Text style={styles.modalName}>{selected.name}</Text>
                  <View style={[
                    styles.typeChip,
                    selected.type === 'contractor' && styles.typeChipContractor,
                  ]}>
                    <Feather
                      name={selected.type === 'contractor' ? 'tool' : 'user'}
                      size={11}
                      color={selected.type === 'contractor' ? colors.warning : colors.primary}
                    />
                    <Text style={[
                      styles.typeChipText,
                      selected.type === 'contractor' && { color: colors.warning },
                    ]}>
                      {selected.type === 'contractor' ? 'Contractor' : 'Visitor'}
                    </Text>
                  </View>
                </View>
                {!!selected.sub_label && (
                  <Text style={styles.modalSub}>{selected.sub_label}</Text>
                )}

                <DetailRow icon="briefcase" label="Purpose" value={selected.purpose} />
                {selected.type === 'visitor' && (
                  <DetailRow icon="user" label="Host" value={selected.host?.name} />
                )}
                <DetailRow
                  icon="clock"
                  label="Signed in"
                  value={`${formatTime(selected.signed_in_at)} · ${formatDuration(selected.duration_mins)} ago`}
                  alert={selected.is_overdue}
                  alertText={selected.is_overdue ? 'Overdue' : null}
                />
                {selected.phone && (
                  <DetailRow
                    icon="phone"
                    label="Phone"
                    value={selected.phone}
                    onPress={() => Linking.openURL(`tel:${selected.phone}`)}
                  />
                )}
                {selected.vehicle_registration && (
                  <DetailRow icon="truck" label="Vehicle" value={selected.vehicle_registration} />
                )}

                {selected.type === 'contractor' && (
                  <>
                    <View style={[
                      styles.indCard,
                      selected.biosecurity_risk_level === 'high' && { backgroundColor: colors.warningBg },
                      selected.biosecurity_risk_level === 'critical' && { backgroundColor: colors.dangerBg },
                    ]}>
                      <Feather
                        name={selected.equipment_cleaned ? 'check-circle' : 'alert-triangle'}
                        size={16}
                        color={selected.equipment_cleaned ? colors.success : colors.warning}
                      />
                      <Text style={styles.indText}>
                        Biosecurity: {selected.biosecurity_risk_level || 'low'}
                        {selected.equipment_cleaned ? ' · equipment cleaned' : ' · equipment not cleaned'}
                      </Text>
                    </View>
                    {selected.self_checked_in && (
                      <Text style={styles.selfNote}>Self-checked in via mobile app</Text>
                    )}
                  </>
                )}

                {selected.type === 'visitor' && (
                  <View style={styles.indCard}>
                    <Feather
                      name={selected.induction_completed ? 'check-circle' : 'alert-triangle'}
                      size={16}
                      color={selected.induction_completed ? colors.success : colors.warning}
                    />
                    <Text style={styles.indText}>
                      {selected.induction_completed ? 'Induction completed' : 'Induction not completed'}
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.signOutBtn, signingOut && { opacity: 0.6 }]}
                  onPress={() => confirmSignOut(selected)}
                  disabled={signingOut}
                  activeOpacity={0.85}
                >
                  <Feather name="log-out" size={18} color={colors.white} />
                  <Text style={styles.signOutText}>
                    {signingOut
                      ? (selected.type === 'contractor' ? 'Checking out…' : 'Signing out…')
                      : (selected.type === 'contractor' ? 'Check out' : 'Sign out')}
                  </Text>
                </TouchableOpacity>

                <View style={{ height: spacing.xl }} />
              </ScrollView>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function OnSiteRow({ item, onPress }) {
  const isContractor = item.type === 'contractor';
  const subtitle = [item.sub_label, item.purpose].filter(Boolean).join(' · ');
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.75}>
      <View style={[
        styles.avatar,
        isContractor && { backgroundColor: colors.warning + '20' },
        item.is_overdue && { backgroundColor: colors.dangerBg },
      ]}>
        <Text style={[
          styles.avatarText,
          isContractor && { color: colors.warning },
          item.is_overdue && { color: colors.danger },
        ]}>
          {initialsOf(item.name)}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.rowTopLine}>
          <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
          <View style={[
            styles.typeChipSmall,
            isContractor && styles.typeChipContractor,
          ]}>
            <Text style={[
              styles.typeChipSmallText,
              isContractor && { color: colors.warning },
            ]}>
              {isContractor ? 'Contractor' : 'Visitor'}
            </Text>
          </View>
        </View>
        {!!subtitle && <Text style={styles.rowMeta} numberOfLines={1}>{subtitle}</Text>}
        <View style={styles.rowFooter}>
          <Feather name="clock" size={11} color={item.is_overdue ? colors.danger : colors.textMuted} />
          <Text style={[styles.rowTime, item.is_overdue && { color: colors.danger, fontWeight: '600' }]}>
            On site {formatDuration(item.duration_mins)}
            {item.is_overdue ? ' · overdue' : ''}
          </Text>
          {item.type === 'visitor' && item.host?.name && (
            <>
              <Text style={styles.rowDot}>·</Text>
              <Feather name="user" size={11} color={colors.textMuted} />
              <Text style={styles.rowTime} numberOfLines={1}>{item.host.name}</Text>
            </>
          )}
        </View>
      </View>
      <Feather name="chevron-right" size={20} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

function DetailRow({ icon, label, value, alert, alertText, onPress }) {
  if (!value) return null;
  const Container = onPress ? TouchableOpacity : View;
  return (
    <Container style={styles.detailRow} onPress={onPress} activeOpacity={0.7}>
      <Feather name={icon} size={16} color={alert ? colors.danger : colors.textMuted} style={{ width: 20 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={[styles.detailValue, alert && { color: colors.danger, fontWeight: '600' }]}>
          {value}
          {alertText && <Text style={styles.detailAlert}>  {alertText}</Text>}
        </Text>
      </View>
      {onPress && <Feather name="chevron-right" size={16} color={colors.textMuted} />}
    </Container>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  headerSafe: { backgroundColor: colors.primary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    color: colors.white, fontSize: fontSize.lg, fontWeight: '700', letterSpacing: 0.3,
  },

  statBar: {
    flexDirection: 'row', gap: spacing.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statValue: { fontSize: fontSize.base, fontWeight: '700', color: colors.text },
  statLabel: { fontSize: fontSize.sm, color: colors.textMuted },

  filterBar: {
    flexDirection: 'row', gap: spacing.sm,
    paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  pill: {
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { fontSize: fontSize.xs, fontWeight: '600', color: colors.textMuted },
  pillTextActive: { color: colors.white },

  scroll: { flex: 1 },
  scrollContent: { padding: spacing.base, paddingBottom: spacing.xl },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary + '18',
  },
  avatarText: { fontSize: fontSize.base, fontWeight: '700', color: colors.primary },
  rowTopLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowName: { flex: 1, fontSize: fontSize.base, fontWeight: '600', color: colors.text },
  rowMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  rowFooter: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  rowTime: { fontSize: fontSize.xs, color: colors.textMuted },
  rowDot: { fontSize: fontSize.xs, color: colors.textMuted, marginHorizontal: 2 },

  typeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.primary + '18',
  },
  typeChipContractor: { backgroundColor: colors.warning + '20' },
  typeChipText: { fontSize: 10, fontWeight: '700', color: colors.primary, letterSpacing: 0.4 },
  typeChipSmall: {
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: colors.primary + '18',
  },
  typeChipSmallText: { fontSize: 9, fontWeight: '700', color: colors.primary, letterSpacing: 0.4 },

  emptyCard: {
    alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.xl, borderWidth: 1, borderColor: colors.border,
    marginTop: spacing.xl,
  },
  emptyTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  emptyText: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    maxHeight: '85%',
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border,
    alignSelf: 'center', marginBottom: spacing.md,
  },
  modalTopRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    justifyContent: 'space-between',
  },
  modalName: { flex: 1, fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
  modalSub: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2, marginBottom: spacing.md },

  detailRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.borderLight,
  },
  detailLabel: { fontSize: fontSize.xs, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  detailValue: { fontSize: fontSize.base, color: colors.text, marginTop: 2 },
  detailAlert: { color: colors.danger, fontWeight: '600', fontSize: fontSize.xs },

  indCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.borderLight, borderRadius: radius.md,
    padding: spacing.sm, marginTop: spacing.md,
  },
  indText: { fontSize: fontSize.sm, color: colors.text, flex: 1 },
  selfNote: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.xs, fontStyle: 'italic' },

  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.danger, borderRadius: radius.md,
    paddingVertical: spacing.md, marginTop: spacing.lg,
    ...shadows.card,
  },
  signOutText: { color: colors.white, fontSize: fontSize.md, fontWeight: '700' },
});
