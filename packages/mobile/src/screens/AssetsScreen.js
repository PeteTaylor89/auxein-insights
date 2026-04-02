// screens/AssetsScreen.js — Read-only asset list with category filters
import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, fontSize, radius } from '../styles/theme';
import { assetService } from '../api/services';

const CATEGORIES = [
  { key: 'all', label: 'All', icon: '📦' },
  { key: 'equipment', label: 'Equipment', icon: '⚙️' },
  { key: 'vehicle', label: 'Vehicles', icon: '🚜' },
  { key: 'infrastructure', label: 'Infrastructure', icon: '🏗️' },
  { key: 'consumable', label: 'Consumables', icon: '🧪' },
  { key: 'tool', label: 'Tools', icon: '🔧' },
];

const STATUS_COLORS = {
  active: colors.success,
  maintenance: colors.warning,
  retired: colors.textMuted,
  disposed: colors.danger,
  out_of_stock: colors.danger,
};

export default function AssetsScreen({ navigation }) {
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

  const categoryIcon = (cat) => CATEGORIES.find(c => c.key === cat)?.icon || '📦';

  const renderAsset = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('AssetDetail', { assetId: item.id })}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardIcon}>{categoryIcon(item.category)}</Text>
        <View style={styles.cardInfo}>
          <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.cardNumber}>#{item.asset_number}</Text>
        </View>
        <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[item.status] || colors.textMuted }]} />
      </View>
      <View style={styles.cardMeta}>
        {item.location_label && <Text style={styles.cardMetaText}>{item.location_label}</Text>}
        {item.asset_type === 'consumable' && item.current_stock != null && (
          <Text style={styles.cardMetaText}>
            Stock: {item.current_stock}{item.unit_of_measure ? ` ${item.unit_of_measure}` : ''}
          </Text>
        )}
        {item.make && <Text style={styles.cardMetaText}>{item.make}{item.model ? ` ${item.model}` : ''}</Text>}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Category filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterContent}>
        {CATEGORIES.map(cat => (
          <TouchableOpacity
            key={cat.key}
            style={[styles.filterChip, category === cat.key && styles.filterChipActive]}
            onPress={() => setCategory(cat.key)}
          >
            <Text style={styles.filterIcon}>{cat.icon}</Text>
            <Text style={[styles.filterLabel, category === cat.key && styles.filterLabelActive]}>{cat.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={assets}
        keyExtractor={item => String(item.id)}
        renderItem={renderAsset}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadAssets} tintColor={colors.primary} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !loading && (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📦</Text>
              <Text style={styles.emptyText}>No assets found</Text>
              <Text style={styles.emptyHint}>Manage assets on the web app</Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceWarm },
  filterRow: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, maxHeight: 52 },
  filterContent: { paddingHorizontal: spacing.sm, gap: spacing.xs, alignItems: 'center' },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterIcon: { fontSize: 14 },
  filterLabel: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '500' },
  filterLabelActive: { color: colors.white },
  list: { padding: spacing.base, paddingBottom: spacing.xxl },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardIcon: { fontSize: 20 },
  cardInfo: { flex: 1 },
  cardName: { fontSize: fontSize.base, fontWeight: '600', color: colors.text },
  cardNumber: { fontSize: fontSize.xs, color: colors.textMuted },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  cardMeta: { marginTop: spacing.xs, marginLeft: 32, gap: 2 },
  cardMetaText: { fontSize: fontSize.xs, color: colors.textMuted },
  empty: { alignItems: 'center', paddingTop: spacing.xxl },
  emptyIcon: { fontSize: 40, marginBottom: spacing.md },
  emptyText: { fontSize: fontSize.md, color: colors.text, fontWeight: '500' },
  emptyHint: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.xs },
});
