// screens/TimesheetEntryEditScreen.js — create or edit a single TimeEntry.
// Picks a task from the user's assigned/recent list (or leaves untyped) and
// sets hours in 0.25-h steps. Backend enforces the step + caps.
import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, TextInput,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { timesheetService, tasksService } from '../api/services';
import { KeyboardAvoider, useToast } from '../components';
import { colors, spacing, fontSize, radius, shadows } from '../styles/theme';

const HOUR_QUICK_PICKS = [0.5, 1, 2, 4, 8];

function parseHours(text) {
  if (!text) return null;
  const n = Number(String(text).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

export default function TimesheetEntryEditScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { dayId, entry } = route.params || {};
  const isEdit = !!entry;

  const [hoursText, setHoursText] = useState(entry?.hours != null ? String(entry.hours) : '');
  const [taskId, setTaskId] = useState(entry?.task_id ?? null);
  const [taskName, setTaskName] = useState('');
  const [tasks, setTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: isEdit ? 'Edit time entry' : 'New time entry' });
  }, [navigation, isEdit]);

  useEffect(() => {
    // Pull user's recent + active tasks for the picker. Cap to keep the
    // picker scannable; this is V1 — search/typeahead later if needed.
    let mounted = true;
    setLoadingTasks(true);
    tasksService.getTasks?.({ limit: 50 })
      .then(data => {
        if (!mounted) return;
        const list = Array.isArray(data) ? data : (data?.items || []);
        setTasks(list);
        if (entry?.task_id) {
          const match = list.find(t => t.id === entry.task_id);
          if (match) setTaskName(match.title || `Task #${entry.task_id}`);
          else {
            // Fall back to a one-shot fetch so the row label isn't blank.
            tasksService.getTask(entry.task_id)
              .then(t => mounted && setTaskName(t.title || `Task #${entry.task_id}`))
              .catch(() => mounted && setTaskName(`Task #${entry.task_id}`));
          }
        }
      })
      .catch(() => setTasks([]))
      .finally(() => mounted && setLoadingTasks(false));
    return () => { mounted = false; };
  }, [entry?.task_id]);

  const pickTask = (t) => {
    setTaskId(t.id);
    setTaskName(t.title || `Task #${t.id}`);
  };

  const clearTask = () => {
    setTaskId(null);
    setTaskName('');
  };

  const handleSave = async () => {
    const hours = parseHours(hoursText);
    if (hours == null) {
      toast.show('Enter hours greater than 0', 'error');
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await timesheetService.updateEntry(entry.id, { task_id: taskId, hours });
      } else {
        await timesheetService.createEntry({ timesheet_day_id: dayId, task_id: taskId, hours });
      }
      toast.show(isEdit ? 'Entry updated' : 'Entry added', 'success');
      navigation.goBack();
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.show(typeof detail === 'string' ? detail : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoider>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.base, paddingBottom: spacing.xxl + insets.bottom }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hours */}
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Hours</Text>
          <TextInput
            style={styles.input}
            value={hoursText}
            onChangeText={setHoursText}
            placeholder="e.g. 1.5"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            autoFocus
          />
          <View style={styles.quickRow}>
            {HOUR_QUICK_PICKS.map(h => (
              <TouchableOpacity
                key={h}
                style={styles.quickPick}
                onPress={() => setHoursText(String(h))}
                activeOpacity={0.75}
              >
                <Text style={styles.quickPickText}>{h}h</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.fieldHint}>Backend rounds to 0.25 h increments.</Text>
        </View>

        {/* Task picker */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.fieldLabel}>Task (optional)</Text>
            {taskId != null && (
              <TouchableOpacity onPress={clearTask} hitSlop={8}>
                <Text style={styles.clearText}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>

          {taskId != null && (
            <View style={styles.selectedTask}>
              <Feather name="check" size={14} color={colors.primary} />
              <Text style={styles.selectedTaskText} numberOfLines={2}>{taskName || `Task #${taskId}`}</Text>
            </View>
          )}

          <Text style={styles.fieldHint}>{tasks.length > 0 ? 'Pick from your recent tasks:' : (loadingTasks ? 'Loading tasks…' : 'No tasks available.')}</Text>
          {tasks.map(t => (
            <TouchableOpacity
              key={t.id}
              style={[styles.taskRow, taskId === t.id && styles.taskRowActive]}
              onPress={() => pickTask(t)}
              activeOpacity={0.7}
            >
              <Text style={[styles.taskTitle, taskId === t.id && styles.taskTitleActive]} numberOfLines={1}>{t.title}</Text>
              {t.status && <Text style={styles.taskStatus}>{String(t.status).replace(/_/g, ' ')}</Text>}
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={styles.barWrap}>
        <View style={styles.bar}>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => navigation.goBack()}
            disabled={saving}
          >
            <Text style={styles.secondaryBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryBtn, saving && styles.btnDisabled]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            <Feather name="check" size={16} color={colors.white} />
            <Text style={styles.primaryBtnText}>{saving ? 'Saving…' : (isEdit ? 'Save' : 'Add entry')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
      </KeyboardAvoider>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.base,
    marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, ...shadows.card,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  fieldLabel: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase' },
  fieldHint: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.xs },

  input: {
    paddingHorizontal: spacing.md, paddingVertical: 12,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    fontSize: fontSize.lg, color: colors.text, backgroundColor: colors.surface,
    fontWeight: '600',
  },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  quickPick: {
    paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill,
    backgroundColor: colors.borderLight,
  },
  quickPickText: { fontSize: fontSize.sm, color: colors.text, fontWeight: '600' },

  clearText: { fontSize: fontSize.xs, color: colors.danger, fontWeight: '700' },
  selectedTask: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.primary + '14', padding: spacing.sm, borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  selectedTaskText: { fontSize: fontSize.sm, color: colors.text, fontWeight: '600', flex: 1 },

  taskRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border,
  },
  taskRowActive: { backgroundColor: colors.primary + '08' },
  taskTitle: { fontSize: fontSize.sm, color: colors.text, flex: 1 },
  taskTitleActive: { fontWeight: '700', color: colors.primary },
  taskStatus: { fontSize: fontSize.xs, color: colors.textMuted, textTransform: 'capitalize', marginLeft: spacing.sm },

  btnDisabled: { opacity: 0.5 },
  barWrap: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  bar: { flexDirection: 'row', gap: spacing.sm, padding: spacing.base },
  secondaryBtn: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.borderLight, borderRadius: radius.md,
  },
  secondaryBtnText: { color: colors.text, fontWeight: '600' },
  primaryBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.primary, borderRadius: radius.md,
  },
  primaryBtnText: { color: colors.white, fontWeight: '700', fontSize: fontSize.base },
});
