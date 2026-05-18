// screens/ContractorProfileScreen.js — Contractor's self-service profile.
// 2.4b is read-only: shows everything the backend exposes via /me/profile +
// /me/movements + /me/insurance/docs. Edit modals + doc upload land in 2.4c/d.
import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { contractorService, notificationService } from '../api/services';
import { useToast } from '../components';
import { colors, spacing, fontSize, radius, shadows } from '../styles/theme';

const POLICY_LABEL = {
  public_liability: 'Public liability',
  professional_indemnity: 'Professional indemnity',
  workers_comp: 'Workers compensation',
  equipment_insurance: 'Equipment',
  vehicle_insurance: 'Vehicle',
  other: 'Other',
};

const INSURANCE_STATUS_STYLE = {
  compliant:     { bg: colors.success + '20', fg: colors.success, label: 'Compliant' },
  partial:       { bg: colors.warning + '20', fg: colors.warning, label: 'Partial' },
  non_compliant: { bg: colors.danger + '20',  fg: colors.danger,  label: 'Non-compliant' },
};

const RISK_STYLE = {
  low:    { bg: colors.success + '20', fg: colors.success, label: 'Low risk' },
  medium: { bg: colors.warning + '20', fg: colors.warning, label: 'Medium risk' },
  high:   { bg: colors.danger + '20',  fg: colors.danger,  label: 'High risk' },
};

const formatDate = (iso) => {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
};

const expiryPill = (iso) => {
  if (!iso) return { bg: colors.borderLight, fg: colors.textMuted, label: 'No expiry set' };
  const expiry = new Date(iso);
  const days = Math.floor((expiry - new Date()) / 86400000);
  if (days < 0) return { bg: colors.danger + '20', fg: colors.danger, label: `Expired ${formatDate(iso)}` };
  if (days <= 30) return { bg: colors.warning + '20', fg: colors.warning, label: `Expires ${formatDate(iso)}` };
  return { bg: colors.success + '20', fg: colors.success, label: `Expires ${formatDate(iso)}` };
};

const formatCurrency = (amount, currency = 'NZD') => {
  if (amount == null) return null;
  return `${currency} $${Number(amount).toLocaleString('en-NZ', { maximumFractionDigits: 0 })}`;
};

