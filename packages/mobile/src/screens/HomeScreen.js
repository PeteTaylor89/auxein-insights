// screens/HomeScreen.js — Mobile home dashboard
import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { colors, spacing, fontSize, radius } from '../styles/theme';
import { tasksService } from '../api/services';

export default function HomeScreen({ navigation }) {
  const { user } = useAuth();
  const [upcomingTasks, setUpcomingTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await tasksService.getUnifiedFeed({ days_ahead: 7 });
      setUpcomingTasks(Array.isArray(data) ? data.slice(0, 5) : []);
    } catch (err) {
      console.log('Failed to load tasks:', err.message);
      setUpcomingTasks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const statusColor = (s) => {
    const k = String(s || '').toLowerCase();
    if (k === 'in_progress') return colors.warning;
    if (k === 'scheduled' || k === 'ready') return colors.info;
    if (k === 'completed') return colors.success;
    return colors.textMuted;
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={loadData} tintColor={colors.primary} />}
    >
      {/* Welcome */}
      <View style={styles.welcomeCard}>
        <Text style={styles.welcomeText}>Welcome back,</Text>
        <Text style={styles.welcomeName}>{user?.first_name || user?.username || 'User'}</Text>
      </View>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionCard} onPress={() => navigation.navigate('Tasks')}>
            <Text style={styles.actionIcon}>📋</Text>
            <Text style={styles.actionLabel}>My Tasks</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionCard} onPress={() => navigation.navigate('Observations')}>
            <Text style={styles.actionIcon}>🔍</Text>
            <Text style={styles.actionLabel}>Quick Obs</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Upcoming Tasks */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Upcoming Tasks</Text>
        {upcomingTasks.length === 0 ? (
          <Text style={styles.emptyText}>No upcoming tasks</Text>
        ) : (
          upcomingTasks.map(t => {
            const icons = { task: '📋', maintenance: '🔧', calibration: '⚙️', risk_action: '⚠️' };
            return (
              <TouchableOpacity
                key={`${t.source}-${t.id}`}
                style={styles.taskCard}
                onPress={() => t.source === 'task' && navigation.navigate('Tasks', { screen: 'TaskDetail', params: { taskId: t.id } })}
              >
                <View style={styles.taskHeader}>
                  <Text style={styles.taskTitle} numberOfLines={1}>
                    {icons[t.source] || '📋'} {t.title || `Task #${t.id}`}
                  </Text>
                  <View style={[styles.statusBadge, { backgroundColor: statusColor(t.status) + '20' }]}>
                    <Text style={[styles.statusText, { color: statusColor(t.status) }]}>
                      {(t.status || 'draft').replace(/_/g, ' ')}
                    </Text>
                  </View>
                </View>
                <Text style={styles.taskMeta}>
                  {t.scheduled_date
                    ? new Date(t.scheduled_date).toLocaleDateString('en-NZ', { month: 'short', day: 'numeric' })
                    : ''}
                  {t.asset_name ? ` · ${t.asset_name}` : ''}
                  {t.block_name ? ` · ${t.block_name}` : ''}
                </Text>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      <View style={{ height: spacing.xxl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceWarm },
  welcomeCard: {
    backgroundColor: colors.primary, padding: spacing.lg,
    paddingTop: spacing.xl, paddingBottom: spacing.lg,
  },
  welcomeText: { color: 'rgba(255,255,255,0.8)', fontSize: fontSize.sm },
  welcomeName: { color: colors.white, fontSize: fontSize.xl, fontWeight: '700', marginTop: spacing.xs },
  section: { padding: spacing.base },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text, marginBottom: spacing.md },
  actionsRow: { flexDirection: 'row', gap: spacing.md },
  actionCard: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.base, alignItems: 'center', gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  actionIcon: { fontSize: 28 },
  actionLabel: { fontSize: fontSize.sm, fontWeight: '500', color: colors.text },
  taskCard: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  taskHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  taskTitle: { fontSize: fontSize.base, fontWeight: '500', color: colors.text, flex: 1, marginRight: spacing.sm },
  statusBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill },
  statusText: { fontSize: fontSize.xs, fontWeight: '600', textTransform: 'capitalize' },
  taskMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.xs },
  emptyText: { color: colors.textMuted, fontSize: fontSize.sm, fontStyle: 'italic' },
});
