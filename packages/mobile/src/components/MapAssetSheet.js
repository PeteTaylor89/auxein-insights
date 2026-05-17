// components/MapAssetSheet.js — Bottom-sheet shown when the user taps an asset
// on the Map. Light summary (name, asset number, category, status, location
// notes) + a "View details" CTA that navigates into the existing AssetDetail
// screen.
//
// Accepts both flavours of input — the geojson feature properties (id, name,
// asset_number, category, subcategory, status, location_label) and the full
// asset DTO from /assets/{id}. Both surface the same summary fields.

import { View, Text, Modal, StyleSheet, Pressable, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fontSize, radius } from '../styles/theme';

const STATUS_COLOR = {
  active: colors.success,
  maintenance: colors.warning,
  retired: colors.textMuted,
  disposed: colors.danger,
  out_of_stock: colors.danger,
};

const CATEGORY_ICON = {
  vehicle: 'truck',
  equipment: 'tool',
  tool: 'tool',
  consumable: 'droplet',
  infrastructure: 'home',
};

export default function MapAssetSheet({ visible, asset, onClose, onViewDetails }) {
  const insets = useSafeAreaInsets();
  if (!asset) return null;

  const categoryIcon = CATEGORY_ICON[asset.category] || 'package';
  const statusColor = STATUS_COLOR[asset.status] || colors.textMuted;
  const subtitle = [asset.category, asset.subcategory].filter(Boolean).join(' / ');

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
              <Feather name={categoryIcon} size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>
                {asset.name || `Asset #${asset.id}`}
              </Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {asset.asset_number ? `#${asset.asset_number}` : null}
                {asset.asset_number && subtitle ? ' · ' : ''}
                {subtitle || (asset.asset_number ? '' : '—')}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Feather name="x" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {asset.status && (
            <View style={styles.chipRow}>
              <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                <Text style={[styles.statusText, { color: statusColor }]}>
                  {String(asset.status).replace(/_/g, ' ')}
                </Text>
              </View>
            </View>
          )}

          {asset.location_label ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Location notes</Text>
              <Text style={styles.sectionBody}>{asset.location_label}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={styles.detailsBtn}
            onPress={onViewDetails}
            accessibilityLabel="View asset details"
          >
            <Text style={styles.detailsBtnText}>View details</Text>
            <Feather name="chevron-right" size={18} color={colors.white} />
          </TouchableOpacity>
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
    backgroundColor: colors.primary + '14',
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
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: fontSize.xs, fontWeight: '600', textTransform: 'capitalize' },

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

  detailsBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  detailsBtnText: { color: colors.white, fontSize: fontSize.base, fontWeight: '600' },
});
