// components/MapBlockSheet.js — Bottom-sheet shown when the user taps a block
// on the Map. Surfaces block metadata + up to three open-task previews + a
// "View all tasks" link.
//
// Task tap → navigates into the Tasks stack at TaskDetail. View all → switches
// to the Tasks tab (block-filtered TasksScreen is a follow-up).

import {
  View, Text, TouchableOpacity, Modal, StyleSheet, FlatList, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { getBlockStatusMeta, BLOCK_STATUS_DEFAULT } from '@vineyard/shared';
import { colors, spacing, fontSize, radius } from '../styles/theme';

const STATUS_TONE_COLORS = {
  muted:   { bg: colors.surfaceWarm, fg: colors.textMuted },
  info:    { bg: colors.infoBg,      fg: colors.info       },
  warning: { bg: colors.warningBg,   fg: colors.warningDark },
  success: { bg: colors.successBg,   fg: colors.success    },
  danger:  { bg: colors.dangerBg,    fg: colors.danger     },
};

const PREVIEW_LIMIT = 3;
const STATUS_LABEL = {
  scheduled: 'Scheduled',
  ready: 'Ready',
  in_progress: 'In progress',
  completed: 'Done',
  cancelled: 'Cancelled',
};

function formatTaskDate(t) {
  const d = t.start_date || t.due_date;
  if (!d) return null;
  const day = dayjs(d);
  const today = dayjs().startOf('day');
  const diff = day.startOf('day').diff(today, 'day');
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  if (diff > 1 && diff < 7) return `in ${diff} days`;
  if (diff < -1 && diff > -7) return `${Math.abs(diff)} days ago`;
  return day.format('DD MMM');
}

export default function MapBlockSheet({
  visible,
  block,             // GeoJSON feature.properties from MAP.2 (or null when closing)
  tasks = [],        // sorted list from useTasksByBlock.getBlockTasks(block.id)
  onClose,
  onTaskPress,       // (task) => navigation.navigate(...)
  onViewAllTasks,    // () => navigation.navigate('Tasks', ...)
}) {
  const insets = useSafeAreaInsets();
  if (!block) return null;

  const previewTasks = tasks.slice(0, PREVIEW_LIMIT);
  const overflow = Math.max(0, tasks.length - PREVIEW_LIMIT);
  const statusMeta = getBlockStatusMeta(block.status || BLOCK_STATUS_DEFAULT);
  const statusTone = STATUS_TONE_COLORS[statusMeta.tone] || STATUS_TONE_COLORS.muted;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: spacing.xl + insets.bottom }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.iconBox}>
              <Feather name="grid" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.titleRow}>
                <Text style={styles.title} numberOfLines={1}>
                  {block.block_name || `Block #${block.id}`}
                </Text>
                <View style={[styles.statusPill, { backgroundColor: statusTone.bg }]}>
                  <Text style={[styles.statusText, { color: statusTone.fg }]}>{statusMeta.label}</Text>
                </View>
              </View>
              <Text style={styles.subtitle} numberOfLines={1}>
                {[
                  block.variety,
                  block.area ? `${Number(block.area).toFixed(2)} ha` : null,
                ].filter(Boolean).join(' · ') || '—'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Feather name="x" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.tasksHeader}>
            <Text style={styles.sectionTitle}>
              Open tasks <Text style={styles.sectionCount}>({tasks.length})</Text>
            </Text>
            {tasks.length > 0 && (
              <TouchableOpacity onPress={onViewAllTasks} hitSlop={8}>
                <Text style={styles.viewAll}>View all</Text>
              </TouchableOpacity>
            )}
          </View>

          {tasks.length === 0 ? (
            <View style={styles.empty}>
              <Feather name="check-circle" size={18} color={colors.textMuted} />
              <Text style={styles.emptyText}>No open tasks on this block.</Text>
            </View>
          ) : (
            <FlatList
              data={previewTasks}
              keyExtractor={(t) => String(t.id)}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={styles.sep} />}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.taskRow}
                  onPress={() => onTaskPress?.(item)}
                  accessibilityLabel={`Open task: ${item.task_name || item.title || 'Task'}`}
                >
                  <View style={styles.taskRowMain}>
                    <Text style={styles.taskName} numberOfLines={1}>
                      {item.task_name || item.title || `Task #${item.id}`}
                    </Text>
                    <Text style={styles.taskMeta} numberOfLines={1}>
                      {[
                        STATUS_LABEL[item.status] || item.status,
                        formatTaskDate(item),
                      ].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              )}
              ListFooterComponent={
                overflow > 0 ? (
                  <Text style={styles.overflowText}>
                    +{overflow} more — tap View all
                  </Text>
                ) : null
              }
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    // paddingBottom is applied inline so we can add the Android gesture-bar inset
    maxHeight: '75%',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center', marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  iconBox: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: colors.primary + '14',
    alignItems: 'center', justifyContent: 'center',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  title: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text },
  subtitle: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  statusPill: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill },
  statusText: { fontSize: 10, fontWeight: '700' },

  tasksHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitle: { fontSize: fontSize.base, fontWeight: '600', color: colors.text },
  sectionCount: { color: colors.textMuted, fontWeight: '500' },
  viewAll: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '500' },

  empty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  emptyText: { fontSize: fontSize.sm, color: colors.textMuted },

  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  taskRowMain: { flex: 1 },
  taskName: { fontSize: fontSize.base, fontWeight: '500', color: colors.text },
  taskMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  sep: { height: 1, backgroundColor: colors.borderLight },

  overflowText: {
    paddingTop: spacing.md,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
