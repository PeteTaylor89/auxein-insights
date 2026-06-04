// screens/TimesheetDayDetailScreen.js — per-day timesheet detail with entry
// CRUD, manual day-hours override, "Roll up entries to day total" button,
// and submit-for-approval. Locks all editing once status leaves draft/
// rejected (mirrors backend _ensure_editable).
import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  ActivityIndicator, StatusBar, Alert, TextInput,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { timesheetService, tasksService } from '../api/services';
import { KeyboardAvoider, useToast } from '../components';
import { colors, spacing, fontSize, radius, shadows } from '../styles/theme';

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

// Backend enforces 0.25h increments. Round to two decimals for display.
function parseHours(text) {
  if (!text) return null;
  const n = Number(String(text).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

export default function TimesheetDayDetailScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { dayId } = route.params || {};
  const [day, setDay] = useState(null);
  const [taskMap, setTaskMap] = useState({}); // id → title (lazily filled per entry)
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dayHoursDraft, setDayHoursDraft] = useState('');

  const load = useCallback(async () => {
    if (!dayId) return;
    setLoading(true);
    try {
      const data = await timesheetService.getDay(dayId);
      setDay(data);
      setDayHoursDraft(data.day_hours != null ? String(data.day_hours) : '');
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

  const isEditable = day ? (day.status === 'draft' || day.status === 'rejected') : false;
  const statusStyle = day ? (STATUS_STYLE[day.status] || STATUS_STYLE.draft) : STATUS_STYLE.draft;

  const entryHours = Number(day?.entry_hours || 0);
  const dayHours = day?.day_hours != null ? Number(day.day_hours) : null;
  const effective = Number(day?.effective_total_hours || 0);

  const handleRollup = async () => {
    if (!isEditable) return;
    if (entryHours <= 0) {
      toast.show('No task entries to roll up', 'info');
      return;
    }
    setBusy(true);
    try {
      const updated = await timesheetService.rollupDay(dayId);
      setDay(updated);
      setDayHoursDraft(updated.day_hours != null ? String(updated.day_hours) : '');
      toast.show(`Day total locked at ${Number(updated.day_hours).toFixed(1)} h`, 'success');
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.show(typeof detail === 'string' ? detail : 'Roll up failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveDayHours = async () => {
    if (!isEditable) return;
    const parsed = parseHours(dayHoursDraft);
    setBusy(true);
    try {
      const updated = await timesheetService.setDayHours(dayId, parsed);
      setDay(updated);
      toast.show('Day total saved', 'success');
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

        {!isEditable && (
          <View style={styles.lockedBanner}>
            <Feather name="lock" size={14} color={colors.info} />
            <Text style={styles.lockedBannerText}>
              {day.status === 'submitted' ? 'Submitted — waiting on manager approval.' :
               day.status === 'approved' ? 'Approved — locked.' :
               'This day is locked.'}
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

        {/* Day total — manual override + rollup button */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <View style={styles.cardIconBox}><Feather name="clock" size={16} color={colors.primary} /></View>
              <Text style={styles.cardTitle}>Day total</Text>
            </View>
          </View>

          <Text style={styles.fieldLabel}>Declared day hours</Text>
          <View style={styles.inlineRow}>
            <TextInput
              style={[styles.input, !isEditable && styles.inputDisabled]}
              value={dayHoursDraft}
              onChangeText={setDayHoursDraft}
              placeholder="e.g. 8"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              editable={isEditable}
            />
            {isEditable && (
              <TouchableOpacity
                style={[styles.smallBtn, styles.smallBtnGhost]}
                onPress={handleSaveDayHours}
                disabled={busy}
                activeOpacity={0.8}
              >
                <Text style={styles.smallBtnGhostText}>Save</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.fieldHint}>
            {dayHours == null
              ? `Using entries total (${entryHours.toFixed(1)} h) as the effective day total.`
              : `Locked at ${dayHours.toFixed(1)} h. Uncoded time: ${Number(day.uncoded_hours || 0).toFixed(1)} h.`}
          </Text>

          {isEditable && (
            <TouchableOpacity
              style={[styles.rollupBtn, (busy || entryHours <= 0) && styles.btnDisabled]}
              onPress={handleRollup}
              disabled={busy || entryHours <= 0}
              activeOpacity={0.85}
            >
              <Feather name="check-square" size={14} color={colors.white} />
              <Text style={styles.rollupBtnText}>Roll entries up to day total ({entryHours.toFixed(1)} h)</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

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

  fieldLabel: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '600', marginBottom: 4, marginTop: spacing.sm, textTransform: 'uppercase' },
  fieldHint: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.xs, lineHeight: 16 },

  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    flex: 1, paddingHorizontal: spacing.md, paddingVertical: 10,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    fontSize: fontSize.base, color: colors.text, backgroundColor: colors.surface,
  },
  inputDisabled: { backgroundColor: colors.borderLight, color: colors.textMuted },

  smallBtn: {
    paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  smallBtnGhost: { backgroundColor: colors.borderLight, borderWidth: 1, borderColor: colors.border },
  smallBtnGhostText: { fontSize: fontSize.sm, color: colors.text, fontWeight: '600' },

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
