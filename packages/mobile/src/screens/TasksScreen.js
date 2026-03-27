// screens/TasksScreen.js — Unified feed: tasks, maintenance, calibrations, risk actions
import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { colors, spacing, fontSize, radius } from '../styles/theme';
import { tasksService } from '../api/services';
import FeedItemModal from '../components/FeedItemModal';

// Source config: icon, accent colour, label
const SOURCE_CONFIG = {
  task:        { icon: '📋', accent: colors.primary,  label: 'Task' },
  maintenance: { icon: '🔧', accent: '#E67E22',       label: 'Maintenance' },
  calibration: { icon: '⚙️', accent: '#8E44AD',       label: 'Calibration' },
  risk_action: { icon: '⚠️', accent: '#E74C3C',       label: 'Risk Action' },
};

export default function TasksScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all | task | maintenance | calibration | risk_action
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
    if (k === 'cancelled') return colors.danger;
    if (k === 'overdue') return colors.danger;
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
    const src = SOURCE_CONFIG[item.source] || SOURCE_CONFIG.task;

    return (
      <TouchableOpacity
        style={[styles.card, item.is_overdue && styles.cardOverdue]}
        onPress={() => handlePress(item)}
        activeOpacity={item.source === 'task' ? 0.7 : 0.9}
      >
        {/* Source indicator strip */}
        <View style={[styles.sourceStrip, { backgroundColor: src.accent }]} />

        <View style={styles.cardBody}>
          <View style={styles.cardHeader}>
            <View style={styles.titleRow}>
              <Text style={styles.sourceIcon}>{src.icon}</Text>
              <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
            </View>
            {item.is_overdue && (
              <View style={styles.overdueBadge}>
                <Text style={styles.overdueText}>OVERDUE</Text>
              </View>
            )}
          </View>

          <View style={styles.cardMeta}>
            <View style={[styles.sourceBadge, { backgroundColor: src.accent + '18' }]}>
              <Text style={[styles.sourceBadgeText, { color: src.accent }]}>{src.label}</Text>
            </View>
            {item.scheduled_date && (
              <Text style={styles.metaText}>
                {new Date(item.scheduled_date).toLocaleDateString('en-NZ', { month: 'short', day: 'numeric' })}
              </Text>
            )}
            {item.asset_name && <Text style={styles.metaText}>{item.asset_name}</Text>}
            {item.block_name && <Text style={styles.metaText}>{item.block_name}</Text>}
            {item.category ? <Text style={styles.metaText}>{item.category.replace(/_/g, ' ')}</Text> : null}
          </View>

          <View style={styles.cardFooter}>
            <View style={[styles.statusBadge, { backgroundColor: statusColor(item.status) + '20' }]}>
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
      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {['all', 'task', 'maintenance', 'calibration', 'risk_action'].map(f => {
          const label = f === 'all' ? 'All' : (SOURCE_CONFIG[f]?.label || f);
          const icon = f === 'all' ? '' : (SOURCE_CONFIG[f]?.icon || '') + ' ';
          return (
            <TouchableOpacity
              key={f}
              style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                {icon}{label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => `${item.source}-${item.id}`}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadFeed} tintColor={colors.primary} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !loading ? <Text style={styles.empty}>No items found</Text> : null
        }
      />

      <FeedItemModal
        visible={!!selectedItem}
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onComplete={loadFeed}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceWarm },
  filterRow: {
    flexDirection: 'row', gap: spacing.xs,
    padding: spacing.sm, paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  filterBtn: {
    paddingVertical: spacing.xs, paddingHorizontal: spacing.sm,
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.oliveBorder,
  },
  filterBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: 11, color: colors.textMuted },
  filterTextActive: { color: colors.white, fontWeight: '500' },
  list: { padding: spacing.base, gap: spacing.sm },

  // Card
  card: {
    flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  cardOverdue: { borderColor: colors.danger, borderWidth: 1.5 },
  sourceStrip: { width: 4 },
  cardBody: { flex: 1, padding: spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: spacing.xs },
  sourceIcon: { fontSize: 16 },
  itemTitle: { fontSize: fontSize.base, fontWeight: '500', color: colors.text, flex: 1 },
  overdueBadge: { backgroundColor: colors.danger + '20', paddingHorizontal: spacing.xs, paddingVertical: 1, borderRadius: radius.pill },
  overdueText: { fontSize: 9, fontWeight: '700', color: colors.danger },

  // Meta
  cardMeta: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs, flexWrap: 'wrap', alignItems: 'center' },
  sourceBadge: { paddingHorizontal: spacing.xs, paddingVertical: 1, borderRadius: radius.pill },
  sourceBadgeText: { fontSize: 10, fontWeight: '600' },
  metaText: { fontSize: fontSize.xs, color: colors.textMuted },

  // Footer
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill },
  statusText: { fontSize: fontSize.xs, fontWeight: '600', textTransform: 'capitalize' },
  taskNumber: { fontSize: fontSize.xs, color: colors.textMuted },

  // Progress
  progressBar: { height: 4, backgroundColor: colors.border, borderRadius: 2, marginTop: spacing.sm, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },

  empty: { textAlign: 'center', color: colors.textMuted, fontSize: fontSize.sm, padding: spacing.xl, fontStyle: 'italic' },
});
