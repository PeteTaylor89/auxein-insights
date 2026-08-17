// components/BlockPickerModal.js — Bottom-sheet block selector with search + property filter
import { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, Modal, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, fontSize, radius } from '../styles/theme';
import { getCompanyBlocksCached } from '../services/blocksCache';
import { byNatural } from '../utils/naturalSort';

export default function BlockPickerModal({ visible, onClose, onSelect, propertyId = null, selectedBlockId = null }) {
  const insets = useSafeAreaInsets();
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    // Cached: a block picker with nothing in it is a dead end for every flow
    // that opens it — observation capture and task creation both.
    getCompanyBlocksCached({
      onCached: (cached) => {
        if (Array.isArray(cached?.data)) setBlocks(cached.data);
      },
    })
      .then(data => {
        setBlocks(Array.isArray(data) ? data : []);
      })
      .catch(() => setBlocks([]))
      .finally(() => setLoading(false));
  }, [visible]);

  const filtered = useMemo(() => {
    let list = blocks;
    if (propertyId) {
      list = list.filter(b => b.property_id === propertyId || !b.property_id);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(b =>
        (b.block_name || '').toLowerCase().includes(q) ||
        (b.variety || '').toLowerCase().includes(q)
      );
    }
    // Natural sort on block_name so "Block 2" < "Block 10".
    return [...list].sort(byNatural('block_name'));
  }, [blocks, propertyId, search]);

  const handleSelect = (block) => {
    onSelect(block);
    setSearch('');
    onClose();
  };

  const handleClear = () => {
    onSelect(null);
    setSearch('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.sheet, { paddingBottom: spacing.lg + insets.bottom }]}
        >
          <View style={styles.handle} />

          <View style={styles.headerRow}>
            <Text style={styles.title}>Select block</Text>
            <TouchableOpacity onPress={handleClear} hitSlop={10}>
              <Text style={styles.clearText}>Clear</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.searchWrap}>
            <Feather name="search" size={16} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search by name or variety"
              placeholderTextColor={colors.textMuted}
              autoCorrect={false}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                <Feather name="x" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Feather name="grid" size={28} color={colors.textMuted} />
              <Text style={styles.emptyText}>
                {blocks.length === 0 ? 'No blocks available' : 'No blocks match your search'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={b => String(b.id)}
              renderItem={({ item }) => {
                const selected = item.id === selectedBlockId;
                return (
                  <TouchableOpacity
                    style={[styles.row, selected && styles.rowSelected]}
                    onPress={() => handleSelect(item)}
                  >
                    <View style={[styles.rowIconBox, selected && styles.rowIconBoxSelected]}>
                      <Feather
                        name="grid"
                        size={16}
                        color={selected ? colors.white : colors.primary}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {item.block_name || `Block #${item.id}`}
                      </Text>
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {[item.variety, item.area ? `${item.area} ha` : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                    {selected && <Feather name="check" size={18} color={colors.success} />}
                  </TouchableOpacity>
                );
              }}
              keyboardShouldPersistTaps="handled"
            />
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    // paddingBottom applied inline so we can add the Android gesture-bar inset
    maxHeight: '80%',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border,
    alignSelf: 'center', marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text },
  clearText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '500' },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    backgroundColor: colors.background, marginBottom: spacing.md,
  },
  searchInput: { flex: 1, fontSize: fontSize.base, color: colors.text, padding: 0 },

  loadingWrap: { paddingVertical: spacing.xl, alignItems: 'center' },
  emptyWrap: { paddingVertical: spacing.xl, alignItems: 'center', gap: spacing.sm },
  emptyText: { fontSize: fontSize.sm, color: colors.textMuted },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.md, paddingHorizontal: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  rowSelected: { backgroundColor: colors.gpsBg },
  rowIconBox: {
    width: 32, height: 32, borderRadius: radius.sm,
    backgroundColor: colors.primary + '14',
    alignItems: 'center', justifyContent: 'center',
  },
  rowIconBoxSelected: { backgroundColor: colors.success },
  rowName: { fontSize: fontSize.base, fontWeight: '500', color: colors.text },
  rowMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
});
