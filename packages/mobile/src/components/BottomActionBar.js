import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, fontSize, radius } from '../styles/theme';

export default function BottomActionBar({ primaryLabel, primaryIcon, onPrimary, secondaryLabel, secondaryIcon, onSecondary, primaryColor = 'green', disabled = false }) {
  const insets = useSafeAreaInsets();
  const primaryBg = primaryColor === 'red'
    ? { backgroundColor: colors.danger }
    : { backgroundColor: colors.success };

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      {secondaryLabel && (
        <TouchableOpacity style={styles.btnSecondary} onPress={onSecondary} activeOpacity={0.7}>
          {secondaryIcon && <Feather name={secondaryIcon} size={18} color={colors.textSecondary} />}
          <Text style={styles.btnSecondaryText}>{secondaryLabel}</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={[styles.btnPrimary, primaryBg, disabled && styles.btnDisabled]}
        onPress={onPrimary}
        activeOpacity={0.7}
        disabled={disabled}
      >
        {primaryIcon && <Feather name={primaryIcon} size={18} color={colors.white} />}
        <Text style={styles.btnPrimaryText}>{primaryLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: spacing.base,
    paddingTop: 12,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  btnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
  },
  btnPrimaryText: {
    fontSize: fontSize.base + 1,
    fontWeight: '600',
    color: colors.white,
  },
  btnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: colors.borderLight,
  },
  btnSecondaryText: {
    fontSize: fontSize.base + 1,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
