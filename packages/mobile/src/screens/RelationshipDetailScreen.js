// screens/RelationshipDetailScreen.js — Contractor's view of one contract.
// Read-only. Edits flow through the company-side admin; contractor sees what
// the company has set + their compliance state with it.
import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  ActivityIndicator, StatusBar, TouchableOpacity,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, fontSize, radius, shadows } from '../styles/theme';
import { contractorService } from '../api/services';
import { useToast } from '../components';

const STATUS_STYLES = {
  active:     { bg: colors.success + '18', fg: colors.success, label: 'Active' },
  suspended:  { bg: colors.warning + '18', fg: colors.warning, label: 'Suspended' },
  inactive:   { bg: colors.textMuted + '18', fg: colors.textMuted, label: 'Inactive' },
  terminated: { bg: colors.danger + '18',  fg: colors.danger,  label: 'Terminated' },
  pending:    { bg: colors.info + '18',    fg: colors.info,    label: 'Pending' },
};

const formatDate = (iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-NZ', opts);
};

export default function RelationshipDetailScreen({ route, navigation }) {
  const { relationshipId } = route.params || {};
  const toast = useToast();
  const [rel, setRel] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!relationshipId) return;
    setLoading(true);
    try {
      const [data, hist] = await Promise.all([
        contractorService.getMyRelationship(relationshipId),
        contractorService.getMyRelationshipWorkHistory(relationshipId, 20).catch(() => []),
      ]);
      setRel(data);
      setHistory(Array.isArray(hist) ? hist : []);
      // Update header title once company name is known
      if (data?.company_name) {
        navigation.setOptions({ title: data.company_name });
      }
    } catch (err) {
      console.log('Relationship detail load failed:', err.message);
      toast.show('Could not load contract', 'error');
    } finally {
      setLoading(false);
    }
  }, [relationshipId, navigation, toast]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading && !rel) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!rel) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.errorText}>Contract not found.</Text>
      </View>
    );
  }

  const statusStyle = STATUS_STYLES[rel.status] || STATUS_STYLES.inactive;
  const trainingTotal = (rel.required_training_modules || []).length;
  const trainingDone = (rel.completed_training_modules || []).length;
  const hasEmergency = rel.emergency_contact_name || rel.emergency_contact_phone;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}
    >
      <StatusBar barStyle="dark-content" />

      {/* Hero — status + preferred + contract status */}
      <View style={styles.hero}>
        <View style={styles.heroTopRow}>
          <View style={[styles.statusPill, { backgroundColor: statusStyle.bg }]}>
            <Text style={[styles.statusText, { color: statusStyle.fg }]}>{statusStyle.label}</Text>
          </View>
          {rel.is_preferred && (
            <View style={styles.preferredPill}>
              <Feather name="star" size={12} color={colors.warning} />
              <Text style={styles.preferredText}>Preferred</Text>
            </View>
          )}
        </View>
        <Text style={styles.contractStatus}>{rel.contract_status}</Text>
        {rel.days_until_contract_end != null && rel.days_until_contract_end > 0 && (
          <Text style={styles.heroMeta}>
            {rel.days_until_contract_end} day{rel.days_until_contract_end !== 1 ? 's' : ''} until contract ends
          </Text>
        )}
      </View>

      {/* Rates */}
      <Card icon="dollar-sign" title="Rates">
        <Row label="Hourly rate" value={rel.hourly_rate ? `${rel.currency || 'NZD'} $${rel.hourly_rate.toFixed(2)}` : '—'} />
        <Row label="Daily rate" value={rel.daily_rate ? `${rel.currency || 'NZD'} $${rel.daily_rate.toFixed(2)}` : '—'} />
        {rel.preferred_payment_terms && (
          <Row label="Payment terms" value={rel.preferred_payment_terms} />
        )}
      </Card>

      {/* Contract dates */}
      <Card icon="calendar" title="Contract">
        <Row label="Start" value={formatDate(rel.contract_start)} />
        <Row label="End" value={formatDate(rel.contract_end)} />
        <Row label="Last worked" value={rel.last_worked_date ? formatDate(rel.last_worked_date) : 'No work logged yet'} />
      </Card>

      {/* Permissions */}
      <Card icon="key" title="Permissions">
        <Row
          label="Block access"
          value={rel.blocks_access?.length > 0
            ? `${rel.blocks_access.length} block${rel.blocks_access.length !== 1 ? 's' : ''}`
            : 'All blocks'}
        />
        {rel.areas_restricted?.length > 0 && (
          <Row label="Restricted areas" value={`${rel.areas_restricted.length}`} />
        )}
        <Row label="Requires supervision" value={rel.requires_supervision ? 'Yes' : 'No'} />
        <Row label="Can create observations" value={rel.can_create_observations ? 'Yes' : 'No'} />
        <Row label="Can update tasks" value={rel.can_update_tasks ? 'Yes' : 'No'} />
      </Card>

      {/* Training */}
      {trainingTotal > 0 && (
        <Card
          icon="award"
          title="Training"
          badge={rel.has_required_training ? null : 'Outstanding'}
          badgeColor={colors.warning}
        >
          <Row label="Required modules" value={`${trainingTotal}`} />
          <Row label="Completed" value={`${trainingDone} of ${trainingTotal}`} />
          {!rel.has_required_training && rel.missing_training?.length > 0 && (
            <View style={styles.warningBox}>
              <Feather name="alert-triangle" size={14} color={colors.warning} />
              <Text style={styles.warningBoxText}>
                {rel.missing_training.length} module{rel.missing_training.length !== 1 ? 's' : ''} outstanding — see your company contact to schedule.
              </Text>
            </View>
          )}
        </Card>
      )}

      {/* Stats */}
      <Card icon="bar-chart-2" title="History">
        <Row label="Jobs completed" value={`${rel.jobs_completed_for_company || 0}`} />
        <Row label="Total hours" value={`${(rel.total_hours_worked || 0).toFixed(1)} h`} />
        {rel.company_rating > 0 && (
          <Row label="Company rating" value={`${rel.company_rating.toFixed(1)} / 5`} />
        )}
      </Card>

      {/* Completed work — recent assignments with notes + hours per record */}
      <Card icon="check-square" title={`Completed work${history.length ? ` (${history.length})` : ''}`}>
        {history.length === 0 ? (
          <Text style={styles.emptyText}>No completed work yet.</Text>
        ) : (
          history.map((item) => (
            <TouchableOpacity
              key={item.assignment_id}
              style={styles.workRow}
              onPress={() => item.task_id && navigation.navigate('TaskDetail', { taskId: item.task_id })}
              disabled={!item.task_id}
              activeOpacity={item.task_id ? 0.7 : 1}
            >
              <View style={styles.workRowHeader}>
                <Text style={styles.workTitle} numberOfLines={1}>{item.title}</Text>
                {item.actual_hours_worked != null && (
                  <Text style={styles.workHours}>{item.actual_hours_worked.toFixed(1)} h</Text>
                )}
              </View>
              <Text style={styles.workMeta}>
                {item.block_name ? `${item.block_name} · ` : ''}{formatDate(item.actual_end)}
              </Text>
              {item.notes && (
                <Text style={styles.workNotes} numberOfLines={3}>{item.notes}</Text>
              )}
            </TouchableOpacity>
          ))
        )}
      </Card>

      {/* Emergency contact override */}
      {hasEmergency && (
        <Card icon="phone" title="Emergency contact (this company)">
          {rel.emergency_contact_name && (
            <Row label="Name" value={rel.emergency_contact_name} />
          )}
          {rel.emergency_contact_phone && (
            <Row label="Phone" value={rel.emergency_contact_phone} />
          )}
        </Card>
      )}

      {/* Contractor's own notes */}
      {rel.contractor_notes && (
        <Card icon="edit-3" title="Your notes">
          <Text style={styles.notesText}>{rel.contractor_notes}</Text>
        </Card>
      )}

      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
}

