// screens/ProfileScreen.js — User profile, notifications, stats, app info
import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { notificationService } from '../api/services';
import { colors, spacing, fontSize, radius } from '../styles/theme';

export default function ProfileScreen() {
  const { user, userTypeRole, logout } = useAuth();
  const navigation = useNavigation();
  const [unreadCount, setUnreadCount] = useState(0);

  useFocusEffect(useCallback(() => {
    notificationService.getUnreadCount()
      .then(data => setUnreadCount(data?.count ?? 0))
      .catch(() => {});
  }, []));

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(user?.first_name?.[0] || user?.username?.[0] || '?').toUpperCase()}
          </Text>
        </View>
        <Text style={styles.name}>{user?.first_name} {user?.last_name}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{(userTypeRole || 'user').replace(/_/g, ' ')}</Text>
        </View>
      </View>

      {/* Notifications */}
      <TouchableOpacity style={styles.notifRow} onPress={() => navigation.navigate('Notifications')}>
        <Text style={styles.notifIcon}>🔔</Text>
        <Text style={styles.notifLabel}>Notifications</Text>
        {unreadCount > 0 && (
          <View style={styles.notifBadge}>
            <Text style={styles.notifBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
          </View>
        )}
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>

      {/* User Info */}
      <View style={styles.section}>
        <Field label="Username" value={user?.username} />
        <Field label="Company" value={user?.company?.name || `Company #${user?.company_id}`} />
        <Field label="Phone" value={user?.phone || 'Not set'} />
        <Field label="Last Login" value={
          user?.last_login
            ? new Date(user.last_login).toLocaleDateString('en-NZ', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
            : 'Never'
        } />
      </View>

      {/* App Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>App Info</Text>
        <Field label="Version" value="1.0.0" />
        <Field label="Server" value="api.auxein.co.nz" />
        <View style={styles.webNote}>
          <Text style={styles.webNoteText}>Full company management, reports, and maps available on the web app</Text>
        </View>
      </View>

      {/* Sign Out */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: spacing.xxl }} />
    </ScrollView>
  );
}

function Field({ label, value }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value || '-'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceWarm },
  header: { alignItems: 'center', padding: spacing.lg, paddingTop: spacing.xl, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  avatar: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center',
    marginBottom: spacing.md,
  },
  avatarText: { fontSize: fontSize.xl, fontWeight: '700', color: colors.white },
  name: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text },
  email: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.xs },
  roleBadge: {
    marginTop: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    backgroundColor: colors.oliveLight, borderRadius: radius.pill,
  },
  roleText: { fontSize: fontSize.xs, fontWeight: '600', color: colors.primary, textTransform: 'capitalize' },

  // Notifications row
  notifRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    margin: spacing.base, marginBottom: 0, backgroundColor: colors.surface,
    borderRadius: radius.lg, padding: spacing.base,
    borderWidth: 1, borderColor: colors.border,
  },
  notifIcon: { fontSize: 20 },
  notifLabel: { flex: 1, fontSize: fontSize.base, fontWeight: '500', color: colors.text },
  notifBadge: {
    backgroundColor: colors.danger, borderRadius: radius.pill,
    paddingHorizontal: spacing.sm, paddingVertical: 2, minWidth: 22, alignItems: 'center',
  },
  notifBadgeText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.white },
  chevron: { fontSize: 20, color: colors.textMuted, fontWeight: '300' },

  // Sections
  section: {
    margin: spacing.base, marginBottom: 0, backgroundColor: colors.surface,
    borderRadius: radius.lg, padding: spacing.base,
    borderWidth: 1, borderColor: colors.border,
  },
  sectionTitle: { fontSize: fontSize.base, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  field: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  fieldLabel: { fontSize: fontSize.sm, color: colors.textMuted },
  fieldValue: { fontSize: fontSize.sm, fontWeight: '500', color: colors.text },
  webNote: {
    marginTop: spacing.sm, padding: spacing.sm,
    backgroundColor: colors.infoBg, borderRadius: radius.sm,
  },
  webNoteText: { fontSize: fontSize.xs, color: colors.info, textAlign: 'center' },

  // Actions
  actions: { padding: spacing.base },
  logoutBtn: {
    backgroundColor: colors.accent, borderRadius: radius.md,
    padding: spacing.base, alignItems: 'center',
  },
  logoutText: { color: colors.white, fontSize: fontSize.md, fontWeight: '600' },
});
