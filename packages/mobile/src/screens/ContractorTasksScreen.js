// screens/ContractorTasksScreen.js — Contractor's own task assignments across
// every company they have a relationship with. Replaces the unified-feed TasksScreen
// for contractor accounts (which don't see maintenance / calibrations / risk actions).
//
// Backend: GET /v1/contractor-management/me/assignments
// Tap a row → existing TaskDetail screen via task_id. Ad-hoc assignments
// (task_id is null) open a lightweight inline detail sheet — there's no Task
// row to navigate into.
import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, fontSize, radius, shadows } from '../styles/theme';
import { contractorService } from '../api/services';
import { SkeletonCard, useToast } from '../components';

const STATUS_STYLE = {
  assigned:    { bg: colors.info + '20',    fg: colors.info,    label: 'Assigned' },
  accepted:    { bg: colors.primary + '20', fg: colors.primary, label: 'Accepted' },
  in_progress: { bg: colors.warning + '20', fg: colors.warningDark, label: 'In progress' },
  paused:      { bg: colors.textMuted + '20', fg: colors.textMuted, label: 'Paused' },
  completed:   { bg: colors.success + '20', fg: colors.success, label: 'Completed' },
  cancelled:   { bg: colors.danger + '20',  fg: colors.danger,  label: 'Cancelled' },
  rejected:    { bg: colors.danger + '20',  fg: colors.danger,  label: 'Rejected' },
};

const PRIORITY_COLOR = {
  urgent: colors.danger,
  high:   colors.warning,
  medium: colors.textMuted,
  low:    colors.textMuted,
};

const FILTERS = [
  { value: 'active', label: 'Active' },
  { value: 'all',    label: 'All' },
];

const formatScheduled = (start, end) => {
  if (!start && !end) return 'No date set';
  const opts = { weekday: 'short', day: 'numeric', month: 'short' };
  if (start && end) {
    const s = new Date(start);
    const e = new Date(end);
    if (s.toDateString() === e.toDateString()) {
      return s.toLocaleDateString('en-NZ', opts);
    }
    return `${s.toLocaleDateString('en-NZ', opts)} → ${e.toLocaleDateString('en-NZ', opts)}`;
  }
  return new Date(start || end).toLocaleDateString('en-NZ', opts);
};

