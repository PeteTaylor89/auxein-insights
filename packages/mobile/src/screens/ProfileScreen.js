// screens/ProfileScreen.js — User profile + logout
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { colors, spacing, fontSize, radius } from '../styles/theme';

export default function ProfileScreen() {
  const { user, userTypeRole, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <ScrollView style={styles.container}>
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

      <View style={styles.actions}>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
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
  section: {
    margin: spacing.base, backgroundColor: colors.surface,
    borderRadius: radius.lg, padding: spacing.base,
    borderWidth: 1, borderColor: colors.border,
  },
  field: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  fieldLabel: { fontSize: fontSize.sm, color: colors.textMuted },
  fieldValue: { fontSize: fontSize.sm, fontWeight: '500', color: colors.text },
  actions: { padding: spacing.base },
  logoutBtn: {
    backgroundColor: colors.accent, borderRadius: radius.md,
    padding: spacing.base, alignItems: 'center',
  },
  logoutText: { color: colors.white, fontSize: fontSize.md, fontWeight: '600' },
});