export default function ContractorProfileScreen() {
  const { user, logout } = useAuth();
  const navigation = useNavigation();
  const toast = useToast();

  const [profile, setProfile] = useState(null);
  const [movements, setMovements] = useState([]);
  const [docs, setDocs] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, m, d, n] = await Promise.all([
        contractorService.getMyProfile().catch(() => null),
        contractorService.listMyMovements(10).catch(() => []),
        contractorService.listMyInsuranceDocs().catch(() => []),
        notificationService.getUnreadCount().catch(() => null),
      ]);
      if (p) setProfile(p);
      setMovements(Array.isArray(m) ? m : []);
      setDocs(Array.isArray(d) ? d : []);
      setUnreadCount(n?.count ?? 0);
    } catch (err) {
      console.log('Contractor profile load failed:', err.message);
      toast.show('Could not load profile', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading && !profile) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const initial = (profile?.business_name?.[0] || profile?.contact_person?.[0] || user?.email?.[0] || '?').toUpperCase();
  const insStyle = INSURANCE_STATUS_STYLE[profile?.insurance_status] || INSURANCE_STATUS_STYLE.non_compliant;
  const riskStyle = RISK_STYLE[profile?.biosecurity_risk_level] || RISK_STYLE.medium;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}
    >
      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <Text style={styles.businessName}>{profile?.business_name || '—'}</Text>
        {profile?.contact_person && profile.contact_person !== profile.business_name && (
          <Text style={styles.contactPerson}>{profile.contact_person}</Text>
        )}
        <Text style={styles.email}>{profile?.email || user?.email}</Text>
        <View style={styles.heroPills}>
          <View style={[styles.pill, { backgroundColor: insStyle.bg }]}>
            <Feather name="shield" size={12} color={insStyle.fg} />
            <Text style={[styles.pillText, { color: insStyle.fg }]}>{insStyle.label}</Text>
          </View>
          {profile?.is_verified && (
            <View style={[styles.pill, { backgroundColor: colors.primary + '18' }]}>
              <Feather name="check-circle" size={12} color={colors.primary} />
              <Text style={[styles.pillText, { color: colors.primary }]}>
                Verified · {profile?.verification_level || 'basic'}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Notifications */}
      <TouchableOpacity style={styles.notifRow} onPress={() => navigation.navigate('Notifications')}>
        <Feather name="bell" size={20} color={colors.primary} />
        <Text style={styles.notifLabel}>Notifications</Text>
        {unreadCount > 0 && (
          <View style={styles.notifBadge}>
            <Text style={styles.notifBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
          </View>
        )}
        <Feather name="chevron-right" size={20} color={colors.textMuted} />
      </TouchableOpacity>

      {/* Contact info */}
      <Section
        icon="user"
        title="Contact details"
        onEdit={() => navigation.navigate('EditContractorProfile', { profile })}
      >
        <Row label="Business name" value={profile?.business_name} />
        <Row label="Contact person" value={profile?.contact_person} />
        <Row label="Email" value={profile?.email} />
        <Row label="Phone" value={profile?.phone} />
        <Row label="Mobile" value={profile?.mobile} />
        <Row label="Address" value={profile?.address} />
        <Row label="Business number" value={profile?.business_number} />
        <Row label="Type" value={profile?.contractor_type} />
        {profile?.specializations?.length > 0 && (
          <ChipRow label="Specialties" items={profile.specializations} />
        )}
      </Section>

      {/* Insurance policies */}
      <Section icon="shield" title="Insurance">
        <PolicyRow
          label={POLICY_LABEL.public_liability}
          insurer={profile?.public_liability_insurer}
          policyNumber={profile?.public_liability_policy_number}
          coverage={profile?.public_liability_coverage_amount}
          expiry={profile?.public_liability_expiry}
          onPress={() => navigation.navigate('EditContractorInsurance', { policyType: 'public_liability', profile })}
        />
        <PolicyRow
          label={POLICY_LABEL.professional_indemnity}
          insurer={profile?.professional_indemnity_insurer}
          policyNumber={profile?.professional_indemnity_policy_number}
          coverage={profile?.professional_indemnity_coverage_amount}
          expiry={profile?.professional_indemnity_expiry}
          onPress={() => navigation.navigate('EditContractorInsurance', { policyType: 'professional_indemnity', profile })}
        />
        {profile?.workers_comp_required ? (
          <PolicyRow
            label={POLICY_LABEL.workers_comp}
            insurer={profile?.workers_comp_insurer}
            policyNumber={profile?.workers_comp_policy_number}
            expiry={profile?.workers_comp_expiry}
            onPress={() => navigation.navigate('EditContractorInsurance', { policyType: 'workers_comp', profile })}
          />
        ) : (
          <TouchableOpacity
            style={styles.policyMutedRow}
            onPress={() => navigation.navigate('EditContractorInsurance', { policyType: 'workers_comp', profile })}
            activeOpacity={0.7}
          >
            <Text style={styles.policyLabel}>{POLICY_LABEL.workers_comp}</Text>
            <Text style={styles.policyMutedText}>Not required · tap to change</Text>
          </TouchableOpacity>
        )}
        <PolicyRow
          label={POLICY_LABEL.equipment_insurance}
          insurer={profile?.equipment_insurance_insurer}
          coverage={profile?.equipment_insurance_coverage_amount}
          expiry={profile?.equipment_insurance_expiry}
          onPress={() => navigation.navigate('EditContractorInsurance', { policyType: 'equipment_insurance', profile })}
        />
        <PolicyRow
          label={POLICY_LABEL.vehicle_insurance}
          insurer={profile?.vehicle_insurance_insurer}
          policyNumber={profile?.vehicle_insurance_policy_number}
          expiry={profile?.vehicle_insurance_expiry}
          onPress={() => navigation.navigate('EditContractorInsurance', { policyType: 'vehicle_insurance', profile })}
        />
      </Section>

      {/* Insurance documents */}
      <Section
        icon="file-text"
        title={`Documents${docs.length > 0 ? ` (${docs.length})` : ''}`}
        rightAction={{
          icon: 'plus',
          label: 'Add',
          onPress: () => navigation.navigate('UploadInsuranceDoc'),
        }}
      >
        {docs.length === 0 ? (
          <Text style={styles.emptyText}>No insurance certificates uploaded yet. Tap Add to upload one.</Text>
        ) : (
          docs.map(d => (
            <DocRow
              key={d.id}
              doc={d}
              onDelete={() => confirmDeleteDoc(d, toast, load)}
            />
          ))
        )}
      </Section>

      {/* Biosecurity */}
      <Section
        icon="alert-circle"
        title="Biosecurity"
        onEdit={() => navigation.navigate('EditContractorProfile', { profile })}
      >
        <View style={styles.bioStatusRow}>
          <View style={[styles.pill, { backgroundColor: riskStyle.bg }]}>
            <Text style={[styles.pillText, { color: riskStyle.fg }]}>{riskStyle.label}</Text>
          </View>
        </View>
        <Row label="Cleaning protocols" value={profile?.has_cleaning_protocols ? 'In place' : 'Not declared'} />
        <Row label="Approved disinfectants" value={profile?.uses_approved_disinfectants ? 'Yes' : 'No'} />
        {profile?.cleaning_equipment_owned?.length > 0 && (
          <ChipRow label="Cleaning kit" items={profile.cleaning_equipment_owned} />
        )}
      </Section>

      {/* Recent movements */}
      <Section icon="map-pin" title="Recent site visits">
        {movements.length === 0 ? (
          <Text style={styles.emptyText}>No site visits logged yet.</Text>
        ) : (
          movements.map(m => <MovementRow key={m.id} m={m} />)
        )}
      </Section>

      {/* App info */}
      <Section icon="info" title="App">
        <Row label="Version" value="0.1.0" />
      </Section>

      {/* Account actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.passwordBtn}
          onPress={() => navigation.navigate('ChangeContractorPassword')}
          activeOpacity={0.85}
        >
          <Feather name="lock" size={16} color={colors.primary} />
          <Text style={styles.passwordBtnText}>Change password</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Feather name="log-out" size={16} color={colors.white} />
          <Text style={styles.logoutText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: spacing.xxl }} />
    </ScrollView>
  );
}

function Section({ icon, title, children, onEdit, rightAction }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Feather name={icon} size={16} color={colors.primary} />
        <Text style={styles.sectionTitle}>{title}</Text>
        {rightAction && (
          <TouchableOpacity
            onPress={rightAction.onPress}
            hitSlop={6}
            style={styles.sectionActionBtn}
            activeOpacity={0.7}
          >
            <Feather name={rightAction.icon} size={14} color={colors.primary} />
            <Text style={styles.sectionActionText}>{rightAction.label}</Text>
          </TouchableOpacity>
        )}
        {onEdit && (
          <TouchableOpacity onPress={onEdit} hitSlop={10} style={styles.sectionEditBtn}>
            <Feather name="edit-2" size={14} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>
      <View>{children}</View>
    </View>
  );
}

function Row({ label, value }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue} numberOfLines={2}>{value || '—'}</Text>
    </View>
  );
}

function ChipRow({ label, items }) {
  return (
    <View style={styles.chipFieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.chipWrap}>
        {items.map((item, i) => (
          <View key={i} style={styles.chip}>
            <Text style={styles.chipText}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function PolicyRow({ label, insurer, policyNumber, coverage, expiry, onPress }) {
  const expStyle = expiryPill(expiry);
  const hasData = insurer || policyNumber || coverage || expiry;
  const inner = (
    <View style={styles.policyBlock}>
      <View style={styles.policyHeader}>
        <Text style={styles.policyLabel}>{label}</Text>
        <View style={styles.policyHeaderRight}>
          {hasData && (
            <View style={[styles.pill, { backgroundColor: expStyle.bg }]}>
              <Text style={[styles.pillText, { color: expStyle.fg }]}>{expStyle.label}</Text>
            </View>
          )}
          {onPress && <Feather name="chevron-right" size={16} color={colors.textMuted} />}
        </View>
      </View>
      {!hasData ? (
        <Text style={styles.policyMutedText}>Not set · tap to add</Text>
      ) : (
        <View style={styles.policyMeta}>
          {insurer && <Text style={styles.policyMetaText}>{insurer}</Text>}
          {policyNumber && <Text style={styles.policyMetaText}>Policy #{policyNumber}</Text>}
          {coverage != null && <Text style={styles.policyMetaText}>Cover {formatCurrency(coverage)}</Text>}
        </View>
      )}
    </View>
  );
  return onPress ? (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{inner}</TouchableOpacity>
  ) : inner;
}

function DocRow({ doc, onDelete }) {
  const expStyle = expiryPill(doc.expires_at);
  return (
    <View style={styles.docRow}>
      <View style={styles.docIcon}>
        <Feather name="paperclip" size={14} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.docName} numberOfLines={1}>{doc.original_filename}</Text>
        <Text style={styles.docMeta}>
          {POLICY_LABEL[doc.policy_type] || doc.policy_type}
          {doc.status && doc.status !== 'pending' ? ` · ${doc.status}` : ''}
        </Text>
      </View>
      <View style={[styles.pill, { backgroundColor: expStyle.bg }]}>
        <Text style={[styles.pillText, { color: expStyle.fg }]}>{expStyle.label}</Text>
      </View>
      {onDelete && (
        <TouchableOpacity onPress={onDelete} hitSlop={10} style={styles.docDeleteBtn}>
          <Feather name="trash-2" size={14} color={colors.danger} />
        </TouchableOpacity>
      )}
    </View>
  );
}

function confirmDeleteDoc(doc, toast, refresh) {
  Alert.alert(
    'Delete document?',
    `Remove "${doc.original_filename}"? This can't be undone.`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await contractorService.deleteMyInsuranceDoc(doc.id);
            toast.show('Document deleted', 'success');
            refresh();
          } catch (err) {
            const detail = err.response?.data?.detail;
            toast.show(typeof detail === 'string' ? detail : 'Delete failed', 'error');
          }
        },
      },
    ],
  );
}

function MovementRow({ m }) {
  const arrived = m.arrival_datetime ? new Date(m.arrival_datetime) : null;
  return (
    <View style={styles.movementRow}>
      <View style={styles.movementDateBlock}>
        <Text style={styles.movementDay}>{arrived ? arrived.getDate() : '—'}</Text>
        <Text style={styles.movementMonth}>
          {arrived ? arrived.toLocaleDateString('en-NZ', { month: 'short' }) : ''}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.movementCompany} numberOfLines={1}>{m.company_name}</Text>
        <Text style={styles.movementMeta} numberOfLines={1}>
          {m.purpose}
          {m.blocks_visited_count > 0 ? ` · ${m.blocks_visited_count} block${m.blocks_visited_count !== 1 ? 's' : ''}` : ''}
        </Text>
      </View>
      {!m.departure_datetime && (
        <View style={styles.onsiteDot} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceWarm },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceWarm },

  // Hero
  hero: {
    alignItems: 'center',
    padding: spacing.lg, paddingTop: spacing.xl,
    backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  avatar: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
  },
  avatarText: { fontSize: fontSize.xl, fontWeight: '700', color: colors.white },
  businessName: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, textAlign: 'center' },
  contactPerson: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  email: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  heroPills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md, justifyContent: 'center' },

  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: radius.pill,
  },
  pillText: { fontSize: fontSize.xs, fontWeight: '700' },

  // Notifications row
  notifRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    margin: spacing.base, marginBottom: 0,
    backgroundColor: colors.surface,
    borderRadius: radius.lg, padding: spacing.base,
    borderWidth: 1, borderColor: colors.border,
  },
  notifLabel: { flex: 1, fontSize: fontSize.base, fontWeight: '500', color: colors.text },
  notifBadge: {
    backgroundColor: colors.danger, borderRadius: radius.pill,
    paddingHorizontal: spacing.sm, paddingVertical: 2, minWidth: 22, alignItems: 'center',
  },
  notifBadgeText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.white },

  // Sections (cards)
  section: {
    margin: spacing.base, marginBottom: 0,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.base,
    borderWidth: 1, borderColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginBottom: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.text, flex: 1 },
  sectionEditBtn: {
    padding: 4, borderRadius: radius.sm,
    backgroundColor: colors.primary + '15',
  },
  sectionActionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.primary + '15',
  },
  sectionActionText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.primary },

  // Field rows
  field: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 6, gap: spacing.md,
  },
  fieldLabel: { fontSize: fontSize.sm, color: colors.textMuted, flexShrink: 0 },
  fieldValue: { fontSize: fontSize.sm, fontWeight: '500', color: colors.text, textAlign: 'right', flex: 1 },

  emptyText: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.sm },

  // Chip rows
  chipFieldBlock: { paddingVertical: 6 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: {
    backgroundColor: colors.borderLight,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: radius.pill,
  },
  chipText: { fontSize: fontSize.xs, color: colors.text, fontWeight: '500' },

  // Policy
  policyBlock: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  policyMutedRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  policyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  policyHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  policyLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  policyMutedText: { fontSize: fontSize.xs, color: colors.textMuted, fontStyle: 'italic' },
  policyMeta: { marginTop: 4, gap: 2 },
  policyMetaText: { fontSize: fontSize.xs, color: colors.textSecondary },

  // Document row
  docRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  docIcon: {
    width: 32, height: 32, borderRadius: radius.md,
    backgroundColor: colors.primary + '15',
    alignItems: 'center', justifyContent: 'center',
  },
  docName: { fontSize: fontSize.sm, color: colors.text, fontWeight: '600' },
  docMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  docDeleteBtn: {
    padding: 6, borderRadius: radius.sm,
    backgroundColor: colors.danger + '10',
    marginLeft: 4,
  },

  // Biosecurity
  bioStatusRow: { marginBottom: spacing.sm },

  // Movements
  movementRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  movementDateBlock: {
    alignItems: 'center', justifyContent: 'center',
    width: 44, height: 44, borderRadius: radius.md,
    backgroundColor: colors.borderLight,
  },
  movementDay: { fontSize: fontSize.md, fontWeight: '700', color: colors.text, lineHeight: 18 },
  movementMonth: { fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', fontWeight: '600' },
  movementCompany: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  movementMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  onsiteDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success,
  },

  // Actions
  actions: { padding: spacing.base, gap: spacing.sm },
  passwordBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.base,
  },
  passwordBtnText: { color: colors.primary, fontSize: fontSize.md, fontWeight: '700' },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.accent, borderRadius: radius.md,
    padding: spacing.base,
    ...shadows.card,
  },
  logoutText: { color: colors.white, fontSize: fontSize.md, fontWeight: '700' },
});
