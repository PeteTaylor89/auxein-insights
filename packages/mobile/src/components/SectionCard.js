import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fontSize, radius, shadows } from '../styles/theme';

export default function SectionCard({ icon, title, subtitle, badge, badgeColor, children, style }) {
  return (
    <View style={[styles.card, style]}>
      {(icon || title) && (
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {icon && (
              <View style={styles.iconBox}>
                <Feather name={icon} size={18} color={colors.success} />
              </View>
            )}
            <View>
              {title && <Text style={styles.title}>{title}</Text>}
              {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
            </View>
          </View>
          {badge && (
            <View style={[styles.badge, badgeColor === 'warning' && styles.badgeWarning]}>
              <View style={[styles.badgeDot, badgeColor === 'warning' && { backgroundColor: colors.warning }]} />
              <Text style={[styles.badgeText, badgeColor === 'warning' && { color: colors.warningDark }]}>{badge}</Text>
            </View>
          )}
        </View>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBox: {
    width: 36,
    height: 36,
    backgroundColor: colors.successBg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: fontSize.base + 1,
    fontWeight: '600',
    color: colors.text,
  },
  subtitle: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.warningBg,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.lg,
  },
  badgeWarning: {
    backgroundColor: colors.warningBg,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.warning,
  },
  badgeText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.warningDark,
  },
});