export default function ContractorTasksScreen({ navigation }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('active');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = filter === 'all' ? { include_completed: true } : {};
      const data = await contractorService.listMyAssignments(params);
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.log('Contractor assignments load failed:', err.message);
      toast.show('Could not load tasks', 'error');
    } finally {
      setLoading(false);
    }
  }, [filter, toast]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const counts = useMemo(() => {
    const overdue = items.filter(i => i.is_overdue).length;
    return { total: items.length, overdue };
  }, [items]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" />

      {/* Filter chips */}
      <View style={styles.filterBar}>
        <View style={styles.filterChips}>
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f.value}
              style={[styles.chip, filter === f.value && styles.chipActive]}
              onPress={() => setFilter(f.value)}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, filter === f.value && styles.chipTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {counts.overdue > 0 && (
          <View style={styles.overduePill}>
            <Feather name="alert-triangle" size={12} color={colors.danger} />
            <Text style={styles.overdueText}>
              {counts.overdue} overdue
            </Text>
          </View>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />
        }
      >
        {loading && items.length === 0 ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : items.length === 0 ? (
          <View style={styles.emptyCard}>
            <Feather name="check-circle" size={28} color={colors.success} />
            <Text style={styles.emptyTitle}>
              {filter === 'active' ? 'Nothing scheduled' : 'No tasks yet'}
            </Text>
            <Text style={styles.emptyBody}>
              {filter === 'active'
                ? 'When a company assigns you work, it will appear here.'
                : 'Once you complete jobs they\'ll show in your history.'}
            </Text>
          </View>
        ) : (
          items.map(a => <AssignmentRow key={a.id} a={a} navigation={navigation} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function AssignmentRow({ a, navigation }) {
  const statusStyle = STATUS_STYLE[a.status] || STATUS_STYLE.assigned;
  const priorityColor = PRIORITY_COLOR[a.priority] || colors.textMuted;
  const handlePress = () => {
    if (a.task_id) {
      navigation.navigate('TaskDetail', { taskId: a.task_id });
    } else {
      // Ad-hoc work has no Task row to open — defer until we build a contractor
      // assignment detail screen.
      navigation.navigate('TaskDetail', { taskId: null, assignmentId: a.id });
    }
  };

  return (
    <TouchableOpacity style={styles.card} onPress={handlePress} activeOpacity={0.85}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.title} numberOfLines={2}>{a.title}</Text>
          <View style={styles.badgeRow}>
            <View style={styles.companyBadge}>
              <Feather name="briefcase" size={10} color={colors.primary} />
              <Text style={styles.companyText} numberOfLines={1}>{a.company_name}</Text>
            </View>
            {a.property_name && (
              <View style={styles.propertyBadge}>
                <Feather name="map-pin" size={10} color={colors.text} />
                <Text style={styles.propertyText} numberOfLines={1}>{a.property_name}</Text>
              </View>
            )}
            {a.block_name && (
              <View style={styles.blockBadge}>
                <Text style={styles.blockText} numberOfLines={1}>{a.block_name}</Text>
              </View>
            )}
          </View>
        </View>
        <View style={[styles.statusPill, { backgroundColor: statusStyle.bg }]}>
          <Text style={[styles.statusText, { color: statusStyle.fg }]}>{statusStyle.label}</Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        <Feather name="calendar" size={12} color={colors.textMuted} />
        <Text style={styles.metaText}>{formatScheduled(a.scheduled_start, a.scheduled_end)}</Text>
        {a.priority && a.priority !== 'medium' && (
          <>
            <Text style={styles.metaDot}>·</Text>
            <View style={[styles.priorityDot, { backgroundColor: priorityColor }]} />
            <Text style={[styles.metaText, { color: priorityColor, textTransform: 'capitalize' }]}>
              {a.priority}
            </Text>
          </>
        )}
        {a.estimated_hours != null && (
          <>
            <Text style={styles.metaDot}>·</Text>
            <Text style={styles.metaText}>{a.estimated_hours}h est</Text>
          </>
        )}
      </View>

      {a.is_overdue && (
        <View style={styles.overdueRow}>
          <Feather name="alert-triangle" size={12} color={colors.danger} />
          <Text style={styles.overdueText}>
            {a.days_overdue > 0 ? `${a.days_overdue}d overdue` : 'Overdue'}
          </Text>
        </View>
      )}

      {a.completion_percentage > 0 && a.completion_percentage < 100 && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${a.completion_percentage}%` }]} />
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },

  filterBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  filterChips: { flexDirection: 'row', gap: 6 },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.borderLight,
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  chipTextActive: { color: colors.white },

  overduePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.danger + '15',
  },

  content: { padding: spacing.base, paddingBottom: spacing.xl },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.base,
    marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
    ...shadows.card,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  title: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },

  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  companyBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 6, paddingVertical: 2,
    backgroundColor: colors.primary + '15',
    borderRadius: radius.pill,
  },
  companyText: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '600' },
  propertyBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 6, paddingVertical: 2,
    backgroundColor: colors.borderLight,
    borderRadius: radius.pill,
  },
  propertyText: { fontSize: fontSize.xs, color: colors.text, fontWeight: '500' },
  blockBadge: {
    paddingHorizontal: 6, paddingVertical: 2,
    backgroundColor: colors.surfaceWarm,
    borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border,
  },
  blockText: { fontSize: fontSize.xs, color: colors.textMuted },

  statusPill: {
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: radius.pill,
    flexShrink: 0,
  },
  statusText: { fontSize: fontSize.xs, fontWeight: '700' },

  metaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: spacing.sm,
    flexWrap: 'wrap',
  },
  metaText: { fontSize: fontSize.xs, color: colors.textMuted },
  metaDot: { fontSize: fontSize.xs, color: colors.textMuted, marginHorizontal: 2 },
  priorityDot: { width: 6, height: 6, borderRadius: 3 },

  overdueRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.borderLight,
  },
  overdueText: { fontSize: fontSize.xs, color: colors.danger, fontWeight: '700' },

  progressTrack: {
    height: 4, borderRadius: 2,
    backgroundColor: colors.borderLight,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.primary },

  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  emptyTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.text, marginTop: spacing.sm },
  emptyBody: {
    fontSize: fontSize.sm, color: colors.textMuted,
    textAlign: 'center', lineHeight: 20,
  },
});
