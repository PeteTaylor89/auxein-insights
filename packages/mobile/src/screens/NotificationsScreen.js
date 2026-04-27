// screens/NotificationsScreen.js — Notification list with mark-read
import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, fontSize, radius, shadows } from '../styles/theme';
import { notificationService } from '../api/services';

const TYPE_COLORS = {
  task: colors.info,
  incident: colors.danger,
  action: colors.warning,
  training: '#8b5cf6',
  visitor: '#059669',
  timesheet: '#6b7280',
  system: colors.primary,
};

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const data = await notificationService.getNotifications();
      setNotifications(data?.notifications || data || []);
    } catch (err) {
      console.log('Failed to load notifications:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadNotifications(); }, [loadNotifications]));

  const handleMarkRead = async (id) => {
    try {
      await notificationService.markRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch (err) {
      console.log('Failed to mark read:', err.message);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationService.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (err) {
      console.log('Failed to mark all read:', err.message);
    }
  };

  const timeAgo = (isoDate) => {
    if (!isoDate) return '';
    const mins = Math.floor((Date.now() - new Date(isoDate).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  const hasUnread = notifications.some(n => !n.read);

  const renderItem = ({ item }) => {
    const accent = TYPE_COLORS[item.type] || colors.textMuted;
    return (
      <TouchableOpacity
        style={[styles.card, item.read ? styles.cardRead : styles.cardUnread]}
        onPress={() => !item.read && handleMarkRead(item.id)}
        activeOpacity={item.read ? 1 : 0.7}
      >
        {!item.read && <View style={[styles.accentStrip, { backgroundColor: accent }]} />}

        <View style={styles.cardBody}>
          <View style={styles.cardHeader}>
            <View style={[styles.typeBadge, { backgroundColor: accent + '20' }]}>
              <Text style={[styles.typeText, { color: accent }]}>{item.type}</Text>
            </View>
            <Text style={styles.timeText}>{timeAgo(item.created_at)}</Text>
            {!item.read ? (
              <View style={[styles.unreadDot, { backgroundColor: accent }]} />
            ) : (
              <Text style={styles.readMark}>Read</Text>
            )}
          </View>
          <Text style={[styles.title, !item.read && styles.titleUnread, item.read && styles.titleRead]}>
            {item.title}
          </Text>
          {item.body && (
            <Text
              style={[styles.body, item.read && styles.bodyRead]}
              numberOfLines={2}
            >
              {item.body}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {hasUnread && (
        <TouchableOpacity style={styles.markAllBtn} onPress={handleMarkAllRead}>
          <Text style={styles.markAllText}>Mark all as read</Text>
        </TouchableOpacity>
      )}
      <FlatList
        data={notifications}
        keyExtractor={item => String(item.id)}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadNotifications} tintColor={colors.primary} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !loading && (
            <View style={styles.empty}>
              <Feather name="bell-off" size={40} color={colors.textMuted} />
              <Text style={styles.emptyText}>No notifications</Text>
              <Text style={styles.emptyHint}>You're all caught up</Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceWarm },
  markAllBtn: {
    padding: spacing.sm, paddingHorizontal: spacing.base,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
    alignItems: 'flex-end',
  },
  markAllText: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '600' },
  list: { padding: spacing.base, paddingBottom: spacing.xxl, gap: spacing.sm },

  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, overflow: 'hidden',
  },
  cardUnread: { borderColor: colors.border, ...shadows.card },
  cardRead: {
    borderColor: colors.borderLight, backgroundColor: colors.borderLight + '99',
    opacity: 0.78,
  },

  accentStrip: { width: 4 },
  cardBody: { flex: 1, padding: spacing.md },

  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  unreadDot: { width: 10, height: 10, borderRadius: 5 },
  readMark: { fontSize: 10, color: colors.textMuted, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5 },
  typeBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill },
  typeText: { fontSize: fontSize.xs, fontWeight: '600', textTransform: 'capitalize' },
  timeText: { fontSize: fontSize.xs, color: colors.textMuted, marginLeft: 'auto' },

  title: { fontSize: fontSize.base, color: colors.text },
  titleUnread: { fontWeight: '700', color: colors.text },
  titleRead: { fontWeight: '400', color: colors.textSecondary },
  body: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  bodyRead: { color: colors.textMuted },

  empty: { alignItems: 'center', paddingTop: spacing.xxl, gap: spacing.sm },
  emptyText: { fontSize: fontSize.md, color: colors.text, fontWeight: '600', marginTop: spacing.sm },
  emptyHint: { fontSize: fontSize.sm, color: colors.textMuted },
});
