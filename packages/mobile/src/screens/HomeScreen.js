// screens/HomeScreen.js — Mobile home dashboard
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  TouchableOpacity, Modal, FlatList, StatusBar, Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useProperty } from '../contexts/PropertyContext';
import { colors, spacing, fontSize, radius, shadows } from '../styles/theme';
import { tasksService, observationService, notificationService, visitorService } from '../api/services';
import { SOURCE_ICONS, SkeletonCard } from '../components';
import ConditionsHero from '../components/ConditionsHero';

const LOGO_MARK = require('../../assets/brand/logo-mark.png');

export default function HomeScreen({ navigation }) {
  const { user, isManagerOrAbove } = useAuth();
  const { properties, selectedPropertyId, selectedProperty, setSelectedPropertyId } = useProperty();
  const insets = useSafeAreaInsets();
  const firstName = user?.first_name || user?.name?.split(' ')?.[0] || 'there';
  const [upcomingTasks, setUpcomingTasks] = useState([]);
  const [activeRuns, setActiveRuns] = useState([]);
  const [showPropertyPicker, setShowPropertyPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fabOpen, setFabOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeVisitorCount, setActiveVisitorCount] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tasksRes, runsRes, unreadRes, visitorsRes] = await Promise.all([
        tasksService.getUnifiedFeed({ days_ahead: 7 }).catch(() => []),
        observationService.listRuns({ active_only: true }).catch(() => []),
        notificationService.getUnreadCount().catch(() => null),
        visitorService.listActive().catch(() => []),
      ]);
      setUpcomingTasks(Array.isArray(tasksRes) ? tasksRes.slice(0, 6) : []);
      setActiveRuns(Array.isArray(runsRes) ? runsRes : []);
      setUnreadCount(unreadRes?.count ?? 0);
      setActiveVisitorCount(Array.isArray(visitorsRes) ? visitorsRes.length : 0);
    } catch (err) {
      console.log('Home load failed:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // Tile counts
  const counts = useMemo(() => {
    const tasks = upcomingTasks.filter(t => t.source === 'task').length;
    const maintenance = upcomingTasks.filter(t => t.source === 'maintenance').length;
    const overdue = upcomingTasks.filter(t => t.is_overdue).length;
    return { tasks, maintenance, overdue, runs: activeRuns.length };
  }, [upcomingTasks, activeRuns]);

  const statusColor = (s) => {
    const k = String(s || '').toLowerCase();
    if (k === 'in_progress') return colors.warning;
    if (k === 'scheduled' || k === 'ready') return colors.info;
    if (k === 'completed') return colors.success;
    if (k === 'overdue') return colors.danger;
    return colors.textMuted;
  };

  const formatDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    return d.toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Brand header */}
      <SafeAreaView edges={['top']} style={styles.headerSafe}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <Image source={LOGO_MARK} style={styles.brandMark} resizeMode="contain" />
            <Text style={styles.brandWordmark}>Auxein Grow</Text>
          </View>
          <TouchableOpacity
            style={styles.bellBtn}
            onPress={() => navigation.navigate('Profile', { screen: 'Notifications' })}
            hitSlop={10}
          >
            <Feather name="bell" size={20} color={colors.white} />
            {unreadCount > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Property switcher + onsite chip — context bar below header.
          Manager+ users get an "All properties" option (handled in the picker
          modal below) which surfaces unscoped data across all visible properties. */}
      {properties.length > 0 && (
        <View style={styles.contextBar}>
          <TouchableOpacity
            style={styles.propertyPill}
            onPress={() => (properties.length > 1 || isManagerOrAbove) && setShowPropertyPicker(true)}
            activeOpacity={(properties.length > 1 || isManagerOrAbove) ? 0.7 : 1}
          >
            <Feather
              name={selectedPropertyId === null ? 'globe' : 'map-pin'}
              size={16}
              color={colors.primary}
            />
            <Text style={styles.propertyName} numberOfLines={1}>
              {selectedPropertyId === null ? 'All properties' : (selectedProperty?.name || '—')}
            </Text>
            {(properties.length > 1 || isManagerOrAbove) && (
              <Feather name="chevron-down" size={16} color={colors.textMuted} />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.onsiteChip}
            onPress={() => navigation.navigate('Visitors')}
            activeOpacity={0.7}
          >
            <Feather name="users" size={14} color={colors.primary} />
            <Text style={styles.onsiteText}>
              {activeVisitorCount > 0 ? `${activeVisitorCount} on site` : 'On site'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={loadData}
            tintColor={colors.primary}
            progressViewOffset={8}
          />
        }
      >
        {/* Conditions hero — static satellite-map preview of the active property
            (blocks + task badges) + greeting + status badge + weather strip.
            Purely informational — no tap behaviour. Weather is null-tolerant so
            an offline / unconfigured property still renders cleanly. */}
        <ConditionsHero firstName={firstName} />

        {/* At-a-glance tiles */}
        <View style={styles.tileGrid}>
          <StatTile
            icon="clipboard"
            iconBg={colors.primary + '18'}
            iconColor={colors.primary}
            label="Upcoming tasks"
            value={counts.tasks}
            onPress={() => navigation.navigate('Tasks')}
          />
          <StatTile
            icon="alert-triangle"
            iconBg={counts.overdue > 0 ? colors.dangerBg : colors.borderLight}
            iconColor={counts.overdue > 0 ? colors.danger : colors.textMuted}
            label="Overdue tasks"
            value={counts.overdue}
            onPress={() => navigation.navigate('Tasks')}
          />
          <StatTile
            icon="tool"
            iconBg="#E67E2218"
            iconColor="#E67E22"
            label="Maintenance due"
            value={counts.maintenance}
            onPress={() => navigation.navigate('Tasks')}
          />
          <StatTile
            icon="search"
            iconBg={colors.gpsBg}
            iconColor={colors.success}
            label="Active observations"
            value={counts.runs}
            onPress={() => navigation.navigate('Observe')}
          />
        </View>

        {/* Active observation runs */}
        {activeRuns.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>In progress</Text>
              <Text style={styles.sectionHint}>Tap to resume</Text>
            </View>
            {activeRuns.slice(0, 2).map(run => (
              <TouchableOpacity
                key={run.id}
                style={styles.runCard}
                onPress={() => navigation.navigate('Observe', {
                  screen: 'SpotCapture',
                  params: {
                    runId: run.id,
                    templateId: run.template_id,
                    blockId: run.block_id,
                    blockName: run.block_name,
                    templateName: run.template_name || run.name,
                    companyId: user?.company_id,
                  },
                })}
              >
                <View style={styles.runDot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.runTitle} numberOfLines={1}>
                    {run.template_name || run.name}
                  </Text>
                  <Text style={styles.runMeta}>
                    {run.block_name || 'No block'}
                    {run.spots_count != null ? ` · ${run.spots_count} spot${run.spots_count !== 1 ? 's' : ''}` : ''}
                  </Text>
                </View>
                <Feather name="chevron-right" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Upcoming tasks */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Upcoming</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Tasks')}>
              <Text style={styles.sectionLink}>View all</Text>
            </TouchableOpacity>
          </View>

          {loading && upcomingTasks.length === 0 ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : upcomingTasks.length === 0 ? (
            <View style={styles.emptyCard}>
              <Feather name="check-circle" size={24} color={colors.success} />
              <Text style={styles.emptyText}>All caught up — no upcoming work</Text>
            </View>
          ) : (
            upcomingTasks.map(t => {
              const src = SOURCE_ICONS[t.source] || SOURCE_ICONS.task;
              return (
                <TouchableOpacity
                  key={`${t.source}-${t.id}`}
                  style={styles.taskCard}
                  onPress={() => t.source === 'task' && navigation.navigate('Tasks', {
                    screen: 'TaskDetail',
                    params: { taskId: t.id },
                  })}
                  activeOpacity={0.75}
                >
                  <View style={[styles.taskIconBox, { backgroundColor: src.accent + '18' }]}>
                    <Feather name={src.icon} size={18} color={src.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.taskTitle} numberOfLines={1}>
                      {t.title || `Task #${t.id}`}
                    </Text>
                    <Text style={styles.taskMeta} numberOfLines={1}>
                      {formatDate(t.scheduled_date)}
                      {t.asset_name ? ` · ${t.asset_name}` : ''}
                      {t.block_name ? ` · ${t.block_name}` : ''}
                    </Text>
                  </View>
                  <View style={[styles.statusDot, { backgroundColor: statusColor(t.status) }]} />
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <View style={{ height: 96 }} />
      </ScrollView>

      {/* Log FAB */}
      {fabOpen && (
        <TouchableOpacity
          style={styles.fabBackdrop}
          activeOpacity={1}
          onPress={() => setFabOpen(false)}
        />
      )}
      <View style={styles.fabStack} pointerEvents="box-none">
        {fabOpen && (
          <>
            <FabOption
              icon="search"
              label="Observation"
              color={colors.success}
              onPress={() => { setFabOpen(false); navigation.navigate('Observe'); }}
            />
            <FabOption
              icon="alert-octagon"
              label="Incident"
              color={colors.danger}
              onPress={() => { setFabOpen(false); navigation.navigate('CreateIncident'); }}
            />
            <FabOption
              icon="alert-triangle"
              label="Risk"
              color={colors.warning}
              onPress={() => { setFabOpen(false); navigation.navigate('CreateRisk'); }}
            />
            <FabOption
              icon="user-plus"
              label="Visitor"
              color={colors.primary}
              onPress={() => { setFabOpen(false); navigation.navigate('CreateVisitor'); }}
            />
            <FabOption
              icon="clipboard"
              label="Task"
              color={colors.primary}
              onPress={() => {
                setFabOpen(false);
                navigation.navigate('Tasks', { screen: 'CreateTask' });
              }}
            />
          </>
        )}
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setFabOpen(!fabOpen)}
          activeOpacity={0.85}
        >
          <Feather name={fabOpen ? 'x' : 'plus'} size={24} color={colors.white} />
          {!fabOpen && <Text style={styles.fabText}>Log</Text>}
        </TouchableOpacity>
      </View>

      {/* Property picker modal */}
      <Modal visible={showPropertyPicker} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowPropertyPicker(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.modalSheet, { paddingBottom: spacing.lg + insets.bottom }]}
          >
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Switch property</Text>
            {isManagerOrAbove && (
              <TouchableOpacity
                style={styles.propertyItem}
                onPress={() => {
                  setSelectedPropertyId(null);
                  setShowPropertyPicker(false);
                }}
              >
                <Feather
                  name={selectedPropertyId === null ? 'check-circle' : 'globe'}
                  size={18}
                  color={selectedPropertyId === null ? colors.success : colors.textMuted}
                />
                <Text style={styles.propertyItemName}>All properties</Text>
              </TouchableOpacity>
            )}
            <FlatList
              data={properties}
              keyExtractor={p => String(p.id)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.propertyItem}
                  onPress={() => {
                    setSelectedPropertyId(item.id);
                    setShowPropertyPicker(false);
                  }}
                >
                  <Feather
                    name={item.id === selectedPropertyId ? 'check-circle' : 'circle'}
                    size={18}
                    color={item.id === selectedPropertyId ? colors.success : colors.textMuted}
                  />
                  <Text style={styles.propertyItemName}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function StatTile({ icon, iconBg, iconColor, label, value, onPress }) {
  return (
    <TouchableOpacity style={styles.tile} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.tileIcon, { backgroundColor: iconBg }]}>
        <Feather name={icon} size={20} color={iconColor} />
      </View>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function FabOption({ icon, label, color, onPress }) {
  return (
    <TouchableOpacity style={styles.fabOption} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.fabOptionLabel}>
        <Text style={styles.fabOptionText}>{label}</Text>
      </View>
      <View style={[styles.fabOptionIcon, { backgroundColor: color }]}>
        <Feather name={icon} size={18} color={colors.white} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // Header
  headerSafe: { backgroundColor: colors.primary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  brandMark: { width: 28, height: 28 },
  brandWordmark: {
    color: colors.white, fontSize: fontSize.lg, fontWeight: '700',
    letterSpacing: 0.3,
  },
  bellBtn: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  bellBadge: {
    position: 'absolute', top: -4, right: -4,
    backgroundColor: colors.danger, borderRadius: 10,
    paddingHorizontal: 5, paddingVertical: 1, minWidth: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.primary,
  },
  bellBadgeText: { color: colors.white, fontSize: 10, fontWeight: '700' },

  // Context bar (below header, on body bg)
  contextBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  propertyPill: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    flexShrink: 1,
    backgroundColor: colors.borderLight,
    paddingHorizontal: spacing.base, paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border,
  },
  propertyName: { color: colors.text, fontSize: fontSize.base, fontWeight: '600', flexShrink: 1 },
  onsiteChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.primary + '14',
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.primary + '30',
  },
  onsiteText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '600' },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: spacing.xl },

  // Tiles
  tileGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
    padding: spacing.base, paddingTop: spacing.base,
  },
  tile: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.base,
    borderWidth: 1, borderColor: colors.border,
  },
  tileIcon: {
    width: 36, height: 36, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  tileValue: { fontSize: fontSize.xxl, fontWeight: '700', color: colors.text, lineHeight: 34 },
  tileLabel: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },

  // Sections
  section: { paddingHorizontal: spacing.base, marginTop: spacing.base },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text },
  sectionHint: { fontSize: fontSize.xs, color: colors.textMuted },
  sectionLink: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '600' },

  // Run card
  runCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.warning + '40',
    borderLeftWidth: 3, borderLeftColor: colors.warning,
  },
  runDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.warning },
  runTitle: { fontSize: fontSize.base, fontWeight: '600', color: colors.text },
  runMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },

  // Task card
  taskCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  taskIconBox: {
    width: 36, height: 36, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  taskTitle: { fontSize: fontSize.base, fontWeight: '500', color: colors.text },
  taskMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },

  // Empty
  emptyCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.successBg, borderRadius: radius.lg,
    padding: spacing.base, borderWidth: 1, borderColor: colors.successBorder,
  },
  emptyText: { fontSize: fontSize.sm, color: colors.text, fontWeight: '500', flex: 1 },

  // FAB
  fabBackdrop: {
    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  fabStack: {
    position: 'absolute', bottom: spacing.lg, right: spacing.lg,
    alignItems: 'flex-end', gap: spacing.sm,
  },
  fab: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    backgroundColor: colors.primary, borderRadius: radius.pill,
    ...shadows.elevated,
  },
  fabText: { color: colors.white, fontSize: fontSize.md, fontWeight: '700' },
  fabOption: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fabOptionLabel: {
    backgroundColor: colors.surface, paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: radius.md, ...shadows.card,
  },
  fabOptionText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  fabOptionIcon: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', ...shadows.card,
  },

  // Property picker modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    // paddingBottom is applied inline so we can add the Android gesture-bar inset
    maxHeight: '60%',
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border,
    alignSelf: 'center', marginBottom: spacing.md,
  },
  modalTitle: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text, marginBottom: spacing.md },
  propertyItem: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  propertyItemName: { fontSize: fontSize.base, color: colors.text, fontWeight: '500' },
});
