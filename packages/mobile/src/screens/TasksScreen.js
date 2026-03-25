// screens/TasksScreen.js — Task list for current user
import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { colors, spacing, fontSize, radius } from '../styles/theme';
import { tasksService } from '../api/services';

export default function TasksScreen({ navigation }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('active'); // active | completed | all

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 100 };
      if (filter === 'active') params.status = 'scheduled,ready,in_progress,paused';
      if (filter === 'completed') params.status = 'completed';
      const data = await tasksService.getMyTasks(params);
      const items = Array.isArray(data) ? data : (data?.items || []);
      setTasks(items);
    } catch (err) {
      console.log('Failed to load tasks:', err.message);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const statusColor = (s) => {
    const k = String(s || '').toLowerCase();
    if (k === 'in_progress') return colors.warning;
    if (k === 'scheduled' || k === 'ready') return colors.info;
    if (k === 'completed') return colors.success;
    if (k === 'cancelled') return colors.danger;
    return colors.textMuted;
  };

  const priorityColor = (p) => {
    const k = String(p || '').toLowerCase();
    if (k === 'high' || k === 'urgent') return colors.danger;
    if (k === 'medium') return colors.warning;
    return colors.textMuted;
  };

  const renderTask = ({ item: t }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('TaskDetail', { taskId: t.id })}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.taskTitle} numberOfLines={1}>{t.title || `Task #${t.id}`}</Text>
        <Text style={[styles.priority, { color: priorityColor(t.priority) }]}>
          {(t.priority || 'medium').charAt(0).toUpperCase() + (t.priority || 'medium').slice(1)}
        </Text>
      </View>

      <View style={styles.cardMeta}>
        {t.scheduled_start_date && (
          <Text style={styles.metaText}>
            {new Date(t.scheduled_start_date).toLocaleDateString('en-NZ', { month: 'short', day: 'numeric' })}
          </Text>
        )}
        {(t.block_name || t.block?.block_name) && (
          <Text style={styles.metaText}>{t.block_name || t.block?.block_name}</Text>
        )}
        {t.task_category && (
          <Text style={styles.metaText}>{t.task_category.replace(/_/g, ' ')}</Text>
        )}
      </View>

      <View style={[styles.statusBadge, { backgroundColor: statusColor(t.status) + '20' }]}>
        <Text style={[styles.statusText, { color: statusColor(t.status) }]}>
          {(t.status || 'draft').replace(/_/g, ' ')}
        </Text>
      </View>

      {t.progress_percentage > 0 && t.progress_percentage < 100 && (
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${t.progress_percentage}%` }]} />
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {['active', 'completed', 'all'].map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={tasks}
        keyExtractor={(t) => String(t.id)}
        renderItem={renderTask}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadTasks} tintColor={colors.primary} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !loading ? <Text style={styles.empty}>No tasks found</Text> : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceWarm },
  filterRow: {
    flexDirection: 'row', gap: spacing.xs,
    padding: spacing.sm, paddingHorizontal: spacing.base,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  filterBtn: {
    paddingVertical: spacing.xs, paddingHorizontal: spacing.md,
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.oliveBorder,
  },
  filterBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: fontSize.sm, color: colors.textMuted },
  filterTextActive: { color: colors.white, fontWeight: '500' },
  list: { padding: spacing.base, gap: spacing.sm },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  taskTitle: { fontSize: fontSize.base, fontWeight: '500', color: colors.text, flex: 1, marginRight: spacing.sm },
  priority: { fontSize: fontSize.xs, fontWeight: '600' },
  cardMeta: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs, flexWrap: 'wrap' },
  metaText: { fontSize: fontSize.xs, color: colors.textMuted },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill, marginTop: spacing.sm },
  statusText: { fontSize: fontSize.xs, fontWeight: '600', textTransform: 'capitalize' },
  progressBar: { height: 4, backgroundColor: colors.border, borderRadius: 2, marginTop: spacing.sm, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 2 },
  empty: { textAlign: 'center', color: colors.textMuted, fontSize: fontSize.sm, padding: spacing.xl, fontStyle: 'italic' },
});
