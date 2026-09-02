// screens/TimesheetDayDetailScreen.js — per-day timesheet detail with entry
// CRUD, the day-total sheet, and submit-for-approval. Locks all editing once
// status leaves draft/rejected (mirrors backend _ensure_editable).
//
// The day total is DERIVED: hours coded to tasks plus uncoded time. It follows
// task completions on its own, so there is no roll-up and no declared total to
// fall out of step with the entries — which is what produced a day showing six
// hours of task entries under a two-hour total. The only figure entered here is
// the uncoded part.
import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  ActivityIndicator, StatusBar, Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { timesheetService, tasksService } from '../api/services';
import { KeyboardAvoider, useToast, DayTotalSheet } from '../components';
import { colors, spacing, fontSize, radius, shadows } from '../styles/theme';
import { isDayEditable, dayLockReason, rejectionReason } from '../utils/timesheetStatus';

const STATUS_STYLE = {
  draft:     { bg: colors.borderLight, fg: colors.textMuted, label: 'Draft' },
  submitted: { bg: colors.info + '22',  fg: colors.info,      label: 'Submitted' },
  approved:  { bg: colors.success + '22', fg: colors.success, label: 'Approved' },
  rejected:  { bg: colors.danger + '22', fg: colors.danger,   label: 'Rejected' },
};

function fmtFullDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export default function TimesheetDayDetailScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { dayId } = route.params || {};
  const [day, setDay] = useState(null);
  const [taskMap, setTaskMap] = useState({}); // id → title (lazily filled per entry)
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showTotalSheet, setShowTotalSheet] = useState(false);

  const load = useCallback(async () => {
    if (!dayId) return;
    setLoading(true);
    try {
      const data = await timesheetService.getDay(dayId);
      setDay(data);
      // Fire-and-forget task title lookups
      const taskIds = [...new Set((data.entries || []).map(e => e.task_id).filter(Boolean))];
      if (taskIds.length) {
        const updates = {};
        await Promise.all(taskIds.map(async (tid) => {
          try { const t = await tasksService.getTask(tid); updates[tid] = t.title || `Task #${tid}`; }
          catch { updates[tid] = `Task #${tid}`; }
        }));
        setTaskMap(prev => ({ ...prev, ...updates }));
      }
    } catch (err) {
      console.log('Day detail load failed:', err.message);
      toast.show('Could not load day', 'error');
    } finally {
      setLoading(false);
    }
  }, [dayId, toast]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // The rule now lives in one place, mirrored from
  // packages/shared/src/utils/timesheetStatus.js. Mobile's version was the one
  // the other two were wrong against — see F6.
  const isEditable = isDayEditable(day);
  const lockReason = dayLockReason(day);
  const rejectedFor = day?.status === 'rejected' ? rejectionReason(day.notes) : null;
  const statusStyle = day ? (STATUS_STYLE[day.status] || STATUS_STYLE.draft) : STATUS_STYLE.draft;

  const entryHours = Number(day?.entry_hours || 0);
  const effective = Number(day?.effective_total_hours || 0);

  const handleSaveDayHours = async (hours) => {
    if (!isEditable) return;
    setBusy(true);
    try {
      const updated = await timesheetService.setUncodedHours(dayId, hours);
      setDay(updated);
      setShowTotalSheet(false);
      const unc = Number(updated.uncoded_hours || 0);
      toast.show(
        unc > 0
          ? `${unc.toFixed(2)} h uncoded — day total ${Number(updated.effective_total_hours).toFixed(2)} h`
          : `Uncoded time cleared — day total ${Number(updated.effective_total_hours).toFixed(2)} h`,
        'success',
      );
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.show(typeof detail === 'string' ? detail : 'Save failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteEntry = (entryId) => {
    if (!isEditable) return;
    Alert.alert('Delete entry?', 'This removes the time entry from this day.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setBusy(true);
        try {
          await timesheetService.deleteEntry(entryId);
          await load();
        } catch (err) {
          const detail = err.response?.data?.detail;
          toast.show(typeof detail === 'string' ? detail : 'Delete failed', 'error');
        } finally {
          setBusy(false);
        }
      }},
    ]);
  };

  const handleAddEntry = () => {
    if (!isEditable) return;
    navigation.navigate('TimesheetEntryEdit', { dayId, entry: null });
  };

  const handleEditEntry = (entry) => {
    if (!isEditable) return;
    navigation.navigate('TimesheetEntryEdit', { dayId, entry });
  };

  const handleSubmit = async () => {
    if (!isEditable) return;
    if (effective <= 0) {
      Alert.alert('Nothing to submit', 'Add some hours before submitting this day.');
      return;
    }
    Alert.alert('Submit this day?', `Submitting ${effective.toFixed(1)} h for approval. You won't be able to edit until your manager approves or rejects it.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Submit', onPress: async () => {
        setBusy(true);
        try {
          const updated = await timesheetService.submitDay(dayId);
          setDay(updated);
          toast.show('Submitted', 'success');
        } catch (err) {
          const detail = err.response?.data?.detail;
          toast.show(typeof detail === 'string' ? detail : 'Submit failed', 'error');
        } finally {
          setBusy(false);
        }
      }},
    ]);
  };

  if (!day && loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!day) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>Day not found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoider>
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.base, paddingBottom: spacing.xxl + insets.bottom }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}
      >
        {/* Hero — date + status */}
        <View style={styles.hero}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroDate}>{fmtFullDate(day.work_date)}</Text>
            <Text style={styles.heroEffective}>{effective.toFixed(1)} h effective</Text>
          </View>
          <View style={[styles.statusPill, { backgroundColor: statusStyle.bg }]}>
            <Text style={[styles.statusText, { color: statusStyle.fg }]}>{statusStyle.label}</Text>
          </View>
        </View>

        {lockReason && (
          <View style={styles.lockedBanner}>
            <Feather name="lock" size={14} color={colors.info} />
            <Text style={styles.lockedBannerText}>{lockReason}</Text>
          </View>
        )}

        {/* A rejected day is editable, so it gets no lock banner — but the
            reason the manager typed is appended to notes as `[Rejected: ...]`
            and was never displayed anywhere. Being sent back without being
            told why is how a day gets resubmitted unchanged. */}
        {day.status === 'rejected' && (
          <View style={styles.rejectedBanner}>
            <Feather name="corner-up-left" size={14} color={colors.danger} />
            <Text style={styles.rejectedBannerText}>
              {rejectedFor ? `Sent back: ${rejectedFor}` : 'Sent back by your manager. Fix it and submit again.'}
            </Text>
          </View>
        )}

        {/* Entries */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <View style={styles.cardIconBox}><Feather name="list" size={16} color={colors.primary} /></View>
              <Text style={styles.cardTitle}>Entries</Text>
              <Text style={styles.cardSub}>{entryHours.toFixed(1)} h</Text>
            </View>
            {isEditable && (
              <TouchableOpacity onPress={handleAddEntry} hitSlop={10} activeOpacity={0.75}>
                <Feather name="plus" size={20} color={colors.primary} />
              </TouchableOpacity>
            )}
          </View>

          {(day.entries || []).length === 0 ? (
            <Text style={styles.emptyText}>No entries yet. Complete a task with hours or tap + to add one.</Text>
          ) : (
            day.entries.map((e) => (
              <View key={e.id} style={styles.entryRow}>
                <TouchableOpacity
                  style={{ flex: 1 }}
                  onPress={() => handleEditEntry(e)}
                  disabled={!isEditable}
                  activeOpacity={isEditable ? 0.7 : 1}
                >
                  <Text style={styles.entryTitle} numberOfLines={1}>
                    {e.task_id ? (taskMap[e.task_id] || `Task #${e.task_id}`) : 'Untyped time'}
                  </Text>
                  <Text style={styles.entryMeta}>
                    {Number(e.hours).toFixed(2)} h{e.entry_source && e.entry_source !== 'manual_timesheet' ? ` · ${e.entry_source.replace(/_/g, ' ')}` : ''}
                  </Text>
                </TouchableOpacity>
                {isEditable && (
                  <TouchableOpacity onPress={() => handleDeleteEntry(e.id)} hitSlop={10} style={styles.entryDelete}>
                    <Feather name="trash-2" size={16} color={colors.danger} />
                  </TouchableOpacity>
                )}
              </View>
            ))
          )}
        </View>

        {/* Day total — derived; only the uncoded part is entered */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <View style={styles.cardIconBox}><Feather name="clock" size={16} color={colors.primary} /></View>
              <Text style={styles.cardTitle}>Day total</Text>
            </View>
          </View>

          {/* From tasks + uncoded + total, always visible so the split is
              legible without opening anything. */}
          <View style={styles.totalGrid}>
            <View style={styles.totalCell}>
              <Text style={styles.totalLabel}>From tasks</Text>
              <Text style={styles.totalValue}>{entryHours.toFixed(2)} h</Text>
            </View>
            <View style={styles.totalCell}>
              <Text style={styles.totalLabel}>Uncoded</Text>
              <Text style={styles.totalValue}>{Number(day.uncoded_hours || 0).toFixed(2)} h</Text>
            </View>
            <View style={styles.totalCell}>
              <Text style={styles.totalLabel}>Day total</Text>
              <Text style={[styles.totalValue, styles.totalValueMain]}>
                {effective.toFixed(2)} h
              </Text>
            </View>
          </View>

          <Text style={styles.fieldHint}>
            The day total is worked out for you: task hours plus any uncoded time. Completing
            a task with hours moves it on its own.
          </Text>

          {isEditable && (
            <TouchableOpacity
              style={[styles.rollupBtn, busy && styles.btnDisabled]}
              onPress={() => setShowTotalSheet(true)}
              disabled={busy}
              activeOpacity={0.85}
            >
              <Feather name="clock" size={14} color={colors.white} />
              <Text style={styles.rollupBtnText}>
                {Number(day.uncoded_hours || 0) > 0 ? 'Adjust uncoded time' : 'Add uncoded time'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <DayTotalSheet
        visible={showTotalSheet}
        entryHours={entryHours}
        uncodedHours={Number(day.uncoded_hours || 0)}
        saving={busy}
        onSave={handleSaveDayHours}
        onClose={() => !busy && setShowTotalSheet(false)}
      />

      {/* Submit bar */}
      {isEditable && (
        <SafeAreaView edges={['bottom']} style={styles.barWrap}>
          <View style={styles.bar}>
            <TouchableOpacity
              style={[styles.primaryBtn, (busy || effective <= 0) && styles.btnDisabled]}
              onPress={handleSubmit}
              disabled={busy || effective <= 0}
              activeOpacity={0.85}
            >
              <Feather name="send" size={16} color={colors.white} />
              <Text style={styles.primaryBtnText}>{busy ? 'Working…' : `Submit ${effective.toFixed(1)} h for approval`}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      )}
      </KeyboardAvoider>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { alignItems: 'center', justifyContent: 'center' },
  errorText: { color: colors.textMuted, fontSize: fontSize.sm },

  hero: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.base, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  heroDate: { fontSize: fontSize.base, fontWeight: '700', color: colors.text },
  heroEffective: { fontSize: fontSize.lg, fontWeight: '700', color: colors.primary, marginTop: 2 },

  statusPill: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  statusText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },

  lockedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.info + '14', borderColor: colors.info + '55', borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  lockedBannerText: { fontSize: fontSize.xs, color: colors.text, flex: 1 },

  rejectedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.danger + '14', borderColor: colors.danger + '55', borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  rejectedBannerText: { fontSize: fontSize.xs, color: colors.text, flex: 1 },

  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.base,
    marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border,
    ...shadows.card,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  cardIconBox: {
    width: 28, height: 28, borderRadius: radius.md, backgroundColor: colors.primary + '18',
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { fontSize: fontSize.base, fontWeight: '600', color: colors.text },
  cardSub: { fontSize: fontSize.sm, color: colors.textMuted, marginLeft: spacing.sm },

  emptyText: { fontSize: fontSize.sm, color: colors.textMuted, fontStyle: 'italic', paddingVertical: spacing.sm },

  entryRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border,
  },
  entryTitle: { fontSize: fontSize.sm, color: colors.text, fontWeight: '600' },
  entryMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  entryDelete: { padding: 6 },

  fieldHint: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.xs, lineHeight: 16 },

  totalGrid: {
    flexDirection: 'row', gap: spacing.sm,
    backgroundColor: colors.borderLight, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.sm,
  },
  totalCell: { flex: 1, alignItems: 'center' },
  totalLabel: { fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', fontWeight: '700' },
  totalValue: { fontSize: fontSize.md, fontWeight: '700', color: colors.text, marginTop: 2 },
  totalValueMain: { color: colors.primary },
  rollupBtn: {
    marginTop: spacing.md,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    backgroundColor: colors.primary, borderRadius: radius.md,
  },
  rollupBtnText: { fontSize: fontSize.sm, color: colors.white, fontWeight: '700' },

  btnDisabled: { opacity: 0.5 },

  barWrap: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  bar: { padding: spacing.base },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.primary, borderRadius: radius.md,
  },
  primaryBtnText: { color: colors.white, fontWeight: '700', fontSize: fontSize.base },
});
