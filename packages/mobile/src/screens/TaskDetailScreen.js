// screens/TaskDetailScreen.js — Task detail (placeholder for M2 full build)
import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { colors, spacing, fontSize, radius } from '../styles/theme';
import { tasksService } from '../api/services';

export default function TaskDetailScreen({ route }) {
  const { taskId } = route.params;
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    tasksService.getTask(taskId)
      .then(data => setTask(data))
      .catch(err => console.error('Failed to load task', err))
      .finally(() => setLoading(false));
  }, [taskId]);

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
  if (!task) return <View style={styles.center}><Text>Task not found</Text></View>;

  const statusColor = (s) => {
    const k = String(s || '').toLowerCase();
    if (k === 'in_progress') return colors.warning;
    if (k === 'completed') return colors.success;
    if (k === 'scheduled' || k === 'ready') return colors.info;
    return colors.textMuted;
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>{task.title || `Task #${task.id}`}</Text>
        <View style={[styles.badge, { backgroundColor: statusColor(task.status) + '20' }]}>
          <Text style={[styles.badgeText, { color: statusColor(task.status) }]}>
            {(task.status || 'draft').replace(/_/g, ' ')}
          </Text>
        </View>

        {task.description ? <Text style={styles.description}>{task.description}</Text> : null}

        <View style={styles.fields}>
          {task.task_category && <Field label="Category" value={task.task_category.replace(/_/g, ' ')} />}
          {task.priority && <Field label="Priority" value={task.priority} />}
          {task.scheduled_start_date && <Field label="Start" value={new Date(task.scheduled_start_date).toLocaleDateString('en-NZ')} />}
          {(task.block_name || task.block?.block_name) && <Field label="Block" value={task.block_name || task.block?.block_name} />}
        </View>
      </View>

      <View style={styles.placeholder}>
        <Text style={styles.placeholderTitle}>Row Progress & Actions</Text>
        <Text style={styles.placeholderText}>
          Start task, row completion, GPS tracking, and consumable confirmation will be built in Phase M2.
        </Text>
      </View>
    </ScrollView>
  );
}

function Field({ label, value }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceWarm },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: {
    margin: spacing.base, backgroundColor: colors.surface,
    borderRadius: radius.lg, padding: spacing.base,
    borderWidth: 1, borderColor: colors.border,
  },
  title: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  badge: { alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill, marginBottom: spacing.md },
  badgeText: { fontSize: fontSize.xs, fontWeight: '600', textTransform: 'capitalize' },
  description: { fontSize: fontSize.sm, color: colors.textMuted, marginBottom: spacing.md },
  fields: { gap: spacing.sm },
  field: { flexDirection: 'row', justifyContent: 'space-between' },
  fieldLabel: { fontSize: fontSize.sm, color: colors.textMuted },
  fieldValue: { fontSize: fontSize.sm, fontWeight: '500', color: colors.text, textTransform: 'capitalize' },
  placeholder: {
    margin: spacing.base, backgroundColor: colors.surfaceWarm,
    borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.oliveBorder, borderStyle: 'dashed',
    alignItems: 'center',
  },
  placeholderTitle: { fontSize: fontSize.base, fontWeight: '600', color: colors.primary, marginBottom: spacing.xs },
  placeholderText: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },
});
