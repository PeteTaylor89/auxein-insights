// components/MapRiskSheet.js — Bottom-sheet shown when the user taps a risk
// marker on the Map. Shows title, category/type, level chips (inherent +
// residual), location notes. No mobile RiskDetail screen yet, so the CTA is
// hidden until that lands; the sheet acts as the read-only field surface.

import { View, Text, Modal, StyleSheet, Pressable, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fontSize, radius } from '../styles/theme';

const LEVEL_STYLE = {
  low:      { bg: '#dcfce7', fg: '#166534', label: 'Low' },
  medium:   { bg: '#fef3c7', fg: '#92400e', label: 'Medium' },
  high:     { bg: '#ffedd5', fg: '#9a3412', label: 'High' },
  critical: { bg: '#fee2e2', fg: '#991b1b', label: 'Critical' },
};

function LevelChip({ level, prefix }) {
  if (!level) return null;
  const s = LEVEL_STYLE[String(level).toLowerCase()] || { bg: colors.borderLight, fg: colors.text, label: level };
  return (
    <View style={[styles.chip, { backgroundColor: s.bg }]}>
      <Text style={[styles.chipText, { color: s.fg }]}>
        {prefix ? `${prefix}: ` : ''}{s.label}
      </Text>
    </View>
  );
}

export default function MapRiskSheet({ visible, risk, onClose }) {
  const insets = useSafeAreaInsets();
  if (!risk) return null;

  const titleText = risk.risk_title || `Risk #${risk.id}`;
  const subtitle = [
    (risk.risk_category || '').replace(/_/g, ' '),
    (risk.risk_type || '').replace(/_/g, ' '),
  ].filter(Boolean).join(' · ') || '—';

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
              <Feather name="alert-triangle" size={18} color={colors.danger} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={2}>{titleText}</Text>
              <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Feather name="x" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.chipRow}>
            <LevelChip level={risk.inherent_risk_level} prefix="Inherent" />
            {risk.residual_risk_level && (
              <LevelChip level={risk.residual_risk_level} prefix="Residual" />
            )}
          </View>

          {risk.location_description ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Location notes</Text>
              <Text style={styles.sectionBody}>{risk.location_description}</Text>
            </View>
          ) : null}

          <View style={styles.metaRow}>
            <Feather name="info" size={12} color={colors.textMuted} />
            <Text style={styles.metaText}>
              Status: {risk.status || 'active'}
              {risk.property_id ? ` · Property #${risk.property_id}` : ' · Company-wide'}
            </Text>
          </View>
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
    maxHeight: '70%',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center', marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  iconBox: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: colors.dangerBg,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text },
  subtitle: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2, textTransform: 'capitalize' },

  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  chip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  chipText: { fontSize: fontSize.xs, fontWeight: '600' },

  section: { marginBottom: spacing.md },
  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  sectionBody: {
    fontSize: fontSize.sm,
    color: colors.text,
    lineHeight: 20,
  },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  metaText: { fontSize: fontSize.xs, color: colors.textMuted },
});
