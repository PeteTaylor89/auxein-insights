// screens/AssetsScreen.js — Read-only asset list with category filters
import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, fontSize, radius, shadows } from '../styles/theme';
import { assetService } from '../api/services';
import { ASSET_CATEGORY_ICONS, SkeletonCard } from '../components';

const CATEGORIES = [
  { key: 'all',            label: 'All' },
  { key: 'equipment',      label: 'Equipment' },
  { key: 'vehicle',        label: 'Vehicles' },
  { key: 'infrastructure', label: 'Infrastructure' },
  { key: 'consumable',     label: 'Consumables' },
  { key: 'tool',           label: 'Tools' },
];

const STATUS_COLORS = {
  active: colors.success,
  maintenance: colors.warning,
  retired: colors.textMuted,
  disposed: colors.danger,
  out_of_stock: colors.danger,
};

export default function AssetsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');

  const loadAssets = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (category !== 'all') params.category = category;
      const data = await assetService.listAssets(params);
      setAssets(Array.isArray(data) ? data : []);
    } catch (err) {
      console.log('Failed to load assets:', err.message);
    } finally {
      setLoading(false);
    }
  }, [category]);

  useFocusEffect(useCallback(() => { loadAssets(); }, [loadAssets]));

  const renderAsset = ({ item }) => {
    const iconName = ASSET_CATEGORY_ICONS[item.category] || 'package';
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('AssetDetail', { assetId: item.id })}
        activeOpacity={0.75}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardIconBox}>
            <Feather name={iconName} size={18} color={colors.primary} />
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.cardNumber}>#{item.asset_number}</Text>
          </View>
          <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[item.status] || colors.textMuted }]} />
        </View>
        <View style={styles.cardMeta}>
          {item.location_label && (
            <View style={styles.metaRow}>
              <Feather name="map-pin" size={11} color={colors.textMuted} />
              <Text style={styles.cardMetaText}>{item.location_label}</Text>
            </View>
          )}
          {item.asset_type === 'consumable' && item.current_stock != null && (
            <View style={styles.metaRow}>
              <Feather name="droplet" size={11} color={colors.textMuted} />
              <Text style={styles.cardMetaText}>
                Stock: {item.current_stock}{item.unit_of_measure ? ` ${item.unit_of_measure}` : ''}
              </Text>
            </View>
          )}
          {item.make && (
            <View style={styles.metaRow}>
              <Feather name="tag" size={11} color={colors.textMuted} />
              <Text style={styles.cardMetaText}>{item.make}{item.model ? ` ${item.model}` : ''}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Category pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterContent}
      >
        {CATEGORIES.map(cat => {
          const isActive = category === cat.key;
          return (
            <TouchableOpacity
              key={cat.key}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
              onPress={() => setCategory(cat.key)}
            >
              <Feather
                name={ASSET_CATEGORY_ICONS[cat.key] || 'package'}
                size={16}
                color={isActive ? colors.white : colors.textMuted}
              />
              <Text style={[styles.filterLabel, isActive && styles.filterLabelActive]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading && assets.length === 0 ? (
        <View style={styles.list}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : (
        <FlatList
          data={assets}
          keyExtractor={item => String(item.id)}
          renderItem={renderAsset}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={loadAssets} tintColor={colors.primary} />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            !loading && (
              <View style={styles.empty}>
                <Feather name="package" size={40} color={colors.textMuted} />
                <Text style={styles.emptyText}>No assets found</Text>
                <Text style={styles.emptyHint}>Tap + to register a new asset</Text>
              </View>
            )
          }
        />
      )}

      {/* Create FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: spacing.lg + insets.bottom }]}
        onPress={() => navigation.navigate('CreateAsset')}
        activeOpacity={0.85}
      >
        <Feather name="plus" size={24} color={colors.white} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // Filter pills
  filterRow: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, maxHeight: 60 },
  filterContent: { paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, gap: spacing.xs, alignItems: 'center' },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: spacing.base, paddingVertical: 9,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterLabel: { fontSize: fontSize.sm, color: colors.text, fontWeight: '500' },
  filterLabelActive: { color: colors.white, fontWeight: '600' },

  // List
  list: { padding: spacing.base, paddingBottom: spacing.xxl, gap: spacing.sm },

  // Card
  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardIconBox: {
    width: 36, height: 36, borderRadius: radius.md,
    backgroundColor: colors.primary + '14',
    alignItems: 'center', justifyContent: 'center',
  },
  cardInfo: { flex: 1 },
  cardName: { fontSize: fontSize.base, fontWeight: '600', color: colors.text },
  cardNumber: { fontSize: fontSize.xs, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  statusDot: { width: 10, height: 10, borderRadius: 5 },

  cardMeta: { marginTop: spacing.sm, marginLeft: 44, gap: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardMetaText: { fontSize: fontSize.xs, color: colors.textMuted },

  // Empty
  empty: { alignItems: 'center', paddingTop: spacing.xxl, gap: spacing.xs },
  emptyText: { fontSize: fontSize.md, color: colors.text, fontWeight: '600', marginTop: spacing.sm },
  emptyHint: { fontSize: fontSize.sm, color: colors.textMuted },

  // FAB
  fab: {
    position: 'absolute', bottom: spacing.lg, right: spacing.lg,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    ...shadows.elevated,
  },
});
