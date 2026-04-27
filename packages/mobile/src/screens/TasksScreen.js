// screens/TasksScreen.js — Unified feed: tasks, maintenance, calibrations, risk actions
import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fontSize, radius } from '../styles/theme';
import { tasksService } from '../api/services';
import FeedItemModal from '../components/FeedItemModal';
import { SOURCE_ICONS, SkeletonCard } from '../components';

const SOURCE_LABELS = {
  task: 'Task',
  maintenance: 'Maintenance',
  calibration: 'Calibration',
  risk_action: 'Risk Action',
};

const FILTERS = ['all', 'task', 'maintenance', 'calibration', 'risk_action'];

export default function TasksScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selectedItem, setSelectedItem] = useState(null);

  const loadFeed = useCallback(async () => {
    setLoading(true);
    try {
      const data = await tasksService.getUnifiedFeed({ days_ahead: 30 });
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.log('Failed to load feed:', err.message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFeed(); }, [loadFeed]);

  const filtered = filter === 'all' ? items : items.filter(i => i.source === filter);

  const statusColor = (s) => {
    const k = String(s || '').toLowerCase();
    if (k === 'in_progress') return colors.warning;
    if (k === 'scheduled' || k === 'ready' || k === 'due') return colors.info;
    if (k === 'completed' || k === 'pass') return colors.success;
    if (k === 'cancelled' || k === 'overdue') return colors.danger;
    return colors.textMuted;
  };

  const handlePress = (item) => {
    if (item.source === 'task') {
      navigation.navigate('TaskDetail', { taskId: item.id });
    } else {
      setSelectedItem(item);
    }
  };

  const renderItem = ({ item }) => {
    const src = SOURCE_ICONS[item.source] || SOURCE_ICONS.task;
    const label = SOURCE_LABELS[item.source] || 'Task';

    return (
      <TouchableOpacity
        style={[styles.card, item.is_overdue && styles.cardOverdue]}
        onPress={() => handlePress(item)}
        activeOpacity={0.75}
      >
        <View style={[styles.sourceStrip, { backgroundColor: src.accent }]} />

        <View style={styles.cardBody}>
          <View style={styles.cardHeader}>
            <View style={styles.titleRow}>
              <View style={[styles.sourceIconBox, { backgroundColor: src.accent + '18' }]}>
                <Feather name={src.icon} size={14} color={src.accent} />
              </View>
              <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
            </View>
            {item.is_overdue && (
              <View style={styles.overdueBadge}>
                <Feather name="alert-triangle" size={10} color={colors.danger} />
                <Text style={styles.overdueText}>OVERDUE</Text>
              </View>
            )}
          </View>

          <View style={styles.cardMeta}>
            <View style={[styles.sourceBadge, { backgroundColor: src.accent + '14' }]}>
              <Text style={[styles.sourceBadgeText, { color: src.accent }]}>{label}</Text>
            </View>
            {item.scheduled_date && (
              <View style={styles.metaRow}>
                <Feather name="calendar" size={11} color={colors.textMuted} />
                <Text style={styles.metaText}>
                  {new Date(item.scheduled_date).toLocaleDateString('en-NZ', { month: 'short', day: 'numeric' })}
                </Text>
              </View>
            )}
            {item.asset_name && (
              <View style={styles.metaRow}>
                <Feather name="package" size={11} color={colors.textMuted} />
                <Text style={styles.metaText}>{item.asset_name}</Text>
              </View>
            )}
            {item.block_name && (
              <View style={styles.metaRow}>
                <Feather name="grid" size={11} color={colors.textMuted} />
                <Text style={styles.metaText}>{item.block_name}</Text>
              </View>
            )}
          </View>

          <View style={styles.cardFooter}>
            <View style={[styles.statusBadge, { backgroundColor: statusColor(item.status) + '18' }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor(item.status) }]} />
              <Text style={[styles.statusText, { color: statusColor(item.status) }]}>
                {(item.status || 'draft').replace(/_/g, ' ')}
              </Text>
            </View>
            {item.task_number && <Text style={styles.taskNumber}>{item.task_number}</Text>}
          </View>

          {item.progress_percentage > 0 && item.progress_percentage < 100 && (
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${item.progress_percentage}%`, backgroundColor: src.accent }]} />
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Filter pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterContent}
      >
        {FILTERS.map(f => {
          const isActive = filter === f;
          const src = f !== 'all' ? SOURCE_ICONS[f] : null;
          const label = f === 'all' ? 'All' : SOURCE_LABELS[f];
          return (
            <TouchableOpacity
              key={f}
              style={[styles.filterPill, isActive && styles.filterPillActive]}
              onPress={() => setFilter(f)}
            >
              {src && (
                <Feather
                  name={src.icon}
                  size={16}
                  color={isActive ? colors.white : src.accent}
                />
              )}
              <Text style={[styles.filterText, isActive && styles.filterTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading && items.length === 0 ? (
        <View style={styles.list}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => `${item.source}-${item.id}`}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={loadFeed} tintColor={colors.primary} />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.empty}>
                <Feather name="inbox" size={40} color={colors.textMuted} />
                <Text style={styles.emptyText}>Nothing here</Text>
                <Text style={styles.emptyHint}>Pull down to refresh</Text>
              </View>
            ) : null
          }
        />
      )}

      <FeedItemModal
        visible={!!selectedItem}
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onComplete={loadFeed}
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('CreateTask')}
        activeOpacity={0.85}
      >
        <Feather name="plus" size={24} color={colors.white} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // Filter pills
  filterScroll: {
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
    maxHeight: 60,
  },
  filterContent: {
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
    gap: spacing.xs, alignItems: 'center',
  },
  filterPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: spacing.base, paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: fontSize.sm, fontWeight: '500', color: colors.text },
  filterTextActive: { color: colors.white, fontWeight: '600' },

  // List
  list: { padding: spacing.base, gap: spacing.sm, paddingBottom: spacing.xxl },

  // Card
  card: {
    flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  cardOverdue: { borderColor: colors.danger, borderWidth: 1.5 },
  sourceStrip: { width: 4 },
  cardBody: { flex: 1, padding: spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: spacing.sm },
  sourceIconBox: {
    width: 26, height: 26, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  itemTitle: { fontSize: fontSize.base, fontWeight: '500', color: colors.text, flex: 1 },
  overdueBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: colors.dangerBg, paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: radius.pill,
  },
  overdueText: { fontSize: 9, fontWeight: '700', color: colors.danger },

  // Meta
  cardMeta: {
    flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm,
    flexWrap: 'wrap', alignItems: 'center',
  },
  sourceBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill },
  sourceBadgeText: { fontSize: 10, fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: fontSize.xs, color: colors.textMuted },

  // Footer
  cardFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: spacing.sm,
  },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: 3,
    borderRadius: radius.pill,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: fontSize.xs, fontWeight: '600', textTransform: 'capitalize' },
  taskNumber: { fontSize: fontSize.xs, color: colors.textMuted, fontVariant: ['tabular-nums'] },

  // Progress
  progressBar: { height: 4, backgroundColor: colors.borderLight, borderRadius: 2, marginTop: spacing.sm, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },

  // Empty
  empty: { alignItems: 'center', paddingTop: spacing.xxl, gap: spacing.sm },
  emptyText: { fontSize: fontSize.md, color: colors.text, fontWeight: '600', marginTop: spacing.sm },
  emptyHint: { fontSize: fontSize.sm, color: colors.textMuted },

  // FAB
  fab: {
    position: 'absolute', bottom: spacing.lg, right: spacing.lg,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000', shadowOpacity: 0.18, shadowOffset: { width: 0, height: 3 }, shadowRadius: 6,
  },
});
