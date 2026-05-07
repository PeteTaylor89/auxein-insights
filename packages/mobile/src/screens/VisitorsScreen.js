// screens/VisitorsScreen.js — "Who's on site" active-visits list with sign-out.
// Pulls from visitorService.listActive (backend GET /visitors/visits/active).
// Tap a row -> bottom-sheet with visitor + host + emergency detail and a Sign-out CTA.
import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  TouchableOpacity, Modal, StatusBar, Alert, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, fontSize, radius, shadows } from '../styles/theme';
import { visitorService } from '../api/services';
import { SkeletonCard, useToast } from '../components';

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

export default function VisitorsScreen({ navigation }) {
  const toast = useToast();
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [signingOut, setSigningOut] = useState(false);

  const loadVisits = useCallback(async () => {
    setLoading(true);
    try {
      const data = await visitorService.listActive();
      setVisits(Array.isArray(data) ? data : []);
    } catch (err) {
      console.log('Active visits load failed:', err.message);
      toast.show('Could not load visitors', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useFocusEffect(useCallback(() => { loadVisits(); }, [loadVisits]));

  const confirmSignOut = (visit) => {
    const name = `${visit.visitor?.first_name || ''} ${visit.visitor?.last_name || ''}`.trim() || 'this visitor';
    Alert.alert(
      'Sign out visitor?',
      `Sign ${name} out of the site now?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: () => doSignOut(visit) },
      ],
    );
  };

  const doSignOut = async (visit) => {
    setSigningOut(true);
    try {
      await visitorService.signOut(visit.id);
      toast.show('Visitor signed out', 'success');
      setSelected(null);
      await loadVisits();
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
          <Text style={styles.statValue}>{visits.length}</Text>
          <Text style={styles.statLabel}>active</Text>
        </View>
        {visits.some(v => v.is_overdue) && (
          <View style={styles.statItem}>
            <Feather name="clock" size={16} color={colors.danger} />
            <Text style={[styles.statValue, { color: colors.danger }]}>
              {visits.filter(v => v.is_overdue).length}
            </Text>
            <Text style={styles.statLabel}>overdue</Text>
          </View>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={loadVisits}
            tintColor={colors.primary}
            progressViewOffset={8}
          />
        }
      >
        {loading && visits.length === 0 ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : visits.length === 0 ? (
          <View style={styles.emptyCard}>
            <Feather name="user-x" size={28} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>Nobody on site</Text>
            <Text style={styles.emptyText}>
              Use Log → Visitor on Home to sign someone in.
            </Text>
          </View>
        ) : (
          visits.map(v => <VisitorRow key={v.id} visit={v} onPress={() => setSelected(v)} />)
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
          <TouchableOpacity activeOpacity={1} style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            {selected && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.modalName}>
                  {selected.visitor?.first_name} {selected.visitor?.last_name}
                </Text>
                {selected.visitor?.company_representing && (
                  <Text style={styles.modalSub}>{selected.visitor.company_representing}</Text>
                )}

                <DetailRow icon="briefcase" label="Purpose" value={selected.purpose} />
                <DetailRow icon="user" label="Host" value={selected.host?.full_name} />
                <DetailRow
                  icon="clock"
                  label="Signed in"
                  value={`${formatTime(selected.signed_in_at)} · ${formatDuration(selected.visit_duration_minutes)} ago`}
                  alert={selected.is_overdue}
                  alertText={selected.is_overdue ? 'Overdue' : null}
                />
                {selected.visitor?.phone && (
                  <DetailRow
                    icon="phone"
                    label="Phone"
                    value={selected.visitor.phone}
                    onPress={() => Linking.openURL(`tel:${selected.visitor.phone}`)}
                  />
                )}
                {selected.visitor?.vehicle_registration && (
                  <DetailRow icon="truck" label="Vehicle" value={selected.visitor.vehicle_registration} />
                )}
                {selected.visitor?.emergency_contact_name && (
                  <DetailRow
                    icon="alert-circle"
                    label="Emergency"
                    value={`${selected.visitor.emergency_contact_name}${selected.visitor.emergency_contact_phone ? ' · ' + selected.visitor.emergency_contact_phone : ''}`}
                    onPress={selected.visitor.emergency_contact_phone
                      ? () => Linking.openURL(`tel:${selected.visitor.emergency_contact_phone}`)
                      : undefined}
                  />
                )}
                {Array.isArray(selected.ppe_provided) && selected.ppe_provided.length > 0 && (
                  <DetailRow icon="shield" label="PPE" value={selected.ppe_provided.join(', ')} />
                )}

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

                <TouchableOpacity
                  style={[styles.signOutBtn, signingOut && { opacity: 0.6 }]}
                  onPress={() => confirmSignOut(selected)}
                  disabled={signingOut}
                  activeOpacity={0.85}
                >
                  <Feather name="log-out" size={18} color={colors.white} />
                  <Text style={styles.signOutText}>
                    {signingOut ? 'Signing out…' : 'Sign out'}
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

function VisitorRow({ visit, onPress }) {
  const name = `${visit.visitor?.first_name || ''} ${visit.visitor?.last_name || ''}`.trim() || 'Unknown visitor';
  const subtitle = [
    visit.visitor?.company_representing,
    visit.purpose,
  ].filter(Boolean).join(' · ');
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.avatar, visit.is_overdue && { backgroundColor: colors.dangerBg }]}>
        <Text style={[styles.avatarText, visit.is_overdue && { color: colors.danger }]}>
          {(visit.visitor?.first_name?.[0] || '?').toUpperCase()}
          {(visit.visitor?.last_name?.[0] || '').toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowName} numberOfLines={1}>{name}</Text>
        {!!subtitle && <Text style={styles.rowMeta} numberOfLines={1}>{subtitle}</Text>}
        <View style={styles.rowFooter}>
          <Feather name="clock" size={11} color={visit.is_overdue ? colors.danger : colors.textMuted} />
          <Text style={[styles.rowTime, visit.is_overdue && { color: colors.danger, fontWeight: '600' }]}>
            On site {formatDuration(visit.visit_duration_minutes)}
            {visit.is_overdue ? ' · overdue' : ''}
          </Text>
          {visit.host?.full_name && (
            <>
              <Text style={styles.rowDot}>·</Text>
              <Feather name="user" size={11} color={colors.textMuted} />
              <Text style={styles.rowTime} numberOfLines={1}>
                {visit.host.full_name}
              </Text>
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
  rowName: { fontSize: fontSize.base, fontWeight: '600', color: colors.text },
  rowMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  rowFooter: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  rowTime: { fontSize: fontSize.xs, color: colors.textMuted },
  rowDot: { fontSize: fontSize.xs, color: colors.textMuted, marginHorizontal: 2 },

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
    padding: spacing.lg, paddingTop: spacing.md, maxHeight: '85%',
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border,
    alignSelf: 'center', marginBottom: spacing.md,
  },
  modalName: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
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
  indText: { fontSize: fontSize.sm, color: colors.text },

  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.danger, borderRadius: radius.md,
    paddingVertical: spacing.md, marginTop: spacing.lg,
    ...shadows.card,
  },
  signOutText: { color: colors.white, fontSize: fontSize.md, fontWeight: '700' },
});
