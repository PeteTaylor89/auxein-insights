// components/TaskTemplatePickerModal.js — Bottom-sheet template selector for
// CreateTaskScreen. Lists active templates (optionally filtered to
// quick_create_enabled), searchable by name + category. On select, returns
// the full template object to the parent so it can pre-fill the form.

import { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, Modal, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, fontSize, radius } from '../styles/theme';
import { tasksService } from '../api/services';

const CATEGORY_ICONS = {
  vineyard: 'grid',
  land_management: 'map',
  asset_management: 'package',
  compliance: 'shield',
  general: 'clipboard',
};

export default function TaskTemplatePickerModal({ visible, onClose, onSelect }) {
  const insets = useSafeAreaInsets();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    tasksService.listTaskTemplates({ is_active: true })
      .then((data) => setTemplates(Array.isArray(data) ? data : []))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  }, [visible]);

  const filtered = useMemo(() => {
    if (!search.trim()) return templates;
    const q = search.trim().toLowerCase();
    return templates.filter((t) =>
      (t.name || '').toLowerCase().includes(q) ||
      (t.task_subcategory || '').toLowerCase().includes(q) ||
      (t.task_category || '').toLowerCase().includes(q),
    );
  }, [templates, search]);

  const handleSelect = (template) => {
    onSelect(template);
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
            <Text style={styles.title}>Start from template</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Feather name="x" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchWrap}>
            <Feather name="search" size={16} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search by name or category"
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
              <Feather name="layers" size={28} color={colors.textMuted} />
              <Text style={styles.emptyText}>
                {templates.length === 0 ? 'No templates yet' : 'No templates match your search'}
              </Text>
              <Text style={styles.emptyHint}>
                Templates are created on the web app under Observations → Task Templates.
              </Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(t) => String(t.id)}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => handleSelect(item)}
                  activeOpacity={0.75}
                >
                  <View style={styles.rowIconBox}>
                    <Feather
                      name={CATEGORY_ICONS[item.task_category] || 'clipboard'}
                      size={16}
                      color={colors.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {[
                        (item.task_category || '').replace(/_/g, ' '),
                        item.task_subcategory,
                        item.requires_gps_tracking ? 'GPS' : null,
                      ].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              )}
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
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    maxHeight: '85%',
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

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    backgroundColor: colors.background, marginBottom: spacing.md,
  },
  searchInput: { flex: 1, fontSize: fontSize.base, color: colors.text, paddingVertical: 0 },

  loadingWrap: { paddingVertical: spacing.xl, alignItems: 'center' },
  emptyWrap: { paddingVertical: spacing.xl, alignItems: 'center', gap: spacing.sm },
  emptyText: { fontSize: fontSize.base, color: colors.text, fontWeight: '600' },
  emptyHint: { fontSize: fontSize.xs, color: colors.textMuted, textAlign: 'center', paddingHorizontal: spacing.lg },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.md, paddingHorizontal: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  rowIconBox: {
    width: 32, height: 32, borderRadius: radius.sm,
    backgroundColor: colors.gpsBg,
    alignItems: 'center', justifyContent: 'center',
  },
  rowName: { fontSize: fontSize.base, color: colors.text, fontWeight: '500' },
  rowMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2, textTransform: 'capitalize' },
});
