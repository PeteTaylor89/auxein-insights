// components/MapLayerSheet.js — Bottom-sheet for toggling Map layers on/off.
// Driven by useLayerVisibility state in the parent screen.

import { View, Text, Modal, StyleSheet, Pressable, Switch, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fontSize, radius } from '../styles/theme';

const LAYERS = [
  { key: 'blocks', label: 'Blocks',  description: 'Vineyard polygons', icon: 'grid' },
  { key: 'tasks',  label: 'Tasks',   description: 'Open-task count badges on blocks', icon: 'check-square' },
  { key: 'assets', label: 'Assets',  description: 'Equipment, vehicles, infrastructure', icon: 'package' },
  { key: 'risks',  label: 'Risks',   description: 'Active site hazards', icon: 'alert-triangle' },
];

export default function MapLayerSheet({ visible, layers, onToggle, onClose }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: spacing.xl + insets.bottom }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Map layers</Text>
              <Text style={styles.subtitle}>Toggle what's shown on the map</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Feather name="x" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {LAYERS.map((layer) => {
            const isOn = !!layers?.[layer.key];
            return (
              <View key={layer.key} style={styles.row}>
                <View style={styles.iconBox}>
                  <Feather name={layer.icon} size={18} color={isOn ? colors.primary : colors.textMuted} />
                </View>
                <View style={styles.rowMain}>
                  <Text style={styles.rowLabel}>{layer.label}</Text>
                  <Text style={styles.rowDescription} numberOfLines={1}>{layer.description}</Text>
                </View>
                <Switch
                  value={isOn}
                  onValueChange={() => onToggle?.(layer.key)}
                  trackColor={{ false: colors.border, true: colors.primary + '66' }}
                  thumbColor={isOn ? colors.primary : '#f3f4f6'}
                />
              </View>
            );
          })}

          <Text style={styles.footnote}>
            Your choices are remembered next time you open the map.
          </Text>
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
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center', marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
  },
  title: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text },
  subtitle: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  iconBox: {
    width: 36, height: 36, borderRadius: radius.md,
    backgroundColor: colors.primary + '14',
    alignItems: 'center', justifyContent: 'center',
  },
  rowMain: { flex: 1 },
  rowLabel: { fontSize: fontSize.base, fontWeight: '500', color: colors.text },
  rowDescription: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },

  footnote: {
    marginTop: spacing.md,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