function Card({ icon, title, badge, badgeColor, children }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <View style={styles.cardIconBox}>
            <Feather name={icon} size={16} color={colors.primary} />
          </View>
          <Text style={styles.cardTitle}>{title}</Text>
        </View>
        {badge && (
          <View style={[styles.badge, { backgroundColor: (badgeColor || colors.warning) + '22' }]}>
            <Text style={[styles.badgeText, { color: badgeColor || colors.warning }]}>{badge}</Text>
          </View>
        )}
      </View>
      <View style={{ gap: 6 }}>{children}</View>
    </View>
  );
}

function Row({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: spacing.base, paddingBottom: spacing.xl },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  errorText: { color: colors.textMuted, fontSize: fontSize.sm },

  hero: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.border,
    ...shadows.card,
  },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  statusPill: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  statusText: { fontSize: fontSize.xs, fontWeight: '700' },
  preferredPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.warning + '18',
    paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill,
  },
  preferredText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.warningDark },
  contractStatus: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text },
  heroMeta: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.border,
    ...shadows.card,
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing.md,
  },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardIconBox: {
    width: 28, height: 28, borderRadius: radius.md,
    backgroundColor: colors.primary + '18',
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { fontSize: fontSize.base, fontWeight: '600', color: colors.text },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill },
  badgeText: { fontSize: fontSize.xs, fontWeight: '700' },

  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  rowLabel: { fontSize: fontSize.sm, color: colors.textMuted, flex: 1 },
  rowValue: { fontSize: fontSize.sm, color: colors.text, fontWeight: '500', textAlign: 'right', flexShrink: 1 },

  warningBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    backgroundColor: colors.warningBg,
    padding: spacing.sm,
    borderRadius: radius.md,
    marginTop: spacing.sm,
    borderWidth: 1, borderColor: colors.warningBorder,
  },
  warningBoxText: { fontSize: fontSize.xs, color: colors.warningDark, flex: 1, lineHeight: 16 },

  notesText: { fontSize: fontSize.sm, color: colors.text, lineHeight: 20 },

  emptyText: { fontSize: fontSize.sm, color: colors.textMuted, fontStyle: 'italic' },
  workRow: {
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  workRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: spacing.sm,
    marginBottom: 2,
  },
  workTitle: { flex: 1, fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  workHours: { fontSize: fontSize.sm, fontWeight: '700', color: colors.primary },
  workMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginBottom: 4 },
  workNotes: { fontSize: fontSize.xs, color: colors.text, lineHeight: 16 },
});
