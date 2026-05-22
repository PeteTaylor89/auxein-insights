import { View, Text, StyleSheet } from 'react-native';
import { getTaskStatusMeta } from '@vineyard/shared';
import { colors, fontSize, radius, spacing } from '../styles/theme';

const TONE_COLORS = {
  muted:   { bg: colors.surfaceWarm, fg: colors.textMuted },
  info:    { bg: colors.infoBg,      fg: colors.info       },
  warning: { bg: colors.warningBg,   fg: colors.warningDark },
  success: { bg: colors.successBg,   fg: colors.success    },
  danger:  { bg: colors.dangerBg,    fg: colors.danger     },
};

export default function TaskStatusBadge({ status, size = 'md', style }) {
  const meta = getTaskStatusMeta(status);
  const tone = TONE_COLORS[meta.tone] || TONE_COLORS.muted;
  const sizing = size === 'sm' ? styles.sm : styles.md;
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }, sizing, style]}>
      <Text style={[styles.text, { color: tone.fg }, size === 'sm' && styles.textSm]}>
        {meta.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  sm: { paddingHorizontal: spacing.sm, paddingVertical: 2 },
  md: { paddingHorizontal: spacing.md, paddingVertical: 4 },
  text: { fontSize: fontSize.xs, fontWeight: '700' },
  textSm: { fontSize: 10 },
});
